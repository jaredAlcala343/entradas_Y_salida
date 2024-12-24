import { connectToDatabase, sql } from '../../dbconfig';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { code } = req.query;

  console.log('Product code received:', code); // Registro del valor de 'code'

  try {
    const pool = await connectToDatabase();
    console.log('Connected to database'); // Registro de conexión exitosa

    const result = await pool.request()
      .input('productCode', sql.VarChar, code)
      .query("SELECT CCODIGOPRODUCTO, CNOMBREPRODUCTO, CDESCRIPCIONPRODUCTO, CCONTROLEXISTENCIA, CTIPOPRODUCTO, CPRECIO1, CPRECIO2, CPRECIO3, CPRECIO4, CPRECIO5, CPRECIO6, CPRECIO7, CPRECIO8, CPRECIO9, CPRECIO10 FROM dbo.admProductos WHERE CCODALTERN = @productCode  ");

    console.log('Query result:', result); // Registro del resultado de la consulta

    if (result.recordset.length === 0) {
      console.log('No product found with code:', code); // Registro si no se encuentra el producto
      return res.status(404).json({ message: 'Product not found' });
    }

    const product = result.recordset[0];
    console.log('Product found:', product); // Registro del producto encontrado
    return res.status(200).json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
