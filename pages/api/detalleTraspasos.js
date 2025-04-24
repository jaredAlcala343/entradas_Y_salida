import { connectToDatabase, sql } from "../../dbconfig";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  const { fechaInicio, fechaFin } = req.query;

  if (!fechaInicio || !fechaFin) {
    return res.status(400).json({ message: "Faltan las fechas de inicio o fin" });
  }

  try {
    const pool = await connectToDatabase();

    // Obtener pedidos dentro del rango de fechas
    const pedidos = await pool.request()
      .input("fechaInicio", sql.Date, fechaInicio)
      .input("fechaFin", sql.Date, fechaFin)
      .query(`
        SELECT DISTINCT
          p.NumeroPedido, 
          a1.CNOMBREALMACEN AS Origen, 
          a2.CNOMBREALMACEN AS Destino, 
          p.Estatus
        FROM Pedidos p
        INNER JOIN admAlmacenes a1 ON p.Origen = a1.CCODIGOALMACEN
        INNER JOIN admAlmacenes a2 ON p.Destino = a2.CCODIGOALMACEN
        WHERE p.Fecha_Creacion BETWEEN @fechaInicio AND @fechaFin
      `);

    if (pedidos.recordset.length === 0) {
      return res.status(404).json({ message: "No se encontraron pedidos en el rango de fechas." });
    }

    // Obtener productos de los pedidos en el rango de fechas
    const productos = await pool.request()
      .input("fechaInicio", sql.Date, fechaInicio)
      .input("fechaFin", sql.Date, fechaFin)
      .query(`
        SELECT DISTINCT
          p.NumeroPedido,
          p.Unidades AS CantidadPedido, 
          p.Producto,
          pr.CNOMBREPRODUCTO, 
          pr.CCODIGOPRODUCTO
        FROM Pedidos p
        INNER JOIN admProductos pr ON p.Producto = pr.CIDPRODUCTO
        WHERE p.Fecha_Creacion BETWEEN @fechaInicio AND @fechaFin
      `);

    // Formatear los datos para agrupar productos por pedido
    const pedidosConProductos = pedidos.recordset.map((pedido) => {
      return {
        ...pedido,
        Productos: productos.recordset.filter(
          (producto) => producto.NumeroPedido === pedido.NumeroPedido
        ),
      };
    });

    res.status(200).json(pedidosConProductos);
  } catch (error) {
    console.error("Error al obtener detalles de los traspasos:", error);
    res.status(500).json({ message: "Error al obtener detalles de los traspasos" });
  }
}