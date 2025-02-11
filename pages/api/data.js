import { connectToDatabase, sql } from '../../dbconfig';

export default async function handler(req, res) {
  const { type, usuario, contrasena } = req.query;

  try {
    const pool = await connectToDatabase();
    if (req.method === 'GET') {
      if (!type) return res.status(400).json({ message: 'Query type is required' });

      if (type === 'almacenes') {
        const almacenes = await pool
          .request()
          .query('SELECT CIDALMACEN, CCODIGO_ALMACEN, CNOMBRE_ALMACEN FROM admAlmacenes');
        return res.status(200).json(almacenes.recordset);
      }

      if (type === 'productos') {
        const productos = await pool
          .request()
          .query('SELECT CIDPRODUCTO, CCODIGO_PRODUCTO, CNOMBRE_PRODUCTO, CCONTROL_EXISTENCIA FROM admProductos ORDER BY CNOMBREPRODUCTO ASC');
        return res.status(200).json(productos.recordset);
      }

      if (type === 'validarUsuario') {
        if (!usuario || !contrasena) {
          return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
        }
        const query = `SELECT * FROM Usuarios WHERE correo = @usuario`;
        const result = await pool
          .request()
          .input('usuario', sql.NVarChar, usuario)
          .query(query);
      
        if (result.recordset.length === 0) {
          return res.status(200).json({ valid: false });
        }
      
        const user = result.recordset[0];
        // Comparar la contraseña en texto plano (no recomendado para producción)
        const passwordIsValid = user.contrasena === contrasena;
      
        return res.status(200).json({ valid: passwordIsValid });
      }
      
    }

    return res.status(405).json({ message: 'Método no permitido' });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
