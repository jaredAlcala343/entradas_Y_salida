import { connectToDatabase, sql } from '../../dbconfig';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  try {
    const { pedidoId, productoId, motivo, cantidad, usuario, password } = req.body;

    // 1. Validar credenciales
    const usuarioValido = await validarUsuario(usuario, password);
    if (!usuarioValido) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // 2. Verificar que el pedido existe y no está recibido
    const pedido = await obtenerPedido(pedidoId);
    if (!pedido) {
      return res.status(404).json({ message: `Traspaso ${pedidoId} no encontrado` });
    }

    if (pedido.recibido) {
      return res.status(400).json({ message: 'No se pueden registrar devoluciones en traspasos ya recibidos' });
    }

    // 3. Verificar que el producto pertenece al pedido
    const productoEnPedido = await verificarProductoEnPedido(pedidoId, productoId);
    if (!productoEnPedido) {
      return res.status(400).json({ message: 'Producto no pertenece al pedido' });
    }

    // 4. Verificar que no se devuelve más de lo pedido
    if (cantidad > productoEnPedido.CantidadPedido) {
      return res.status(400).json({ 
        message: `Cantidad a devolver (${cantidad}) excede lo pedido (${productoEnPedido.CantidadPedido})` 
      });
    }

    // 5. Registrar la devolución en el campo Observaciones del pedido
    const resultado = await registrarDevolucion(pedidoId, {
      productoId,
      codigoProducto: productoEnPedido.CCODIGOPRODUCTO,
      nombreProducto: productoEnPedido.CNOMBREPRODUCTO,
      motivo,
      cantidad,
      usuario,
      fecha: new Date().toISOString()
    });

    // 6. Actualizar inventario en el almacén origen
    await actualizarInventario(productoId, cantidad, 'devolucion', pedido.Origen);

    res.status(200).json({ 
      success: true,
      message: 'Devolución registrada correctamente',
      devolucion: resultado
    });

  } catch (error) {
    console.error('Error en registrarDevolucion:', error);
    res.status(500).json({ message: error.message || 'Error al registrar devolución' });
  }
}

// Funciones auxiliares
async function validarUsuario(usuario, password) {
  const pool = await connectToDatabase();
  try {
    const result = await pool.request()
      .input('usuario', sql.NVarChar, usuario)
      .input('password', sql.NVarChar, password)
      .query(`
        SELECT * FROM UsuariosLocal
        WHERE correo = @usuario AND contraseña = @password
        AND Rol IN ('Admin', 'Supervisor')
      `);
    return result.recordset.length > 0;
  } catch (error) {
    console.error('Error al validar usuario:', error);
    throw new Error('Error al validar usuario');
  }
}

async function obtenerPedido(pedidoId) {
  const pool = await connectToDatabase();
  try {
    const result = await pool.request()
      .input('numeroPedido', sql.NVarChar, pedidoId)
      .query(`
        SELECT 
          NumeroPedido,
          Origen,
          Destino,
          Estatus,
          Observaciones
        FROM Pedidos 
        WHERE NumeroPedido = @numeroPedido
      `);

    if (result.recordset.length === 0) return null;

    const pedido = result.recordset[0];
    return {
      ...pedido,
      recibido: pedido.Estatus === 'Recibido'
    };
  } catch (error) {
    console.error('Error al obtener pedido:', error);
    throw new Error('Error al obtener pedido');
  }
}

async function verificarProductoEnPedido(pedidoId, productoId) {
  const pool = await connectToDatabase();
  try {
    const result = await pool.request()
      .input('numeroPedido', sql.NVarChar, pedidoId)
      .input('productoId', sql.NVarChar, productoId)
      .query(`
        SELECT 
          p.Unidades AS CantidadPedido,
          prod.CCODIGOPRODUCTO,
          prod.CNOMBREPRODUCTO
        FROM Pedidos p
        JOIN admProductos prod ON p.Producto = prod.CIDPRODUCTO
        WHERE p.NumeroPedido = @numeroPedido
        AND prod.CCODIGOPRODUCTO = @productoId
      `);

    return result.recordset[0] || null;
  } catch (error) {
    console.error('Error al verificar producto en pedido:', error);
    throw new Error('Error al verificar producto en pedido');
  }
}

async function registrarDevolucion(pedidoId, devolucion) {
  const pool = await connectToDatabase();
  try {
    // 1. Obtener las observaciones actuales del pedido
    const pedidoResult = await pool.request()
      .input('numeroPedido', sql.NVarChar, pedidoId)
      .query(`
        SELECT Observaciones FROM Pedidos 
        WHERE NumeroPedido = @numeroPedido
      `);

    const observacionesActuales = pedidoResult.recordset[0]?.Observaciones || '';
    
    // 2. Extraer devoluciones existentes (si las hay)
    let devolucionesExistentes = [];
    const match = observacionesActuales.match(/\{.*\}/);
    if (match) {
      try {
        const jsonStr = match[0];
        const data = JSON.parse(jsonStr);
        devolucionesExistentes = data.devoluciones || [];
      } catch (e) {
        console.error('Error al parsear devoluciones existentes:', e);
      }
    }

    // 3. Agregar la nueva devolución
    const nuevasDevoluciones = [...devolucionesExistentes, devolucion];
    const textoObservaciones = observacionesActuales.replace(/\{.*\}/, '').trim();
    const nuevasObservaciones = `${textoObservaciones} ${JSON.stringify({ devoluciones: nuevasDevoluciones })}`;

    // 4. Actualizar el pedido con las nuevas observaciones
    await pool.request()
      .input('numeroPedido', sql.NVarChar, pedidoId)
      .input('observaciones', sql.NVarChar, nuevasObservaciones)
      .query(`
        UPDATE Pedidos 
        SET Observaciones = @observaciones
        WHERE NumeroPedido = @numeroPedido
      `);

    return devolucion;
  } catch (error) {
    console.error('Error al registrar devolución:', error);
    throw new Error('Error al registrar devolución');
  }
}

async function actualizarInventario(productoId, cantidad, tipo, ubicacion) {
  const pool = await connectToDatabase();
  try {
    const operacion = tipo === 'devolucion' ? '+' : '-';
    await pool.request()
      .input('cantidad', sql.Int, cantidad)
      .input('productoId', sql.NVarChar, productoId)
      .input('ubicacion', sql.VarChar, ubicacion)
      .query(`
        UPDATE Inventario 
        SET Cantidad = Cantidad ${operacion} @cantidad
        WHERE ProductoID = @productoId AND AlmacenID = @ubicacion
      `);
  } catch (error) {
    console.error('Error al actualizar inventario:', error);
    throw new Error('Error al actualizar inventario');
  }
}