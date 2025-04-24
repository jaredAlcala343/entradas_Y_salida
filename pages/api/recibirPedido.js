import { connectToDatabase, sql } from '../../dbconfig';

export default async function handler(req, res) {
  const { method } = req;

  // Endpoint para verificar productos con formato CODIGO-CANTIDAD
  if (method === 'GET' && req.query.codigoProducto) {
    const { numeroPedido, codigoProducto } = req.query;

    if (!numeroPedido || !codigoProducto) {
      return res.status(400).json({ 
        success: false,
        message: 'Se requieren numeroPedido y codigoProducto'
      });
    }

    try {
      // Separar código y cantidad (formato: CODIGO-3)
      const [codigo, cantidadStr] = codigoProducto.includes('-') 
        ? codigoProducto.split('-') 
        : [codigoProducto, '1'];
      
      const cantidad = parseInt(cantidadStr) || 1;

      const pool = await connectToDatabase();
      
      // Verificar si el producto está en el pedido
      const result = await pool.request()
        .input('numeroPedido', sql.NVarChar, numeroPedido)
        .input('codigoProducto', sql.NVarChar, codigo)
        .query(`
          SELECT 
            p.Producto AS CIDPRODUCTO,
            p.Unidades AS CantidadPedido,
            prod.CCODIGOPRODUCTO,
            prod.CNOMBREPRODUCTO
          FROM Pedidos p
          JOIN admProductos prod ON p.Producto = prod.CIDPRODUCTO
          WHERE p.NumeroPedido = @numeroPedido
          AND prod.CCODIGOPRODUCTO = @codigoProducto
        `);

      if (result.recordset.length === 0) {
        return res.status(404).json({ 
          success: false,
          message: `Producto ${codigo} no encontrado en el pedido ${numeroPedido}`
        });
      }

      const producto = result.recordset[0];
      
      // Solo verificamos que la cantidad no exceda lo pedido
      if (cantidad > producto.CantidadPedido) {
        return res.status(400).json({
          success: false,
          message: `Cantidad escaneada (${cantidad}) excede la pedida (${producto.CantidadPedido})`,
          maxPermitido: producto.CantidadPedido
        });
      }

      return res.status(200).json({
        success: true,
        producto: {
          ...producto,
          cantidadEscaneada: cantidad
        },
        existe: true
      });

    } catch (err) {
      console.error('Error al verificar producto:', err);
      return res.status(500).json({ 
        success: false,
        message: 'Error al verificar producto',
        error: err.message
      });
    }
  }

  // Endpoint principal para manejo de pedidos
  if (method === 'GET') {
    const numeroPedido = req.query.pedidoId || req.query.numeroPedido || req.query.id;

    if (!numeroPedido) {
      return res.status(400).json({ 
        success: false,
        message: 'Número de traspaso es requerido',
        suggestion: 'Use el parámetro pedidoId o numeroPedido en la URL'
      });
    }

    try {
      const pool = await connectToDatabase();

      // 1. Obtener datos básicos del traspaso
      const pedidoResult = await pool.request()
        .input('numeroPedido', sql.NVarChar, numeroPedido)
        .query(`
          SELECT 
            NumeroPedido,
            Origen,
            Destino,
            Estatus,
            CONVERT(varchar, Fecha_Entrega, 120) AS Fecha_Entrega,
            Observaciones
          FROM Pedidos 
          WHERE NumeroPedido = @numeroPedido
        `);

      if (pedidoResult.recordset.length === 0) {
        return res.status(404).json({ 
          success: false,
          message: `Traspaso ${numeroPedido} no encontrado`
        });
      }

      const pedido = pedidoResult.recordset[0];

      // 2. Verificar si el traspaso ya fue recibido
      if (pedido.Estatus === 'Recibido') {
        // Obtener información de devoluciones desde el campo Observaciones (formato JSON)
        let devoluciones = [];
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
          message: 'Traspaso ya recibido',
          recibido: true,
          numeroPedido: pedido.NumeroPedido,
          fechaRecepcion: pedido.Fecha_Entrega,
          recibidoPor: pedido.Observaciones?.replace(/Recibido por:|\{.*\}/g, '')?.trim() || 'Desconocido',
          devoluciones: devoluciones
        });
      }

      // 3. Obtener nombres de almacenes
      const [origenResult, destinoResult] = await Promise.all([
        pool.request()
          .input('codigoAlmacen', sql.VarChar, pedido.Origen)
          .query('SELECT CNOMBREALMACEN FROM admAlmacenes WHERE CCODIGOALMACEN = @codigoAlmacen'),
        pool.request()
          .input('codigoAlmacen', sql.VarChar, pedido.Destino)
          .query('SELECT CNOMBREALMACEN FROM admAlmacenes WHERE CCODIGOALMACEN = @codigoAlmacen')
      ]);

      // 4. Obtener productos del traspaso
      const productosResult = await pool.request()
        .input('numeroPedido', sql.NVarChar, numeroPedido)
        .query(`
          SELECT 
            p.Producto AS CIDPRODUCTO,
            p.Unidades AS CantidadPedido,
            prod.CCODIGOPRODUCTO,
            prod.CNOMBREPRODUCTO
          FROM Pedidos p
          JOIN admProductos prod ON p.Producto = prod.CIDPRODUCTO
          WHERE p.NumeroPedido = @numeroPedido
          ORDER BY prod.CNOMBREPRODUCTO
        `);

      return res.status(200).json({
        success: true,
        numeroPedido: pedido.NumeroPedido,
        origen: origenResult.recordset[0]?.CNOMBREALMACEN || pedido.Origen,
        destino: destinoResult.recordset[0]?.CNOMBREALMACEN || pedido.Destino,
        productos: productosResult.recordset.map(p => ({
          id: p.CIDPRODUCTO,
          codigo: p.CCODIGOPRODUCTO,
          nombre: p.CNOMBREPRODUCTO,
          cantidad: p.CantidadPedido,
          escaneados: 0 // Inicialmente no hay productos escaneados
        })),
        recibido: false
      });

    } catch (err) {
      console.error('Error al obtener traspaso:', err);
      return res.status(500).json({ 
        success: false,
        message: 'Error al procesar la solicitud',
        error: err.message
      });
    }
  }
  else if (method === 'POST') {
    // Lógica para confirmar recepción
    const { pedidoId, usuario, password, productosEscaneados = [], productosDevueltos = [] } = req.body;

    if (!pedidoId || !usuario || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Datos incompletos (se requieren pedidoId, usuario y password)'
      });
    }

    try {
      const pool = await connectToDatabase();

      // 1. Validar usuario y rol (solo Admin o Supervisor)
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

      // 2. Obtener información completa del pedido
      const pedidoResult = await pool.request()
        .input('numeroPedido', sql.NVarChar, pedidoId)
        .query(`
          SELECT 
            Origen, 
            Destino,
            Estatus
          FROM Pedidos 
          WHERE NumeroPedido = @numeroPedido
        `);

      if (pedidoResult.recordset.length === 0) {
        return res.status(404).json({ 
          success: false,
          message: `Traspaso ${pedidoId} no encontrado`
        });
      }

      const { Origen, Destino, Estatus } = pedidoResult.recordset[0];

      // 3. Verificar que el traspaso no esté ya recibido
      if (Estatus === 'Recibido') {
        return res.status(400).json({ 
          success: false,
          message: `El traspaso ${pedidoId} ya fue recibido anteriormente`
        });
      }

      // 4. Preparar datos para actualización
      const observaciones = `Recibido por: ${usuarioInfo.Nombre} (${usuarioInfo.Rol})`;
      
      // Si hay devoluciones, las agregamos como JSON al campo Observaciones
      const observacionesConDevoluciones = productosDevueltos.length > 0
        ? `${observaciones} ${JSON.stringify({ devoluciones: productosDevueltos })}`
        : observaciones;

      // 5. Actualizar estado del traspaso y registrar observaciones
      await pool.request()
        .input('numeroPedido', sql.NVarChar, pedidoId)
        .input('observaciones', sql.NVarChar, observacionesConDevoluciones)
        .query(`
          UPDATE Pedidos 
          SET 
            Estatus = 'Recibido',
            Fecha_Entrega = GETDATE(),
            Observaciones = @observaciones
          WHERE NumeroPedido = @numeroPedido
        `);

      // 6. Actualizar inventario en almacén destino
      try {
        const protocol = req.headers.host.includes('localhost') ? 'http://' : 'https://';
        const apiUrl = `${protocol}${req.headers.host}/api/Almacen_destino`;
        
        const updateResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(req.headers.authorization && { 'Authorization': req.headers.authorization })
          },
          body: JSON.stringify({ 
            numeroPedido: pedidoId, 
            destino: Destino,
            productos: productosEscaneados
          }),
        });

        if (!updateResponse.ok) {
          console.error('Error al llamar a Almacen_destino:', await updateResponse.text());
        }
      } catch (error) {
        console.error('Error en la llamada a Almacen_destino:', error.message);
      }

      // 7. Procesar devoluciones (actualizar inventario en origen)
      if (productosDevueltos.length > 0) {
        try {
          const protocol = req.headers.host.includes('localhost') ? 'http://' : 'https://';
          const apiUrl = `${protocol}${req.headers.host}/api/Almacen_origen`;
          
          const devolucionResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...(req.headers.authorization && { 'Authorization': req.headers.authorization })
            },
            body: JSON.stringify({ 
              numeroPedido: pedidoId, 
              origen: Origen,
              devoluciones: productosDevueltos
            }),
          });

          if (!devolucionResponse.ok) {
            console.error('Error al llamar a Almacen_origen:', await devolucionResponse.text());
          }
        } catch (error) {
          console.error('Error en la llamada a Almacen_origen:', error.message);
        }
      }

      return res.status(200).json({ 
        success: true,
        message: 'Traspaso recibido correctamente',
        numeroPedido: pedidoId,
        recibidoPor: usuarioInfo.Nombre,
        rol: usuarioInfo.Rol,
        fechaRecepcion: new Date().toISOString(),
        productosEscaneados: productosEscaneados.length,
        productosDevueltos: productosDevueltos.length
      });

    } catch (err) {
      console.error('Error al confirmar recepción:', err);
      return res.status(500).json({ 
        success: false,
        message: 'Error al confirmar recepción',
        error: err.message
      });
    }
  }
  else {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({
      success: false,
      message: `Método ${method} no permitido`
    });
  }
}