import { connectToDatabase, sql } from '../../dbconfig';

// Crear un nuevo inventario
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { NombreInventario, Usuario } = req.body;

    if (!NombreInventario || !Usuario) {
      return res.status(400).json({ message: 'Faltan datos necesarios' });
    }

    try {
      const pool = await connectToDatabase();

      // Insertar el nuevo inventario
      const result = await pool.request()
        .input('NombreInventario', sql.NVarChar, NombreInventario)
        .input('Usuario', sql.NVarChar, Usuario)
        .query(
          `INSERT INTO Inventarios (NombreInventario, Usuario, FechaCreacion)
          VALUES (@NombreInventario, @Usuario, GETDATE());`
        );

      res.status(200).json({ success: true, message: 'Inventario creado exitosamente' });
    } catch (error) {
      console.error('Error al crear el inventario:', error);
      res.status(500).json({ message: 'Error al crear el inventario', error });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Método ${req.method} no permitido`);
  }
}

// Registrar productos escaneados en un inventario
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { InventarioID, ProductoID, Unidades } = req.body;

    if (!InventarioID || !ProductoID || !Unidades) {
      return res.status(400).json({ message: 'Faltan datos necesarios' });
    }

    try {
      const pool = await connectToDatabase();

      // Insertar el producto escaneado
      await pool.request()
        .input('InventarioID', sql.Int, InventarioID)
        .input('ProductoID', sql.Int, ProductoID)
        .input('Unidades', sql.Int, Unidades)
        .query(
          `INSERT INTO InventarioDetalle (InventarioID, ProductoID, Unidades)
          VALUES (@InventarioID, @ProductoID, @Unidades);`
        );

      res.status(200).json({ success: true, message: 'Producto registrado exitosamente' });
    } catch (error) {
      console.error('Error al registrar el producto:', error);
      res.status(500).json({ message: 'Error al registrar el producto', error });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Método ${req.method} no permitido`);
  }
}

// Obtener el conteo de productos en un inventario
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { InventarioID } = req.query;

    if (!InventarioID) {
      return res.status(400).json({ message: 'Falta el ID del inventario' });
    }

    try {
      const pool = await connectToDatabase();

      // Obtener el conteo de productos
      const result = await pool.request()
        .input('InventarioID', sql.Int, InventarioID)
        .query(
          `SELECT P.CCODIGOPRODUCTO, P.CNOMBREPRODUCTO, SUM(ID.Unidades) AS TotalUnidades
          FROM InventarioDetalle ID
          INNER JOIN admProductos P ON ID.ProductoID = P.CIDPRODUCTO
          WHERE ID.InventarioID = @InventarioID
          GROUP BY P.CCODIGOPRODUCTO, P.CNOMBREPRODUCTO;`
        );

      res.status(200).json(result.recordset);
    } catch (error) {
      console.error('Error al obtener el conteo de productos:', error);
      res.status(500).json({ message: 'Error al obtener el conteo de productos', error });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Método ${req.method} no permitido`);
  }
}