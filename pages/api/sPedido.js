import { sql, connectToDatabase } from '../../dbconfig';

// Función mejorada para procesar nombres de productos con logs detallados
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
    console.log(`[sPedido] Inicio de solicitud para pedido: ${req.query.numeroPedido}`);
    
    if (req.method !== 'GET') {
        console.warn(`[sPedido] Método no permitido: ${req.method}`);
        return res.status(405).json({ 
            message: 'Método no permitido',
            detalles: 'Solo se aceptan solicitudes GET'
        });
    }

    const { numeroPedido } = req.query;

    if (!numeroPedido) {
        console.error('[sPedido] Número de pedido no proporcionado');
        return res.status(400).json({ 
            message: 'Número de pedido requerido',
            detalles: 'Se requiere el parámetro numeroPedido en la consulta'
        });
    }

    try {
        console.log(`[sPedido] Conectando a la base de datos para pedido ${numeroPedido}`);
        const pool = await connectToDatabase();

        // 1. Obtener todos los productos del pedido actual
        console.log(`[sPedido] Consultando productos del pedido ${numeroPedido}`);
        const pedidoQuery = `
            SELECT p.*, ap.CNOMBREPRODUCTO, ap.CCODIGOPRODUCTO,
                   ao.CNOMBREALMACEN AS NombreOrigen,
                   ad.CNOMBREALMACEN AS NombreDestino
            FROM Pedidos p
            LEFT JOIN admProductos ap ON p.Producto = ap.CIDPRODUCTO
            LEFT JOIN admAlmacenes ao ON p.Origen = ao.CCODIGOALMACEN
            LEFT JOIN admAlmacenes ad ON p.Destino = ad.CCODIGOALMACEN
            WHERE p.NumeroPedido = @numeroPedido
            ORDER BY p.Producto
        `;
        
        const pedidoResult = await pool
            .request()
            .input('numeroPedido', sql.VarChar, numeroPedido)
            .query(pedidoQuery);

        console.log(`[sPedido] Productos encontrados: ${pedidoResult.recordset.length}`);

        // Procesar nombres de productos
        const productosProcesados = pedidoResult.recordset.map(prod => {
            const { nombreBase, caracteristicas } = procesarNombreProducto(prod.CNOMBREPRODUCTO);
            return {
                ...prod,
                nombreBase,
                caracteristicas,
                nombreCompleto: `${nombreBase}${caracteristicas ? `, ${caracteristicas}` : ''}`
            };
        });

        console.log('[sPedido] Productos procesados:', productosProcesados);

        // 2. Obtener datos base del primer registro (si existe)
        let datosBasePedido = null;
        if (pedidoResult.recordset.length > 0) {
            const primerRegistro = pedidoResult.recordset[0];
            datosBasePedido = {
                origen: primerRegistro.NombreOrigen || primerRegistro.Origen || 'No especificado',
                destino: primerRegistro.NombreDestino || primerRegistro.Destino || 'No especificado',
                codigoOrigen: primerRegistro.Origen || 'No especificado',
                codigoDestino: primerRegistro.Destino || 'No especificado',
                fechaCreacion: primerRegistro.FechaCreacion || primerRegistro.Fecha_Creacion || 'No especificada',
                estatus: primerRegistro.Estatus || 'Activo'
            };
        }

        console.log('[sPedido] Datos base del pedido:', datosBasePedido);

        // 3. Obtener todos los movimientos relacionados con este pedido
        console.log(`[sPedido] Consultando movimientos para pedido ${numeroPedido}`);
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
        
        const movimientosResult = await pool
            .request()
            .input('numeroPedido', sql.VarChar, numeroPedido)
            .query(movimientosQuery);

        console.log(`[sPedido] Movimientos encontrados: ${movimientosResult.recordset.length}`);

        if (movimientosResult.recordset.length === 0) {
            console.warn('[sPedido] No hay movimientos relacionados con este pedido');
            return res.status(404).json({ 
                message: 'No hay movimientos relacionados con este pedido',
                pedido: datosBasePedido,
                productosRelacionados: productosProcesados,
                detalles: 'No se encontraron registros en admMovimientos para este pedido'
            });
        }

        // Procesar nombres de productos en movimientos
        const movimientosProcesados = movimientosResult.recordset.map(mov => {
            const { nombreBase, caracteristicas } = procesarNombreProducto(mov.CNOMBREPRODUCTO);
            return {
                ...mov,
                nombreBase,
                caracteristicas,
                nombreCompleto: `${nombreBase}${caracteristicas ? `, ${caracteristicas}` : ''}`
            };
        });

        console.log('[sPedido] Movimientos procesados:', movimientosProcesados);

        // 4. Procesar cada movimiento
        console.log('[sPedido] Iniciando procesamiento de movimientos');
        const operaciones = [];
        let cambiosRealizados = 0;

        for (const movimiento of movimientosProcesados) {
            console.log(`[sPedido] Procesando movimiento para producto ${movimiento.CIDPRODUCTO}`);
            
            const productoPedido = productosProcesados.find(p => p.Producto == movimiento.CIDPRODUCTO);

            if (!productoPedido) {
                console.log(`[sPedido] Producto ${movimiento.CIDPRODUCTO} no encontrado en pedido - creando nuevo`);
                
                if (datosBasePedido) {
                    try {
                        const insertQuery = `
                            INSERT INTO Pedidos (
                                NumeroPedido, 
                                Producto, 
                                Unidades,
                                Origen,
                                Destino,
                                Fecha_Creacion,
                                Estatus
                            ) VALUES (
                                @numeroPedido,
                                @productoId,
                                @unidades,
                                @origen,
                                @destino,
                                GETDATE(),
                                @estatus
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
                            console.log(`[sPedido] Producto ${movimiento.CIDPRODUCTO} creado exitosamente`);
                        }
                    } catch (insertError) {
                        console.error(`[sPedido] Error al crear producto ${movimiento.CIDPRODUCTO}:`, insertError);
                        
                        try {
                            const insertResult = await pool.request()
                                .input('numeroPedido', sql.VarChar, numeroPedido)
                                .input('productoId', sql.Int, movimiento.CIDPRODUCTO)
                                .input('unidades', sql.Int, movimiento.TotalUnidades)
                                .input('origen', sql.Int, datosBasePedido.codigoOrigen)
                                .input('destino', sql.Int, datosBasePedido.codigoDestino)
                                .input('estatus', sql.VarChar, datosBasePedido.estatus)
                                .query(`
                                    INSERT INTO Pedidos (
                                        NumeroPedido, 
                                        Producto, 
                                        Unidades,
                                        Origen,
                                        Destino,
                                        Fecha_Creacion,
                                        Estatus
                                    ) VALUES (
                                        @numeroPedido,
                                        @productoId,
                                        @unidades,
                                        @origen,
                                        @destino,
                                        GETDATE(),
                                        @estatus
                                    )
                                `);

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
                                    detalles: 'Nuevo producto agregado al pedido (segundo intento)'
                                });
                                console.log(`[sPedido] Producto ${movimiento.CIDPRODUCTO} creado en segundo intento`);
                            }
                        } catch (secondInsertError) {
                            console.error(`[sPedido] Error alternativo al crear producto ${movimiento.CIDPRODUCTO}:`, secondInsertError);
                            operaciones.push({
                                tipo: 'ERROR_CREACION',
                                producto: {
                                    id: movimiento.CIDPRODUCTO,
                                    error: secondInsertError.message,
                                    detalles: 'Fallo al intentar crear producto'
                                }
                            });
                        }
                    }
                } else {
                    console.warn('[sPedido] No hay datos base para crear nueva línea');
                    operaciones.push({
                        tipo: 'ERROR_DATOS_BASE',
                        mensaje: 'No hay datos base para crear nueva línea',
                        detalles: 'Faltan datos de origen/destino para crear nuevo producto'
                    });
                }
            } else {
                console.log(`[sPedido] Producto ${movimiento.CIDPRODUCTO} encontrado en pedido - verificando actualización`);
                
                const necesitaActualizacion = 
                    productoPedido.Unidades != movimiento.TotalUnidades ||
                    (productoPedido.nombreBase || '') != (movimiento.nombreBase || '') ||
                    (productoPedido.caracteristicas || '') != (movimiento.caracteristicas || '');

                if (necesitaActualizacion) {
                    console.log(`[sPedido] Producto ${movimiento.CIDPRODUCTO} necesita actualización`);
                    
                    try {
                        let updateResult;
                        try {
                            const updateQuery = `
                                UPDATE Pedidos
                                SET 
                                    Producto = @productoId,
                                    Unidades = @unidades,
                                    Fecha_creacion = GETDATE()
                                WHERE 
                                    NumeroPedido = @numeroPedido AND
                                    Producto = @productoOriginal
                            `;
                            
                            updateResult = await pool.request()
                                .input('numeroPedido', sql.VarChar, numeroPedido)
                                .input('productoId', sql.Int, movimiento.CIDPRODUCTO)
                                .input('unidades', sql.Int, movimiento.TotalUnidades)
                                .input('productoOriginal', sql.Int, productoPedido.Producto)
                                .query(updateQuery);
                        } catch (firstUpdateError) {
                            console.error(`[sPedido] Primer intento de actualización falló para producto ${movimiento.CIDPRODUCTO}:`, firstUpdateError);
                            
                            const updateQuery = `
                                UPDATE Pedidos
                                SET 
                                    Producto = @productoId,
                                    Unidades = @unidades,
                                    Fecha_Creacion = GETDATE()
                                WHERE 
                                    NumeroPedido = @numeroPedido AND
                                    Producto = @productoOriginal
                            `;
                            
                            updateResult = await pool.request()
                                .input('numeroPedido', sql.VarChar, numeroPedido)
                                .input('productoId', sql.Int, movimiento.CIDPRODUCTO)
                                .input('unidades', sql.Int, movimiento.TotalUnidades)
                                .input('productoOriginal', sql.Int, productoPedido.Producto)
                                .query(updateQuery);
                        }

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
                            console.log(`[sPedido] Producto ${movimiento.CIDPRODUCTO} actualizado exitosamente`);
                        }
                    } catch (updateError) {
                        console.error(`[sPedido] Error al actualizar producto ${movimiento.CIDPRODUCTO}:`, updateError);
                        operaciones.push({
                            tipo: 'ERROR_ACTUALIZACION',
                            producto: {
                                id: movimiento.CIDPRODUCTO,
                                error: updateError.message,
                                detalles: 'Fallo al intentar actualizar producto'
                            }
                        });
                    }
                } else {
                    console.log(`[sPedido] Producto ${movimiento.CIDPRODUCTO} no requiere actualización`);
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

        console.log(`[sPedido] Procesamiento de movimientos completado. Cambios realizados: ${cambiosRealizados}`);

        // 5. Obtener datos finales actualizados con nombres de almacenes
        console.log('[sPedido] Obteniendo datos finales actualizados');
        const [pedidoFinal, productosRelacionados] = await Promise.all([
            pool.request()
                .input('numeroPedido', sql.VarChar, numeroPedido)
                .query(`
                    SELECT p.*, ap.CNOMBREPRODUCTO, ap.CCODIGOPRODUCTO,
                           ao.CNOMBREALMACEN AS NombreOrigen,
                           ad.CNOMBREALMACEN AS NombreDestino
                    FROM Pedidos p
                    LEFT JOIN admProductos ap ON p.Producto = ap.CIDPRODUCTO
                    LEFT JOIN admAlmacenes ao ON p.Origen = ao.CCODIGOALMACEN
                    LEFT JOIN admAlmacenes ad ON p.Destino = ad.CCODIGOALMACEN
                    WHERE p.NumeroPedido = @numeroPedido
                    ORDER BY p.Producto
                `),
            pool.request()
                .input('numeroPedido', sql.VarChar, numeroPedido)
                .query(`
                    SELECT 
                        m.CIDPRODUCTO,
                        SUM(m.CUNIDADES) AS CUNIDADES,
                        a.CNOMBREPRODUCTO,
                        a.CCODIGOPRODUCTO
                    FROM admMovimientos m
                    INNER JOIN admDocumentos d ON m.CIDDOCUMENTO = d.CIDDOCUMENTO
                    INNER JOIN admProductos a ON m.CIDPRODUCTO = a.CIDPRODUCTO
                    WHERE d.CFOLIO = @numeroPedido
                    GROUP BY m.CIDPRODUCTO, a.CNOMBREPRODUCTO, a.CCODIGOPRODUCTO
                    ORDER BY m.CIDPRODUCTO
                `)
        ]);

        console.log(`[sPedido] Datos finales obtenidos: ${pedidoFinal.recordset.length} productos, ${productosRelacionados.recordset.length} relacionados`);

        // Procesar nombres en los resultados finales
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

        // Actualizar datosBasePedido con los nombres de los almacenes si hay registros
        if (pedidoFinal.recordset.length > 0) {
            const primerRegistro = pedidoFinal.recordset[0];
            datosBasePedido = {
                origen: primerRegistro.NombreOrigen || primerRegistro.Origen || 'No especificado',
                destino: primerRegistro.NombreDestino || primerRegistro.Destino || 'No especificado',
                codigoOrigen: primerRegistro.Origen || 'No especificado',
                codigoDestino: primerRegistro.Destino || 'No especificado',
                fechaCreacion: primerRegistro.FechaCreacion || primerRegistro.Fecha_Creacion || 'No especificada',
                estatus: primerRegistro.Estatus || 'Activo'
            };
        }

        // Respuesta final al cliente
        const responseData = {
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
        };

        console.log('[sPedido] Enviando respuesta final:', responseData);
        res.status(200).json(responseData);

    } catch (error) {
        console.error('[sPedido] Error en el proceso:', {
            error: error.message,
            stack: error.stack,
            numeroPedido,
            timestamp: new Date().toISOString()
        });
        
        res.status(500).json({ 
            message: 'Error en el servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Ocurrió un error al procesar la solicitud',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            detalles: 'Error al procesar el pedido',
            timestamp: new Date().toISOString()
        });
    } finally {
        console.log(`[sPedido] Finalizada solicitud para pedido ${numeroPedido}`);
    }
}