import { connectToDatabase, sql } from '../../dbconfig';

export default async function handler(req, res) {
  console.log('--- INICIO DEL PROCESO ---');
  console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));

  if (req.method !== 'POST') {
    console.log('Error: Método no permitido');
    return res.status(405).json({ message: 'Método no permitido' });
  }

  try {
    // Verificación de contenido JSON
    if (!req.headers['content-type']?.includes('application/json')) {
      console.log('Error: Content-Type no es JSON');
      return res.status(400).json({ message: 'El contenido debe ser JSON' });
    }

    const { pedidoId, productoId, motivo, cantidad, usuario, password } = req.body;
    console.log('Parámetros recibidos:', { pedidoId, productoId, cantidad });

    // Validación de parámetros
    if (!pedidoId || !productoId || !motivo || !cantidad || !usuario || !password) {
      console.log('Error: Faltan parámetros requeridos');
      return res.status(400).json({ message: 'Faltan parámetros requeridos' });
    }

    // Conexión a la base de datos
    console.log('Estableciendo conexión a la base de datos...');
    const pool = await connectToDatabase();
    
    // 1. Validar credenciales
    console.log('Validando credenciales para usuario:', usuario);
    const usuarioValido = await pool.request()
      .input('usuario', sql.NVarChar(100), usuario)
      .input('password', sql.NVarChar(100), password)
      .query(`
        SELECT 1 FROM UsuariosLocal 
        WHERE correo = @usuario COLLATE SQL_Latin1_General_CP1_CS_AS
        AND contraseña = @password COLLATE SQL_Latin1_General_CP1_CS_AS
        AND Rol IN ('Admin', 'Supervisor')
      `);

    if (usuarioValido.recordset.length === 0) {
      console.log('Error: Credenciales inválidas');
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // 2. Verificar pedido
    console.log(`Buscando pedido ${pedidoId}...`);
    const pedido = await pool.request()
      .input('pedidoId', sql.NVarChar(50), pedidoId)
      .query(`
        SELECT Estatus FROM Pedidos WHERE NumeroPedido = @pedidoId
      `);

    if (pedido.recordset.length === 0) {
      console.log(`Error: Pedido ${pedidoId} no encontrado`);
      return res.status(404).json({ message: `Pedido ${pedidoId} no encontrado` });
    }

    if (pedido.recordset[0].Estatus === 'Recibido') {
      console.log('Error: Pedido ya recibido');
      return res.status(400).json({ message: 'No se pueden registrar devoluciones en traspasos ya recibidos' });
    }

    // 3. Consulta principal para obtener movimientos
    const queryMovimientos = `
      WITH DocumentoBase AS (
        SELECT D.CIDDOCUMENTO, M.CIDPRODUCTO
        FROM admDocumentos AS D, admMovimientos AS M
        WHERE D.CFOLIO = @pedidoId
      ),
      MovimientosDocumento AS (
        SELECT 
          m.CIDMOVIMIENTO,
          m.CIDPRODUCTO,
          m.CNUMEROMOVIMIENTO,
          m.CUNIDADES,
          m.CFECHA,
          ROW_NUMBER() OVER (ORDER BY m.CNUMEROMOVIMIENTO) AS RowNum
        FROM DocumentoBase db
        JOIN admMovimientos m ON db.CIDDOCUMENTO = m.CIDDOCUMENTO
      ),
      PrimerProducto AS (
        SELECT CIDPRODUCTO 
        FROM MovimientosDocumento 
        WHERE RowNum = 1
      )
      SELECT DISTINCT
        md.CIDPRODUCTO,
        md.CNUMEROMOVIMIENTO AS MovPrincipal_Num,
        md.CUNIDADES AS MovPrincipal_Unidades,
        md.CFECHA AS MovPrincipal_Fecha,
        
        -- Movimientos ocultos relacionados
        mo.CIDMOVIMIENTO,
        mo.CIDPRODUCTO,
        mo.CNUMEROMOVIMIENTO AS MovOculto_Num,
        mo.CUNIDADES AS MovOculto_Unidades,
        mo.CFECHA AS MovOculto_Fecha
        
      FROM MovimientosDocumento md
      LEFT JOIN admMovimientos mo ON 
        (mo.CIDMOVTOOWNER = md.CIDMOVIMIENTO OR mo.CIDMOVTOORIGEN = md.CIDMOVIMIENTO)
        AND mo.CMOVTOOCULTO = 1
      WHERE 
        md.CIDPRODUCTO NOT IN (SELECT CIDPRODUCTO FROM PrimerProducto)
        OR EXISTS (
          SELECT 1 
          FROM admMovimientos om 
          WHERE (om.CIDMOVTOOWNER = md.CIDMOVIMIENTO OR om.CIDMOVTOORIGEN = md.CIDMOVIMIENTO)
          AND om.CMOVTOOCULTO = 1
        )
        AND mo.CIDPRODUCTO = @productoId
      ORDER BY 
        md.CIDPRODUCTO,
        md.CNUMEROMOVIMIENTO;
    `;

    console.log('Ejecutando consulta principal de movimientos...');
    const movimientosResult = await pool.request()
      .input('pedidoId', sql.NVarChar(50), pedidoId)
      .input('productoId', sql.NVarChar(50), productoId)
      .query(queryMovimientos);

    console.log('Resultado de la consulta:', {
      rowCount: movimientosResult.recordset.length,
      sampleData: movimientosResult.recordset.slice(0, 2)
    });

    if (movimientosResult.recordset.length === 0) {
      console.log('Realizando verificación alternativa...');
      const productoExiste = await pool.request()
        .input('productoId', sql.NVarChar(50), productoId)
        .query(`
          SELECT TOP 1 CCODIGOPRODUCTO 
          FROM admProductos 
          WHERE CCODIGOPRODUCTO = @productoId COLLATE SQL_Latin1_General_CP1_CS_AS
        `);

      if (productoExiste.recordset.length === 0) {
        console.log(`Error: Producto ${productoId} no existe en el sistema`);
        return res.status(400).json({ message: `El código de producto ${productoId} no existe en el sistema` });
      }

      const productoEnPedido = await pool.request()
        .input('pedidoId', sql.NVarChar(50), pedidoId)
        .input('productoId', sql.NVarChar(50), productoId)
        .query(`
          SELECT TOP 1 p.CCODIGOPRODUCTO
          FROM admDocumentos d
          JOIN admMovimientos m ON d.CIDDOCUMENTO = m.CIDDOCUMENTO
          JOIN admProductos p ON m.CIDPRODUCTO = p.CIDPRODUCTO
          WHERE d.CFOLIO = @pedidoId AND p.CCODIGOPRODUCTO = @productoId COLLATE SQL_Latin1_General_CP1_CS_AS
        `);

      if (productoEnPedido.recordset.length === 0) {
        console.log(`Error: Producto ${productoId} no está en el pedido ${pedidoId}`);
        return res.status(400).json({ message: `El producto ${productoId} no está en el pedido ${pedidoId}` });
      }

      console.log(`Error: Producto ${productoId} está en el pedido pero no tiene movimientos válidos`);
      return res.status(400).json({ 
        message: `El producto ${productoId} está en el pedido pero no tiene movimientos válidos para devolución`,
        queryEjecutada: queryMovimientos
      });
    }

    // 4. Obtener valores actuales de CUNIDADES y CUNIDADESCAPTURADAS
    console.log('Obteniendo valores actuales de movimientos...');
    const movimientosConValores = [];
    
    for (const movimiento of movimientosResult.recordset) {
      // Para movimiento principal
      if (movimiento.CIDMOVIMIENTO) {
        const movimientoActual = await pool.request()
          .input('movimientoId', sql.Int, movimiento.CIDMOVIMIENTO)
          .query(`
            SELECT CUNIDADES, CUNIDADESCAPTURADAS 
            FROM admMovimientos 
            WHERE CIDMOVIMIENTO = @movimientoId
          `);
        
        console.log(`Valores actuales para movimiento principal ${movimiento.CIDMOVIMIENTO}:`, {
          CUNIDADES: movimientoActual.recordset[0]?.CUNIDADES,
          CUNIDADESCAPTURADAS: movimientoActual.recordset[0]?.CUNIDADESCAPTURADAS
        });

        movimientosConValores.push({
          ...movimiento,
          tipo: 'principal',
          CIDMOVIMIENTO: movimiento.CIDMOVIMIENTO,
          CUNIDADES_ACTUAL: movimientoActual.recordset[0]?.CUNIDADES,
          CUNIDADESCAPTURADAS_ACTUAL: movimientoActual.recordset[0]?.CUNIDADESCAPTURADAS
        });
      }

      // Para movimiento oculto
      if (movimiento.MovOcultoId) {
        const movimientoOcultoActual = await pool.request()
          .input('movimientoId', sql.Int, movimiento.MovOcultoId)
          .query(`
            SELECT CUNIDADES, CUNIDADESCAPTURADAS 
            FROM admMovimientos 
            WHERE CIDMOVIMIENTO = @movimientoId
          `);
        
        console.log(`Valores actuales para movimiento oculto ${movimiento.MovOcultoId}:`, {
          CUNIDADES: movimientoOcultoActual.recordset[0]?.CUNIDADES,
          CUNIDADESCAPTURADAS: movimientoOcultoActual.recordset[0]?.CUNIDADESCAPTURADAS
        });

        movimientosConValores.push({
          ...movimiento,
          tipo: 'oculto',
          CIDMOVIMIENTO: movimiento.MovOcultoId,
          CUNIDADES_ACTUAL: movimientoOcultoActual.recordset[0]?.CUNIDADES,
          CUNIDADESCAPTURADAS_ACTUAL: movimientoOcultoActual.recordset[0]?.CUNIDADESCAPTURADAS
        });
      }
    }

    // Calcular total de unidades disponibles
    const totalUnidades = movimientosConValores.reduce((sum, item) => {
      return sum + (item.CUNIDADES_ACTUAL || 0);
    }, 0);

    console.log(`Total unidades disponibles: ${totalUnidades}`);

    if (cantidad > totalUnidades) {
      console.log(`Error: Cantidad solicitada (${cantidad}) excede existencias (${totalUnidades})`);
      return res.status(400).json({ 
        message: 'Cantidad a devolver excede lo pedido',
        cantidadMaxima: totalUnidades
      });
    }

    // 5. Transacción para actualizaciones
    const transaction = new sql.Transaction(pool);
    try {
      console.log('Iniciando transacción...');
      await transaction.begin();

      // Actualizar movimientos con los valores obtenidos
      console.log('Actualizando movimientos...');
      const updates = [];
      
      for (const movimiento of movimientosConValores) {
        if (!movimiento.CIDMOVIMIENTO) continue;

        const nuevaCantidad = movimiento.CUNIDADES_ACTUAL - cantidad;
        const nuevaCantidadCapturada = movimiento.CUNIDADESCAPTURADAS_ACTUAL - cantidad;

        console.log(`Actualizando movimiento ${movimiento.CIDMOVIMIENTO} (${movimiento.tipo}):`, {
          anterior: {
            CUNIDADES: movimiento.CUNIDADES_ACTUAL,
            CUNIDADESCAPTURADAS: movimiento.CUNIDADESCAPTURADAS_ACTUAL
          },
          nuevo: {
            CUNIDADES: nuevaCantidad,
            CUNIDADESCAPTURADAS: nuevaCantidadCapturada
          }
        });

        const updateRequest = new sql.Request(transaction)
          .input('movimientoId', sql.Int, movimiento.CIDMOVIMIENTO)
          .input('nuevaCantidad', sql.Decimal(18, 2), nuevaCantidad)
          .input('nuevaCantidadCapturada', sql.Decimal(18, 2), nuevaCantidadCapturada)
          .query(`
            UPDATE admMovimientos
            SET 
              CUNIDADES = @nuevaCantidad,
              CUNIDADESCAPTURADAS = @nuevaCantidadCapturada
            WHERE CIDMOVIMIENTO = @movimientoId
          `);

        // Ejecutamos cada update secuencialmente para evitar problemas de concurrencia
        await updateRequest;
      }

      // Actualizar la tabla Pedidos
      console.log('Actualizando unidades en tabla Pedidos...');
      await new sql.Request(transaction)
        .input('pedidoId', sql.NVarChar(50), pedidoId)
        .input('productoId', sql.NVarChar(50), productoId)
        .input('cantidad', sql.Decimal(18, 2), cantidad)
        .query(`
          UPDATE Pedidos
          SET Unidades = Unidades - @cantidad
          WHERE NumeroPedido = @pedidoId
          AND Producto = @productoId
        `);

      await transaction.commit();
      console.log('Transacción completada con éxito');

      return res.status(200).json({
        success: true,
        message: 'Devolución registrada correctamente',
        detalles: {
          pedido: pedidoId,
          producto: productoId,
          cantidad,
          movimientosActualizados: movimientosConValores.length,
          pedidoActualizado: true,
          totalUnidadesAntes: totalUnidades,
          totalUnidadesDespues: totalUnidades - cantidad
        }
      });

    } catch (error) {
      if (transaction._aborted === false) {
        try {
          await transaction.rollback();
          console.error('Transacción revertida debido a error:', error.message);
        } catch (rollbackError) {
          console.error('Error al revertir la transacción:', rollbackError.message);
        }
      }
      
      console.error('Error en el proceso:', error.message);
      return res.status(500).json({
        message: 'Error al procesar la devolución',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

  } catch (error) {
    console.error('Error en el proceso principal:', error.message);
    return res.status(500).json({
      message: 'Error al procesar la solicitud',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    console.log('--- FIN DEL PROCESO ---\n');
  }
}