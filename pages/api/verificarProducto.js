import { sql, connectToDatabase } from '../../dbconfig';

// Función para procesar nombres de productos
const procesarNombreProducto = (nombreProducto) => {
    console.log(`[procesarNombreProducto] Procesando: ${nombreProducto}`);
    
    let nombreBase = "Producto desconocido";
    let caracteristicas = "";

    if (nombreProducto && nombreProducto.toLowerCase() !== "null") {
        const partes = nombreProducto.split(",");
        console.log(`[procesarNombreProducto] Partes del nombre:`, partes);
        
        const filtradas = partes.map(p => p.trim()).filter(p => p && p.toLowerCase() !== "null");
        console.log(`[procesarNombreProducto] Partes filtradas:`, filtradas);

        if (filtradas.length > 0) {
            nombreBase = filtradas[0];
            if (filtradas.length > 1) {
                caracteristicas = filtradas.slice(1).join(", ");
            }
        }
    }

    console.log(`[procesarNombreProducto] Resultado: nombreBase=${nombreBase}, caracteristicas=${caracteristicas}`);
    return { nombreBase, caracteristicas };
};

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
        console.log(`[verificarProducto] Conectando a la base de datos para pedido ${numeroPedido} y producto ${codigoProducto}`);
        const pool = await connectToDatabase();

        // Consulta para verificar si el producto existe en el pedido
        console.log(`[verificarProducto] Consultando existencia del producto en el pedido`);
        const query = `
            SELECT 
                COUNT(*) as existe,
                MAX(a.CNOMBREPRODUCTO) as nombreProducto,
                MAX(p.Unidades) as unidadesPedido
            FROM Pedidos p
            INNER JOIN admProductos a ON p.Producto = a.CIDPRODUCTO
            WHERE p.NumeroPedido = @numeroPedido 
            AND a.CCODIGOPRODUCTO = @codigoProducto
            GROUP BY a.CIDPRODUCTO
        `;
        
        const result = await pool
            .request()
            .input('numeroPedido', sql.VarChar, numeroPedido)
            .input('codigoProducto', sql.VarChar, codigoProducto)
            .query(query);

        console.log(`[verificarProducto] Resultado de la consulta:`, result.recordset);

        if (result.recordset.length === 0) {
            console.warn('[verificarProducto] Producto no encontrado en el pedido');
            return res.status(200).json({ 
                existe: false,
                producto: null,
                detalles: 'Producto no encontrado en el pedido'
            });
        }

        const { existe, nombreProducto, unidadesPedido } = result.recordset[0];
        const { nombreBase, caracteristicas } = procesarNombreProducto(nombreProducto);

        const responseData = {
            existe: existe > 0,
            producto: {
                nombreBase,
                caracteristicas,
                unidades: unidadesPedido || 0
            },
            detalles: existe > 0 
                ? 'El producto existe en el pedido' 
                : 'Producto no encontrado en el pedido',
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