import { sql, connectToDatabase } from '../../dbconfig';

export default async function handler(req, res) {
    console.log(`Solicitud ${req.method} recibida para pedido: ${req.query.numeroPedido || req.body.pedidoId}`);

    if (req.method === 'GET') {
        try {
            const numeroPedido = req.query.pedidoId || req.query.numeroPedido || req.query.id;
            if (!numeroPedido) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Número de pedido es requerido'
                });
            }

            const pool = await connectToDatabase();

            // 1. Consulta para obtener información básica del pedido
            const pedidoQuery = `
                SELECT 
                    p.numeroPedido,
                    p.Origen,
                    p.Destino,
                    p.Estatus,
                    CONVERT(varchar, p.Fecha_Creacion, 120) AS Fecha_Creacion,
                    CONVERT(varchar, p.Fecha_Compromiso, 120) AS Fecha_Compromiso,
                    CONVERT(varchar, p.Fecha_Entrega, 120) AS Fecha_Entrega,
                    p.Observaciones,
                    ao.CNOMBREALMACEN AS NombreOrigen,
                    ad.CNOMBREALMACEN AS NombreDestino
                FROM Pedidos p
                LEFT JOIN admAlmacenes ao ON p.Origen = ao.CCODIGOALMACEN
                LEFT JOIN admAlmacenes ad ON p.Destino = ad.CCODIGOALMACEN
                WHERE p.numeroPedido = @numeroPedido
                GROUP BY p.numeroPedido, p.Origen, p.Destino, p.Estatus, 
                         p.Fecha_Creacion, p.Fecha_Compromiso, p.Fecha_Entrega, 
                         p.Observaciones, ao.CNOMBREALMACEN, ad.CNOMBREALMACEN
            `;
            
            const pedidoResult = await pool.request()
                .input('numeroPedido', sql.NVarChar, numeroPedido)
                .query(pedidoQuery);

            if (pedidoResult.recordset.length === 0) {
                return res.status(404).json({ 
                    success: false,
                    message: `Pedido ${numeroPedido} no encontrado`
                });
            }

            const pedido = pedidoResult.recordset[0];

            // 2. Consulta para obtener productos con el formato específico
            const productosQuery = `
                SELECT 
                    p.*,
                    CASE 
                        WHEN CHARINDEX(',', p.nombre_producto) > 0 
                        THEN LTRIM(SUBSTRING(p.nombre_producto, CHARINDEX(',', p.nombre_producto) + 1, LEN(p.nombre_producto)))
                        ELSE p.nombre_producto
                    END AS CNOMBREPRODUCTO,
                    
                    CASE
                        -- Si ya tiene un código asignado, lo tomamos tal cual (con números si los tiene)
                        WHEN ap.CCODIGOPRODUCTO IS NOT NULL THEN ap.CCODIGOPRODUCTO
                        -- Si no, buscamos un código similar en admProductos (incluyendo números)
                        ELSE (
                            SELECT TOP 1 
                                ap2.CCODIGOPRODUCTO
                            FROM admProductos ap2 
                            WHERE ap2.CNOMBREPRODUCTO LIKE 
                                SUBSTRING(p.nombre_producto, 1, 
                                    CASE WHEN CHARINDEX(',', p.nombre_producto) > 0 
                                    THEN CHARINDEX(',', p.nombre_producto) - 1 
                                    ELSE LEN(p.nombre_producto) END) + '%'
                            AND ap2.CIDPRODUCTO <> p.Producto
                            ORDER BY ap2.CCODIGOPRODUCTO  -- Prioriza códigos más cortos (por si hay variantes)
                        )
                    END AS CCODIGOPRODUCTO,
                    
                    ao.CNOMBREALMACEN AS NombreOrigen,
                    ad.CNOMBREALMACEN AS NombreDestino
                FROM Pedidos p
                LEFT JOIN admProductos ap ON p.Producto = ap.CIDPRODUCTO
                LEFT JOIN admAlmacenes ao ON p.Origen = ao.CCODIGOALMACEN
                LEFT JOIN admAlmacenes ad ON p.Destino = ad.CCODIGOALMACEN
                WHERE p.NumeroPedido = @numeroPedido
                AND (
                        -- Solo incluir productos que tienen coma en el nombre (variantes)
                        CHARINDEX(',', p.nombre_producto) > 0
                        -- O si no tienen coma pero no son los productos base específicos que quieres excluir
                        OR (
                            CHARINDEX(',', p.nombre_producto) = 0
                            AND p.nombre_producto NOT IN (
                                'Cubierta Cubytop Antiderrame Lisa',
                                'Cubierta Cubytop Antiderrame Cantera'
                                -- Agrega aquí otros nombres de productos base que quieres excluir
                            )
                        )
                    )
                ORDER BY p.Producto;
            `;

            const productosResult = await pool.request()
                .input('numeroPedido', sql.NVarChar, numeroPedido)
                .query(productosQuery);

            // Si el pedido ya está recibido, buscar devoluciones en observaciones
            let devoluciones = [];
            if (pedido.Estatus === 'Recibido') {
                try {
                    const observacionesJson = pedido.Observaciones?.match(/\{.*\}/)?.[0];
                    if (observacionesJson) {
                        devoluciones = JSON.parse(observacionesJson).devoluciones || [];
                    }
                } catch (e) {
                    console.error('Error al parsear devoluciones:', e);
                }

                return res.status(200).json({
                    success: true,
                    message: 'Pedido ya recibido',
                    recibido: true,
                    pedido: {
                        numero: pedido.numeroPedido,
                        estatus: pedido.Estatus,
                        fechaRecepcion: pedido.Fecha_Entrega,
                        origen: pedido.Origen,
                        destino: pedido.Destino,
                        NombreOrigen: pedido.NombreOrigen,
                        NombreDestino: pedido.NombreDestino,
                        recibidoPor: pedido.Observaciones?.replace(/Recibido por:|\{.*\}/g, '')?.trim() || 'Desconocido'
                    },
                    devoluciones: devoluciones
                });
            }

            return res.status(200).json({
                success: true,
                pedido: {
                    numero: pedido.numeroPedido,
                    origen: pedido.Origen,
                    destino: pedido.Destino,
                    NombreOrigen: pedido.NombreOrigen,
                    NombreDestino: pedido.NombreDestino,
                    estatus: pedido.Estatus,
                    fechaCreacion: pedido.Fecha_Creacion,
                    fechaCompromiso: pedido.Fecha_Compromiso,
                    fechaEntrega: pedido.Fecha_Entrega,
                    observaciones: pedido.Observaciones,
                },
                productos: productosResult.recordset,
                recibido: false
            });

        } catch (err) {
            console.error('Error al obtener pedido:', err);
            return res.status(500).json({ 
                success: false,
                message: 'Error al procesar la solicitud'
            });
        }
    }

    if (req.method === 'POST') {
        try {
            const { pedidoId, usuario, password, productosDevueltos = [] } = req.body;
            
            if (!pedidoId || !usuario || !password) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Datos incompletos (se requieren pedidoId, usuario y password)'
                });
            }

            const pool = await connectToDatabase();

            // Validar credenciales de usuario
            const usuarioResult = await pool.request()
                .input('usuario', sql.NVarChar, usuario)
                .input('password', sql.NVarChar, password)
                .query(`
                    SELECT * FROM UsuariosLocal
                    WHERE correo = @usuario 
                    AND contraseña = @password
                    AND Rol IN ('Admin', 'Supervisor')
                `);

            if (usuarioResult.recordset.length === 0) {
                return res.status(401).json({ 
                    success: false,
                    message: 'Credenciales inválidas o no tiene permisos suficientes'
                });
            }

            const usuarioInfo = usuarioResult.recordset[0];

            // Actualizar pedido como recibido
            const observaciones = `Recibido por: ${usuarioInfo.Nombre} (${usuarioInfo.Rol})`;
            const observacionesConDevoluciones = productosDevueltos.length > 0
                ? `${observaciones} ${JSON.stringify({ devoluciones: productosDevueltos })}`
                : observaciones;

            const updateResult = await pool.request()
                .input('numeroPedido', sql.NVarChar, pedidoId)
                .input('observaciones', sql.NVarChar, observacionesConDevoluciones)
                .query(`
                    UPDATE Pedidos 
                    SET 
                        Estatus = 'Recibido',
                        Fecha_Entrega = GETDATE(),
                        Observaciones = @observaciones
                    WHERE numeroPedido = @numeroPedido
                `);

            if (updateResult.rowsAffected[0] === 0) {
                return res.status(404).json({ 
                    success: false,
                    message: `Pedido ${pedidoId} no encontrado`
                });
            }

            return res.status(200).json({ 
                success: true,
                message: 'Pedido recibido correctamente',
                productosDevueltos: productosDevueltos.length
            });

        } catch (err) {
            console.error('Error al confirmar recepción:', err);
            return res.status(500).json({ 
                success: false,
                message: 'Error al confirmar recepción'
            });
        }
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({
        success: false,
        message: `Método ${req.method} no permitido`
    });
}