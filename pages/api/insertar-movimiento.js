import { connectToDatabase, sql } from '../../dbconfig';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  const { TipoMovimiento, Origen, Destino, Producto, Usuario, Contraseña } = req.body;

  // Validación de datos
  if (!TipoMovimiento || !Origen || !Destino || !Producto || !Usuario || !Contraseña) {
    return res.status(400).json({ message: 'Faltan datos necesarios' });
  }

  try {
    // Conectarse a la base de datos
    const pool = await connectToDatabase();

    // Obtener el último número de pedido y generar el siguiente
    const result = await pool.request().query(`
      SELECT MAX(CAST(NumeroPedido AS INT)) AS lastPedido FROM Pedidos;
    `);

    const lastPedido = result.recordset[0]?.lastPedido || 0;
    const numeroPedido = (lastPedido + 1).toString().padStart(6, '0');

    // Fechas
    const fechaCreacion = new Date().toISOString().split('T')[0];
    const fechaCompromiso = new Date(new Date().setDate(new Date().getDate() + 15))
      .toISOString()
      .split('T')[0];

    // Insertar cada producto como una fila separada en la tabla
    for (const prod of Producto) {
      const { ProductoID, Unidades } = prod;

      if (!ProductoID || !Unidades) {
        console.error('Producto inválido:', prod);
        continue; // Saltar productos inválidos
      }

      await pool.request()
        .input('NumeroPedido', sql.NVarChar, numeroPedido)
        .input('Origen', sql.Int, Origen)
        .input('Destino', sql.Int, Destino)
        .input('Producto', sql.Int, ProductoID) // Producto almacena el ID del producto
        .input('Unidades', sql.Int, Unidades)
        .input('Fecha_Creacion', sql.Date, fechaCreacion)
        .input('Fecha_Compromiso', sql.Date, fechaCompromiso)
        .input('Estatus', sql.NVarChar, 'Pendiente')
        .query(`
          INSERT INTO Pedidos 
          (NumeroPedido, Origen, Destino, Producto, Unidades, Fecha_Creacion, Fecha_Compromiso, Estatus)
          VALUES 
          (@NumeroPedido, @Origen, @Destino, @Producto, @Unidades, @Fecha_Creacion, @Fecha_Compromiso, @Estatus);
        `);
    }

    // Confirmar éxito
    res.status(200).json({ success: true, NumeroPedido: numeroPedido });
  } catch (error) {
    console.error('Error al registrar el pedido:', error);
    res.status(500).json({ message: 'Error al registrar el pedido', error });
  }
}
