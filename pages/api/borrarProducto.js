import { sql, connectToDatabase } from '../../dbconfig';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default async function handler(req, res) {
    console.log('[BORRAR PRODUCTO] Inicio del proceso');
    
    if (req.method !== 'POST') {
        console.log('[BORRAR PRODUCTO] Error: Método no permitido');
        return res.status(405).json({ 
            success: false,
            message: 'Método no permitido',
            allowedMethods: ['POST']
        });
    }

    try {
        const { numeroPedido, productoId, usuarioAutorizacion } = req.body;
        console.log('[BORRAR PRODUCTO] Datos recibidos:', { numeroPedido, productoId, usuarioAutorizacion });

        // Validaciones
        if (!numeroPedido?.trim() || !productoId || !usuarioAutorizacion?.trim()) {
            console.log('[BORRAR PRODUCTO] Error: Datos incompletos');
            return res.status(400).json({
                success: false,
                message: 'Datos incompletos',
                requiredFields: ['numeroPedido', 'productoId', 'usuarioAutorizacion']
            });
        }

        const productoIdNum = Number(productoId);
        if (isNaN(productoIdNum)) {
            console.log('[BORRAR PRODUCTO] Error: ID de producto inválido');
            return res.status(400).json({
                success: false,
                message: 'ID de producto inválido'
            });
        }

        const pool = await connectToDatabase();
        let transaction;

        try {
            // 1. Verificar existencia del pedido (query original)
            console.log('[BORRAR PRODUCTO] Buscando documento del traspaso');
            const pedidoExistente = await pool.request()
                .input('numeroPedido', sql.VarChar, numeroPedido)
                .query(`
                    SELECT TOP 1 
                        d.CIDDOCUMENTO, 
                        d.CFOLIO, 
                        d.CFECHA, 
                        p.Origen, 
                        p.Destino
                    FROM 
                        pedidos p
                        INNER JOIN admDocumentos d ON d.CFOLIO = p.numeroPedido
                        INNER JOIN admAlmacenes a ON p.Origen = a.CIDALMACEN OR p.Destino = a.CIDALMACEN
                    WHERE 
                        d.CFOLIO = @numeroPedido
                        AND d.CIDDOCUMENTODE = 34
                    ORDER BY 
                        d.CIDDOCUMENTO DESC
                `);

            if (pedidoExistente.recordset.length === 0) {
                console.log('[BORRAR PRODUCTO] Error: Traspaso no encontrado');
                return res.status(404).json({
                    success: false,
                    message: 'Traspaso no encontrado'
                });
            }

            const documentoInfo = pedidoExistente.recordset[0];
            const documentoId = documentoInfo.CIDDOCUMENTO;
            console.log(`[BORRAR PRODUCTO] Documento ID encontrado: ${documentoId}`);

            // 2. Obtener información del producto y verificar existencia
            console.log('[BORRAR PRODUCTO] Obteniendo información del producto');
            const infoProducto = await pool.request()
                .input('productoId', sql.Int, productoIdNum)
                .query('SELECT CNOMBREPRODUCTO, CCODIGOPRODUCTO FROM admProductos WHERE CIDPRODUCTO = @productoId');

            if (infoProducto.recordset.length === 0) {
                console.log('[BORRAR PRODUCTO] Error: Producto no encontrado en catálogo');
                return res.status(404).json({
                    success: false,
                    message: 'Producto no encontrado en el catálogo'
                });
            }

            const nombreProducto = infoProducto.recordset[0].CNOMBREPRODUCTO;
            const codigoProducto = infoProducto.recordset[0].CCODIGOPRODUCTO;

            // 3. Verificar si el producto existe en el pedido específico
            console.log('[BORRAR PRODUCTO] Verificando producto en el pedido');
            const productoEnPedido = await pool.request()
                .input('numeroPedido', sql.VarChar, numeroPedido)
                .input('productoId', sql.Int, productoIdNum)
                .query(`
                    SELECT 
                        p.Producto AS CIDPRODUCTO,
                        p.Unidades AS NCANTIDAD
                    FROM Pedidos p
                    WHERE p.NumeroPedido = @numeroPedido
                    AND p.Producto = @productoId
                `);

            if (productoEnPedido.recordset.length === 0) {
                console.log('[BORRAR PRODUCTO] Error: Producto no encontrado en el pedido');
                return res.status(404).json({
                    success: false,
                    message: 'El producto no existe en este traspaso'
                });
            }

            const cantidadProducto = productoEnPedido.recordset[0].NCANTIDAD;

            // 4. Obtener el total de productos en el pedido
            console.log('[BORRAR PRODUCTO] Obteniendo total de productos en el pedido');
            const totalProductos = await pool.request()
                .input('numeroPedido', sql.VarChar, numeroPedido)
                .query(`
                    SELECT COUNT(*) AS total
                    FROM Pedidos
                    WHERE NumeroPedido = @numeroPedido
                `);

            const esUnicoProducto = totalProductos.recordset[0].total === 1;

            // Iniciar transacción
            console.log('[BORRAR PRODUCTO] Iniciando transacción');
            transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                // Eliminar movimientos relacionados con el producto
                console.log('[BORRAR PRODUCTO] Eliminando movimientos');
                const deleteMovimientos = await transaction.request()
                    .input('productoId', sql.Int, productoIdNum)
                    .input('documentoId', sql.Int, documentoId)
                    .query(`
                        DELETE FROM admMovimientos
                        WHERE CIDPRODUCTO = @productoId
                        AND (CIDDOCUMENTO = @documentoId OR CIDDOCUMENTO = 0)
                    `);
                console.log(`[BORRAR PRODUCTO] Movimientos eliminados: ${deleteMovimientos.rowsAffected}`);

                // Eliminar de pedidos
                console.log('[BORRAR PRODUCTO] Eliminando pedidos');
                const deletePedidos = await transaction.request()
                    .input('numeroPedido', sql.VarChar, numeroPedido)
                    .input('productoId', sql.Int, productoIdNum)
                    .query(`
                        DELETE FROM Pedidos
                        WHERE NumeroPedido = @numeroPedido
                        AND Producto = @productoId
                    `);
                console.log(`[BORRAR PRODUCTO] Pedidos eliminados: ${deletePedidos.rowsAffected}`);

                // Si es el único producto, eliminar el documento completo
                if (esUnicoProducto) {
                    console.log('[BORRAR PRODUCTO] Es el único producto, eliminando documento completo');
                    const deleteDocumento = await transaction.request()
                        .input('documentoId', sql.Int, documentoId)
                        .query(`
                            DELETE FROM admDocumentos
                            WHERE CIDDOCUMENTO = @documentoId
                        `);
                    console.log(`[BORRAR PRODUCTO] Documento eliminado: ${deleteDocumento.rowsAffected}`);
                }

                // Confirmar transacción
                console.log('[BORRAR PRODUCTO] Confirmando transacción');
                await transaction.commit();

                // Generar PDF con resumen de lo borrado
                console.log('[BORRAR PRODUCTO] Generando PDF de resumen');
                const doc = new jsPDF();
                doc.setFontSize(16);
                doc.text('Resumen de Producto Borrado', 20, 20);
                doc.setFontSize(12);
                
                doc.text(`Traspaso: ${numeroPedido}`, 20, 35);
                doc.text(`Fecha: ${new Date().toLocaleString()}`, 20, 45);
                doc.text(`Usuario: ${usuarioAutorizacion}`, 20, 55);
                doc.text(`Origen: ${documentoInfo.Origen}`, 20, 65);
                doc.text(`Destino: ${documentoInfo.Destino}`, 20, 75);
                
                doc.setFontSize(14);
                doc.text('Producto Eliminado:', 20, 90);
                
                doc.autoTable({
                    startY: 100,
                    head: [['ID', 'Nombre', 'Código', 'Cantidad']],
                    body: [[
                        productoIdNum,
                        nombreProducto,
                        codigoProducto,
                        cantidadProducto
                    ]]
                });
                
                doc.text(`Nota: ${esUnicoProducto ? 'Se eliminó el traspaso completo' : 
                    'El traspaso contiene otros productos'}`, 20, doc.autoTable.previous.finalY + 15);
                
                const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

                console.log('[BORRAR PRODUCTO] Proceso completado con éxito');
                return res.status(200).json({
                    success: true,
                    message: 'Producto eliminado correctamente',
                    detalles: {
                        productoId: productoIdNum,
                        nombreProducto: nombreProducto,
                        codigoProducto: codigoProducto,
                        cantidad: cantidadProducto,
                        movimientosEliminados: deleteMovimientos.rowsAffected,
                        pedidosEliminados: deletePedidos.rowsAffected,
                        documentoEliminado: esUnicoProducto,
                        pdfBase64: pdfBuffer.toString('base64')
                    }
                });

            } catch (error) {
                console.error('[BORRAR PRODUCTO] Error en transacción:', error);
                if (transaction && transaction._begun) {
                    console.log('[BORRAR PRODUCTO] Revertiendo transacción');
                    await transaction.rollback();
                }
                throw error;
            }

        } catch (error) {
            console.error('[BORRAR PRODUCTO] Error en el proceso:', error);
            return res.status(500).json({
                success: false,
                message: 'Error en el proceso de eliminación',
                error: error.message
            });
        }

    } catch (error) {
        console.error('[BORRAR PRODUCTO] Error general:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
}