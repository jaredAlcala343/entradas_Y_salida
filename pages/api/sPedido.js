import { sql, connectToDatabase } from '../../dbconfig';

// Función optimizada para procesar nombres de productos
const procesarNombreProducto = (nombreProducto) => {
    if (!nombreProducto || nombreProducto.toLowerCase() === "null") {
        return { nombreBase: "Producto desconocido", caracteristicas: "" };
    }

    const partes = nombreProducto.split(",")
        .map(p => p.trim())
        .filter(p => p && p.toLowerCase() !== "null");

    if (partes.length === 0) {
        return { nombreBase: "Producto desconocido", caracteristicas: "" };
    }

    const nombreBase = partes[0];
    const caracteristicas = partes.slice(1).join(", ");

    return { nombreBase, caracteristicas };
};

export default async function handler(req, res) {
    // Validación básica de la solicitud
    if (req.method !== 'GET') {
        return res.status(405).json({ 
            message: 'Método no permitido',
            detalles: 'Solo se aceptan solicitudes GET'
        });
    }

    const { numeroPedido } = req.query;
    if (!numeroPedido) {
        return res.status(400).json({ 
            message: 'Número de pedido requerido',
            detalles: 'Se requiere el parámetro numeroPedido en la consulta'
        });
    }

    try {
        const pool = await connectToDatabase();

        // 1. Consulta para obtener productos del pedido
        const pedidoQuery = `
            SELECT 
                p.*, 
                ap.CNOMBREPRODUCTO, 
                ap.CCODIGOPRODUCTO,
                ao.CNOMBREALMACEN AS NombreOrigen,
                ad.CNOMBREALMACEN AS NombreDestino
            FROM Pedidos p
            LEFT JOIN admProductos ap ON p.Producto = ap.CIDPRODUCTO
            LEFT JOIN admAlmacenes ao ON p.Origen = ao.CCODIGOALMACEN
            LEFT JOIN admAlmacenes ad ON p.Destino = ad.CCODIGOALMACEN
            WHERE p.NumeroPedido = @numeroPedido
            ORDER BY p.Producto
        `;
        
        const pedidoResult = await pool.request()
            .input('numeroPedido', sql.VarChar, numeroPedido)
            .query(pedidoQuery);

        // Procesar productos
        const productosProcesados = pedidoResult.recordset.map(prod => {
            const { nombreBase, caracteristicas } = procesarNombreProducto(prod.CNOMBREPRODUCTO || prod.nombre_producto);
            return {
                ...prod,
                nombreBase,
                caracteristicas,
                nombreCompleto: `${nombreBase}${caracteristicas ? `, ${caracteristicas}` : ''}`
            };
        });

        // 2. Obtener datos base del pedido
        let datosBasePedido = null;
        if (pedidoResult.recordset.length > 0) {
            const primerRegistro = pedidoResult.recordset[0];
            datosBasePedido = {
                origen: primerRegistro.NombreOrigen || primerRegistro.Origen || 'No especificado',
                destino: primerRegistro.NombreDestino || primerRegistro.Destino || 'No especificado',
                codigoOrigen: primerRegistro.Origen,
                codigoDestino: primerRegistro.Destino,
                fechaCreacion: primerRegistro.FechaCreacion || primerRegistro.Fecha_Creacion,
                estatus: primerRegistro.Estatus || 'Activo'
            };
        }

        // 3. Consultar movimientos relacionados
        const movimientosQuery = `
            SELECT 
                m.CIDPRODUCTO,
                SUM(m.CUNIDADES) AS TotalUnidades,
                ap.CNOMBREPRODUCTO,
                ap.CCODIGOPRODUCTO
            FROM admMovimientos m
            INNER JOIN admDocumentos d ON m.CIDDOCUMENTO = d.CIDDOCUMENTO
            INNER JOIN admProductos ap ON m.CIDPRODUCTO = ap.CIDPRODUCTO
            WHERE d.CFOLIO = @numeroPedido
            GROUP BY m.CIDPRODUCTO, ap.CNOMBREPRODUCTO, ap.CCODIGOPRODUCTO
            ORDER BY m.CIDPRODUCTO
        `;
        
        const movimientosResult = await pool.request()
            .input('numeroPedido', sql.VarChar, numeroPedido)
            .query(movimientosQuery);

        if (movimientosResult.recordset.length === 0) {
            return res.status(404).json({ 
                message: 'No hay movimientos relacionados con este pedido',
                pedido: datosBasePedido,
                productosRelacionados: productosProcesados,
                detalles: 'No se encontraron registros en admMovimientos para este pedido'
            });
        }

        // Procesar movimientos
        const movimientosProcesados = movimientosResult.recordset.map(mov => {
            const { nombreBase, caracteristicas } = procesarNombreProducto(mov.CNOMBREPRODUCTO);
            return {
                ...mov,
                nombreBase,
                caracteristicas,
                nombreCompleto: `${nombreBase}${caracteristicas ? `, ${caracteristicas}` : ''}`
            };
        });

        // 4. Sincronizar pedido con movimientos
        const operaciones = [];
        let cambiosRealizados = 0;

        for (const movimiento of movimientosProcesados) {
            const productoPedido = productosProcesados.find(p => p.Producto == movimiento.CIDPRODUCTO);
            
            if (!productoPedido) {
                // Crear nuevo producto en el pedido
                if (datosBasePedido) {
                    try {
                        const insertQuery = `
                            INSERT INTO Pedidos (
                                NumeroPedido, Producto, Unidades,
                                Origen, Destino, Fecha_Creacion, Estatus
                            ) VALUES (
                                @numeroPedido, @productoId, @unidades,
                                @origen, @destino, GETDATE(), @estatus
                            )
                        `;
                        
                        const insertResult = await pool.request()
                            .input('numeroPedido', sql.VarChar, numeroPedido)
                            .input('productoId', sql.Int, movimiento.CIDPRODUCTO)
                            .input('unidades', sql.Int, movimiento.TotalUnidades)
                            .input('origen', sql.Int, datosBasePedido.codigoOrigen)
                            .input('destino', sql.Int, datosBasePedido.codigoDestino)
                            .input('estatus', sql.VarChar, datosBasePedido.estatus)
                            .query(insertQuery);

                        if (insertResult.rowsAffected[0] > 0) {
                            cambiosRealizados++;
                            operaciones.push({
                                tipo: 'CREACION',
                                producto: {
                                    id: movimiento.CIDPRODUCTO,
                                    nombre: movimiento.nombreBase,
                                    caracteristicas: movimiento.caracteristicas,
                                    codigo: movimiento.CCODIGOPRODUCTO,
                                    unidades: movimiento.TotalUnidades,
                                    nombreCompleto: movimiento.nombreCompleto
                                },
                                detalles: 'Nuevo producto agregado al pedido'
                            });
                        }
                    } catch (error) {
                        operaciones.push({
                            tipo: 'ERROR_CREACION',
                            producto: {
                                id: movimiento.CIDPRODUCTO,
                                error: error.message,
                                detalles: 'Fallo al intentar crear producto'
                            }
                        });
                    }
                }
            } else {
                // Verificar si necesita actualización
                const necesitaActualizacion = 
                    productoPedido.Unidades != movimiento.TotalUnidades ||
                    productoPedido.nombreBase != movimiento.nombreBase ||
                    productoPedido.caracteristicas != movimiento.caracteristicas;

                if (necesitaActualizacion) {
                    try {
                        const updateQuery = `
                            UPDATE Pedidos SET
                                Unidades = @unidades,
                                Fecha_Creacion = GETDATE()
                            WHERE 
                                NumeroPedido = @numeroPedido AND
                                Producto = @productoId
                        `;
                        
                        const updateResult = await pool.request()
                            .input('numeroPedido', sql.VarChar, numeroPedido)
                            .input('productoId', sql.Int, movimiento.CIDPRODUCTO)
                            .input('unidades', sql.Int, movimiento.TotalUnidades)
                            .query(updateQuery);

                        if (updateResult.rowsAffected[0] > 0) {
                            cambiosRealizados++;
                            operaciones.push({
                                tipo: 'ACTUALIZACION',
                                productoAnterior: {
                                    id: productoPedido.Producto,
                                    nombre: productoPedido.nombreBase,
                                    caracteristicas: productoPedido.caracteristicas,
                                    codigo: productoPedido.CCODIGOPRODUCTO,
                                    unidades: productoPedido.Unidades,
                                    nombreCompleto: productoPedido.nombreCompleto
                                },
                                productoNuevo: {
                                    id: movimiento.CIDPRODUCTO,
                                    nombre: movimiento.nombreBase,
                                    caracteristicas: movimiento.caracteristicas,
                                    codigo: movimiento.CCODIGOPRODUCTO,
                                    unidades: movimiento.TotalUnidades,
                                    nombreCompleto: movimiento.nombreCompleto
                                },
                                detalles: 'Producto actualizado en el pedido'
                            });
                        }
                    } catch (error) {
                        operaciones.push({
                            tipo: 'ERROR_ACTUALIZACION',
                            producto: {
                                id: movimiento.CIDPRODUCTO,
                                error: error.message,
                                detalles: 'Fallo al intentar actualizar producto'
                            }
                        });
                    }
                } else {
                    operaciones.push({
                        tipo: 'SIN_CAMBIOS',
                        producto: {
                            id: movimiento.CIDPRODUCTO,
                            nombre: movimiento.nombreBase,
                            caracteristicas: movimiento.caracteristicas,
                            codigo: movimiento.CCODIGOPRODUCTO,
                            unidades: movimiento.TotalUnidades,
                            nombreCompleto: movimiento.nombreCompleto
                        },
                        detalles: 'El producto ya estaba actualizado'
                    });
                }
            }
        }

        // 5. Obtener datos finales actualizados
        const [pedidoFinal, productosRelacionados] = await Promise.all([
            pool.request()
                .input('numeroPedido', sql.VarChar, numeroPedido)
                .query(`
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
                `),
            pool.request()
                .input('numeroPedido', sql.VarChar, numeroPedido)
                .query(movimientosQuery)
        ]);

        // Procesar resultados finales
        const productosFinalesProcesados = pedidoFinal.recordset.map(prod => {
            const { nombreBase, caracteristicas } = procesarNombreProducto(prod.CNOMBREPRODUCTO);
            return {
                ...prod,
                nombreBase,
                caracteristicas,
                nombreCompleto: `${nombreBase}${caracteristicas ? `, ${caracteristicas}` : ''}`
            };
        });

        const productosRelacionadosProcesados = productosRelacionados.recordset.map(prod => {
            const { nombreBase, caracteristicas } = procesarNombreProducto(prod.CNOMBREPRODUCTO);
            return {
                ...prod,
                nombreBase,
                caracteristicas,
                nombreCompleto: `${nombreBase}${caracteristicas ? `, ${caracteristicas}` : ''}`
            };
        });

        res.status(200).json({
            pedido: datosBasePedido,
            productosRelacionados: productosRelacionadosProcesados,
            productosPedido: productosFinalesProcesados,
            operacionesRealizadas: operaciones,
            totalCambios: cambiosRealizados,
            mensaje: cambiosRealizados > 0 
                ? `Pedido actualizado correctamente (${cambiosRealizados} cambios)` 
                : 'El pedido ya estaba actualizado',
            detalles: 'Procesamiento completado exitosamente',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error en el proceso:', error);
        res.status(500).json({ 
            message: 'Error en el servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Ocurrió un error al procesar la solicitud',
            detalles: 'Error al procesar el pedido'
        });
    }
}