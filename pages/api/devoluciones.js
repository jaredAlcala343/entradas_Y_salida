import { sql, connectToDatabase } from '../../dbconfig';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const { numeroPedido, productoId, cantidadDevolucion } = req.body;

    // Validaciones básicas
    if (!numeroPedido || !productoId || !cantidadDevolucion) {
        return res.status(400).json({ message: 'Datos incompletos' });
    }

    const productoIdNum = parseInt(productoId);
    const cantidadNum = parseInt(cantidadDevolucion);

    if (isNaN(productoIdNum) || isNaN(cantidadNum) || cantidadNum <= 0) {
        return res.status(400).json({ message: 'Datos inválidos' });
    }

    let pool;
    let transaction;

    try {
        pool = await connectToDatabase();

        // 1. Obtener el documento principal del pedido
        const documentoResult = await pool.request()
            .input('numeroPedido', sql.VarChar, numeroPedido)
            .query(`
                SELECT CIDDOCUMENTO 
                FROM admDocumentos 
                WHERE CFOLIO = @numeroPedido
                AND CIDDOCUMENTODE = 34
                ORDER BY CIDDOCUMENTO DESC
            `);

        if (documentoResult.recordset.length === 0) {
            return res.status(404).json({ message: 'No se encontró el documento principal' });
        }

        const documentoPrincipal = documentoResult.recordset[0].CIDDOCUMENTO;

        // 2. Buscar el primer movimiento del producto en el documento principal
        const primerMovimientoResult = await pool.request()
            .input('documentoId', sql.Int, documentoPrincipal)
            .input('productoId', sql.Int, productoIdNum)
            .query(`
                SELECT MIN(CIDMOVIMIENTO) AS primerMovimiento
                FROM admMovimientos
                WHERE CIDDOCUMENTO = @documentoId
                AND CIDPRODUCTO = @productoId
            `);

        if (!primerMovimientoResult.recordset[0].primerMovimiento) {
            return res.status(404).json({ message: 'No hay movimientos para este producto' });
        }

        const primerMovimiento = primerMovimientoResult.recordset[0].primerMovimiento;

        // 3. Obtener todos los movimientos del producto desde el primer movimiento
        const movimientosResult = await pool.request()
            .input('primerMovimiento', sql.Int, primerMovimiento)
            .input('productoId', sql.Int, productoIdNum)
            .query(`
                SELECT 
                    CIDMOVIMIENTO,
                    CUNIDADES,
                    CIDDOCUMENTO,
                    CIDPRODUCTO
                FROM admMovimientos
                WHERE CIDMOVIMIENTO >= @primerMovimiento
                AND CIDPRODUCTO = @productoId
                ORDER BY CIDMOVIMIENTO ASC
            `);

        if (movimientosResult.recordset.length === 0) {
            return res.status(404).json({ message: 'No hay movimientos para actualizar' });
        }

        // 4. Buscar el pedido correspondiente
        const pedidoResult = await pool.request()
            .input('numeroPedido', sql.VarChar, numeroPedido)
            .input('productoId', sql.Int, productoIdNum)
            .query(`
                SELECT id, Unidades
                FROM Pedidos
                WHERE NumeroPedido = @numeroPedido 
                AND Producto = @productoId
            `);

        if (pedidoResult.recordset.length === 0) {
            return res.status(404).json({ message: 'No se encontró el pedido' });
        }

        // 5. Calcular la nueva cantidad
        const cantidadActual = Math.max(...movimientosResult.recordset.map(m => m.CUNIDADES));
        const nuevaCantidadCalculada = cantidadActual - cantidadNum;

        if (nuevaCantidadCalculada < 0) {
            return res.status(400).json({ 
                message: 'Cantidad a devolver excede el stock disponible',
                cantidadActual,
                cantidadSolicitada: cantidadNum
            });
        }

        // 6. Iniciar transacción
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // 7. Actualizar TODOS los movimientos del producto encontrados
            for (const movimiento of movimientosResult.recordset) {
                await transaction.request()
                    .input('movimientoId', sql.Int, movimiento.CIDMOVIMIENTO)
                    .input('nuevaCantidad', sql.Int, nuevaCantidadCalculada)
                    .query(`
                        UPDATE admMovimientos
                        SET CUNIDADES = @nuevaCantidad
                        WHERE CIDMOVIMIENTO = @movimientoId
                    `);
            }

            // 8. Actualizar los pedidos
            for (const pedido of pedidoResult.recordset) {
                await transaction.request()
                    .input('pedidoId', sql.Int, pedido.id)
                    .input('nuevaCantidad', sql.Int, nuevaCantidadCalculada)
                    .query(`
                        UPDATE Pedidos
                        SET Unidades = @nuevaCantidad
                        WHERE id = @pedidoId
                    `);
            }

            await transaction.commit();

            res.status(200).json({
                success: true,
                message: 'Devolución procesada correctamente',
                detalles: {
                    cantidadAnterior: cantidadActual,
                    cantidadDevuelta: cantidadNum,
                    cantidadActualizada: nuevaCantidadCalculada,
                    movimientosActualizados: movimientosResult.recordset.length,
                    pedidosActualizados: pedidoResult.recordset.length
                }
            });

        } catch (transactionError) {
            if (transaction && transaction._begun) {
                await transaction.rollback();
            }
            throw transactionError;
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al procesar la solicitud',
            error: error.message
        });
    } 
};