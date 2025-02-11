import { connectToDatabase, sql } from '../../dbconfig';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  try {
    const pool = await connectToDatabase();

    // Consulta SQL con JOIN para obtener los códigos de producto (CCODIGOPRODUCTO)
    const query = `
      SELECT TOP 10 
        p.Producto, 
        SUM(p.Unidades) AS totalUnidades,
        pr.CCODIGO_PRODUCTO
      FROM Pedidos p
      INNER JOIN admProductos pr ON p.Producto = pr.CIDPRODUCTO
      GROUP BY p.Producto, pr.CCODIGO_PRODUCTO
      ORDER BY totalUnidades DESC;
    `;

    const result = await pool.request().query(query);

    res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Error al obtener productos más pedidos:', error);
    res.status(500).json({ message: 'Error al obtener productos', error });
  }
}
