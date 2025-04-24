import { connectToDatabase, sql } from '../../dbconfig';

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  const { numeroPedido } = req.query;

  try {
    const pool = await connectToDatabase();

    // Obtener detalles del pedido con origen y destino
    const pedido = await pool.request()
      .input("numeroPedido", sql.Int, numeroPedido)
      .query(`
        SELECT 
          p.NumeroPedido, 
          a1.CNOMBREALMACEN AS Origen, 
          a2.CNOMBREALMACEN AS Destino, 
          p.Estatus
        FROM Pedidos p
        INNER JOIN admAlmacenes a1 ON p.Origen = a1.CCODIGOALMACEN
        INNER JOIN admAlmacenes a2 ON p.Destino = a2.CCODIGOALMACEN
        WHERE p.NumeroPedido = @numeroPedido
      `);

    if (pedido.recordset.length === 0) {
      return res.status(404).json({ message: "Pedido no encontrado" });
    }

    // Obtener productos del pedido
    const productos = await pool.request()
      .input("numeroPedido", sql.Int, numeroPedido)
      .query(`
        SELECT 
          p.Unidades AS CantidadPedido, 
          p.Producto,
          pr.CNOMBREPRODUCTO, 
          pr.CCODIGOPRODUCTO
        FROM Pedidos p
        INNER JOIN admProductos pr ON p.Producto = pr.CIDPRODUCTO
        WHERE p.NumeroPedido = @numeroPedido
      `);

    res.status(200).json({
      ...pedido.recordset[0],
      Productos: productos.recordset,
    });
  } catch (error) {
    console.error("Error al obtener detalles del pedido:", error);
    res.status(500).json({ message: "Error al obtener detalles del pedido" });
  }
}