import { connectToDatabase, sql } from '../../dbconfig';

export default async function handler(req, res) {
  const { type, usuario, contrasena } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const pool = await connectToDatabase();

    // Endpoint para obtener almacenes
    if (type === 'almacenes') {
      const almacenes = await pool.request()
        .query("SELECT CIDALMACEN, CCODIGOALMACEN, CNOMBREALMACEN FROM dbo.admAlmacenes");
      return res.status(200).json(almacenes.recordset);
    }

    // Endpoint para obtener productos
    if (type === 'productos') {
      const productos = await pool.request()
        .query("SELECT CIDPRODUCTO, CCODIGOPRODUCTO, CNOMBREPRODUCTO FROM dbo.admProductos ORDER BY CNOMBREPRODUCTO ASC");
      return res.status(200).json(productos.recordset);
    }

    // Validar usuario y contraseña
    if (type === 'validarUsuario') {
      const query = `
        SELECT * FROM dbo.UsuariosLocal 
        WHERE Nombre = @usuario AND Clave = @contrasena
      `;
      const result = await pool.request()
        .input('usuario', sql.NVarChar, usuario)
        .input('contrasena', sql.NVarChar, contrasena)
        .query(query);

      if (result.recordset.length > 0) {
        return res.status(200).json({ valid: true });
      } else {
        return res.status(200).json({ valid: false });
      }
    }

    // NUEVO: Endpoint para la gráfica de inventario
    if (type === 'inventario') {
      const inventario = await pool.request()
        .query(`
          SELECT 
            CCODIGOPRODUCTO AS CodigoProducto,
            CCONTROLEXISTENCIA AS Stock
          FROM dbo.admProductos
          WHERE CCONTROLEXISTENCIA IS NOT NULL 
          ORDER BY CCODIGOPRODUCTO ASC
        `);

      // Formatear los datos antes de enviarlos
      const data = inventario.recordset.map(item => ({
        CodigoProducto: item.CodigoProducto.trim(),
        Stock: item.Stock,
      }));

      return res.status(200).json(data);
    }

    return res.status(400).json({ message: 'Invalid query type' });
  } catch (error) {
    console.error('Error fetching data:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
