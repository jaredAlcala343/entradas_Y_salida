import { connectToDatabase, sql } from '../../dbconfig';

export default async function handler(req, res) {
  const { method } = req;

  if (method === 'GET') {
    const { pedidoId } = req.query;

    if (!pedidoId) {
      return res.status(400).json({ message: 'Número de pedido es requerido' });
    }

    try {
      const pool = await connectToDatabase();

      // Obtener datos del pedido
      const pedidoResult = await pool.request()
        .input('pedidoId', sql.NVarChar, pedidoId)
        .query('SELECT NumeroPedido, Origen, Destino FROM Pedidos WHERE NumeroPedido = @pedidoId');

      if (pedidoResult.recordset.length === 0) {
        return res.status(404).json({ message: 'Pedido no encontrado' });
      }

      const pedido = pedidoResult.recordset[0];

      // Obtener nombres de almacenes de origen y destino
      const origenResult = await pool.request()
        .input('CIDALMACEN', sql.VarChar, pedido.Origen)
        .query('SELECT CNOMBREALMACEN FROM admAlmacenes WHERE CCODIGOALMACEN = @CIDALMACEN');

      const destinoResult = await pool.request()
        .input('CIDALMACEN', sql.VarChar, pedido.Destino)
        .query('SELECT CNOMBREALMACEN FROM admAlmacenes WHERE CCODIGOALMACEN = @CIDALMACEN');

      const nombreOrigen = origenResult.recordset[0]?.CNOMBREALMACEN || 'Desconocido';
      const nombreDestino = destinoResult.recordset[0]?.CNOMBREALMACEN || 'Desconocido';

      // Obtener productos asociados al pedido
      const productosResult = await pool.request()
        .input('pedidoId', sql.NVarChar, pedidoId)
        .query('SELECT Producto AS CIDPRODUCTO, Unidades FROM Pedidos WHERE NumeroPedido = @pedidoId');

      const productos = productosResult.recordset;

      // Obtener nombres y códigos de los productos desde admProductos
      const productosConNombre = await Promise.all(
        productos.map(async (producto) => {
          const productoInfo = await pool.request()
            .input('CIDPRODUCTO', sql.Int, producto.CIDPRODUCTO)
            .query('SELECT CCODIGOPRODUCTO, CNOMBREPRODUCTO FROM admProductos WHERE CIDPRODUCTO = @CIDPRODUCTO');

          return {
            nombre: productoInfo.recordset[0]?.CNOMBREPRODUCTO || 'Producto no encontrado',
            cantidad: producto.Unidades,
            codigo: productoInfo.recordset[0]?.CCODIGOPRODUCTO || 'Código no encontrado'
          };
        })
      );

      return res.status(200).json({
        numeroPedido: pedido.NumeroPedido,
        origen: nombreOrigen,
        destino: nombreDestino,
        productos: productosConNombre
      });

    } catch (err) {
      console.error('Error al obtener el pedido:', err);
      return res.status(500).json({ message: 'Error interno del servidor' });
    }

  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
}
