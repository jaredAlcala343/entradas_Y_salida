import { connectToDatabase, sql } from '../../dbconfig';

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
    const result = await pool.request()
      .input("fechaInicio", sql.Date, fechaInicio)
      .input("fechaFin", sql.Date, fechaFin)
      .query(`
        SELECT distinct NumeroPedido, Origen, Destino, Estatus, Observaciones
        FROM Pedidos
        WHERE Fecha_Creacion BETWEEN @fechaInicio AND @fechaFin
      `);

    res.status(200).json({ pedidos: result.recordset });
  } catch (error) {
    console.error("Error al obtener pedidos:", error);
    res.status(500).json({ message: "Error al obtener pedidos" });
  }
}