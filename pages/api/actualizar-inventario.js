import { MongoClient } from 'mongodb';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { inventarios, usuario, contrasena } = req.body;

    // Conectar a la base de datos
    const client = new MongoClient(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    try {
      await client.connect();
      const db = client.db(process.env.MONGODB_DB);
      const collection = db.collection('inventarios');

      // Actualizar el inventario en la base de datos
      for (const producto of inventarios) {
        await collection.updateOne(
          { CCODIGOPRODUCTO: producto.CCODIGOPRODUCTO },
          { $set: { EXISTENCIA_TOTAL_PRODUCTO: producto.EXISTENCIA_TOTAL_PRODUCTO, fechaInventario: new Date() } }
        );
      }

      // Enviar un correo de confirmación
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: 'gerente@example.com, jefes@example.com', // Cambia esto por las direcciones de correo reales
        subject: 'Inventario Completado Sin Discrepancias',
        text: `Usuario: ${usuario}\nContraseña: ${contrasena}\nInventario completado sin discrepancias para el almacén ${almacenSeleccionado}`,
      };

      await transporter.sendMail(mailOptions);

      res.status(200).json({ message: 'Inventario actualizado y correo enviado' });
    } catch (error) {
      console.error('Error al actualizar el inventario:', error);
      res.status(500).json({ error: 'Error al actualizar el inventario' });
    } finally {
      await client.close();
    }
  } else {
    res.status(405).json({ error: 'Método no permitido' });
  }
}