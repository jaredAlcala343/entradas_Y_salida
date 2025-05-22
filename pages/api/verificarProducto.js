import { sql, connectToDatabase } from '../../dbconfig';

export default async function handler(req, res) {
    console.log(`[verificarProducto] Inicio de solicitud para pedido: ${req.query.numeroPedido}, producto: ${req.query.codigoProducto}`);
    
    if (req.method !== 'GET') {
        console.warn(`[verificarProducto] Método no permitido: ${req.method}`);
        return res.status(405).json({ 
            message: 'Método no permitido',
            detalles: 'Solo se aceptan solicitudes GET'
        });
    }

    const { numeroPedido, codigoProducto } = req.query;

    if (!numeroPedido || !codigoProducto) {
        console.error('[verificarProducto] Faltan parámetros requeridos');
        return res.status(400).json({ 
            message: 'Faltan parámetros',
            detalles: 'Se requieren ambos: numeroPedido y codigoProducto'
        });
    }

    try {
        console.log(`[verificarProducto] Conectando a la base de datos`);
        const pool = await connectToDatabase();

        // Extraer el código base (sin sufijos)
        const codigoBase = codigoProducto.split('-')[0];

        const query = `
                SELECT 
                p.*,
                CASE 
                    WHEN CHARINDEX(',', p.nombre_producto) > 0 
                    THEN LTRIM(SUBSTRING(p.nombre_producto, CHARINDEX(',', p.nombre_producto) + 1, LEN(p.nombre_producto)))
                    ELSE p.nombre_producto
                END AS CNOMBREPRODUCTO,
                
                CASE
                    -- Si ya tiene un código asignado, lo tomamos completo (incluyendo números si es de un producto no excluido)
                    WHEN ap.CCODIGOPRODUCTO IS NOT NULL AND p.nombre_producto NOT IN (
                        'Cubierta Cubytop Antiderrame Lisa',
                        'Cubierta Cubytop Antiderrame Cantera'
                    ) THEN ap.CCODIGOPRODUCTO
                    -- Si es un producto excluido o no tiene código, quitamos los números
                    WHEN ap.CCODIGOPRODUCTO IS NOT NULL THEN
                        SUBSTRING(
                            ap.CCODIGOPRODUCTO,
                            1,
                            PATINDEX('%[0-9]%', ap.CCODIGOPRODUCTO + '0') - 1
                        )
                    -- Si no tiene código asignado, buscamos uno similar
                    ELSE (
                        SELECT TOP 1 
                            CASE WHEN p.nombre_producto NOT IN (
                                'Cubierta Cubytop Antiderrame Lisa',
                                'Cubierta Cubytop Antiderrame Cantera'
                            ) THEN ap2.CCODIGOPRODUCTO  -- Mantiene números si no es producto excluido
                            ELSE SUBSTRING(ap2.CCODIGOPRODUCTO, 1, PATINDEX('%[0-9]%', ap2.CCODIGOPRODUCTO + '0') - 1)  -- Quita números si es excluido
                            END
                        FROM admProductos ap2 
                        WHERE ap2.CNOMBREPRODUCTO LIKE 
                            SUBSTRING(p.nombre_producto, 1, 
                                CASE WHEN CHARINDEX(',', p.nombre_producto) > 0 
                                THEN CHARINDEX(',', p.nombre_producto) - 1 
                                ELSE LEN(p.nombre_producto) END) + '%'
                        AND ap2.CIDPRODUCTO <> p.Producto
                        ORDER BY ap2.CCODIGOPRODUCTO
                    )
                END AS CCODIGOPRODUCTO,
                
                ao.CNOMBREALMACEN AS NombreOrigen,
                ad.CNOMBREALMACEN AS NombreDestino
            FROM Pedidos p
            LEFT JOIN admProductos ap ON p.Producto = ap.CIDPRODUCTO
            LEFT JOIN admAlmacenes ao ON p.Origen = ao.CCODIGOALMACEN
            LEFT JOIN admAlmacenes ad ON p.Destino = ad.CCODIGOALMACEN
            WHERE p.NumeroPedido = 710
            AND (
                CHARINDEX(',', p.nombre_producto) > 0
                OR (
                    CHARINDEX(',', p.nombre_producto) = 0
                    AND p.nombre_producto NOT IN (
                        'Cubierta Cubytop Antiderrame Lisa',
                        'Cubierta Cubytop Antiderrame Cantera'
                    )
                )
            )
            ORDER BY p.Producto;
        `;
        
        const result = await pool
            .request()
            .input('numeroPedido', sql.VarChar, numeroPedido)
            .input('codigoBase', sql.VarChar, codigoBase)
            .query(query);

        console.log(`[verificarProducto] Resultado de la consulta:`, result.recordset);

        if (result.recordset.length === 0) {
            console.warn('[verificarProducto] Producto no encontrado en el pedido');
            return res.status(200).json({ 
                existe: false,
                productos: [],
                detalles: 'Producto no encontrado en el pedido',
                timestamp: new Date().toISOString()
            });
        }

        const productos = result.recordset.map(item => ({
            idLineaPedido: item.idLineaPedido,
            idProducto: item.idProducto,
            codigoProducto: item.codigoProducto,
            nombreProducto: item.nombreProducto,
            unidadesPedido: item.unidadesPedido,
            nombreOrigen: item.NombreOrigen,
            nombreDestino: item.NombreDestino
        }));

        const responseData = {
            existe: true,
            productos,
            detalles: 'Producto(s) encontrado(s) en el pedido',
            totalProductos: productos.length,
            timestamp: new Date().toISOString()
        };

        console.log('[verificarProducto] Enviando respuesta final:', responseData);
        res.status(200).json(responseData);

    } catch (error) {
        console.error('[verificarProducto] Error en el proceso:', {
            error: error.message,
            queryParams: { numeroPedido, codigoProducto },
            timestamp: new Date().toISOString()
        });
        
        res.status(500).json({ 
            message: 'Error en el servidor',
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Ocurrió un error al procesar la solicitud',
            detalles: 'Error al verificar el producto',
            timestamp: new Date().toISOString()
        });
    } finally {
        console.log(`[verificarProducto] Finalizada solicitud para pedido ${numeroPedido}, producto ${codigoProducto}`);
    }
}