import { connectToDatabase, sql } from '../../dbconfig';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  try {
    const pool = await connectToDatabase();

    // Consulta SQL agrupando por NumeroPedido para contar solo pedidos únicos
    const query = `
      SELECT 
        COUNT(DISTINCT NumeroPedido) AS totalOrders, 
        COUNT(DISTINCT CASE WHEN Estatus = 'Pendiente' THEN NumeroPedido END) AS pendingOrders,
        COUNT(DISTINCT CASE WHEN Estatus = 'En Proceso' THEN NumeroPedido END) AS inProgressOrders,
        COUNT(DISTINCT CASE WHEN Estatus = 'Completado' THEN NumeroPedido END) AS completedOrders,
        COUNT(DISTINCT CASE WHEN Fecha_Compromiso < GETDATE() AND Fecha_Entrega IS NULL THEN NumeroPedido END) AS overdueOrders
      FROM Pedidos;
    `;

    const result = await pool.request().query(query);
    const metrics = result.recordset[0] || {
      totalOrders: 0,
      pendingOrders: 0,
      inProgressOrders: 0,
      completedOrders: 0,
      overdueOrders: 0,
    };

    res.status(200).json(metrics);
  } catch (error) {
    console.error('Error al obtener métricas:', error);
    res.status(500).json({ message: 'Error al obtener métricas', error });
  }
}
