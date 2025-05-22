import nodemailer from "nodemailer";
import JsBarcode from "jsbarcode";
import { createCanvas } from "canvas";
import { connectToDatabase, sql } from "../../dbconfig";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  console.log("📩 Recibiendo datos para enviar correo:", req.body);

  try {
    let { Origen, Destino, NumeroPedido, Producto } = req.body;

    // Validación de datos de entrada
    if (!Origen || !Destino || !NumeroPedido || !Producto || Producto.length === 0) {
      return res.status(400).json({ message: "Datos inválidos en la petición" });
    }

    // Convertir a string para evitar problemas de tipo
    Origen = Origen.toString();
    Destino = Destino.toString();

    console.log(`🛠️ Validación completada. Datos de entrada correctos:`)
    console.log(`Origen: ${Origen}, Destino: ${Destino}, Número de Pedido: ${NumeroPedido}`);

    // Conexión a la base de datos
    const pool = await connectToDatabase();

    // Recuperamos los datos de productos con sus detalles
    const productos = Producto.map(prod => {
      let nombreBase = "";
      let caracteristicas = "";

      // Filtrar productos que contienen "null" en su nombre
      if (prod.nombre_producto && prod.nombre_producto.toLowerCase() !== "null") {
        const partes = prod.nombre_producto.split(",");
        const filtradas = partes.map(p => p.trim()).filter(p => p && p.toLowerCase() !== "null");

        if (filtradas.length > 0) {
          nombreBase = filtradas[0];
          caracteristicas = filtradas.slice(1).join(", ");
        }
      } else {
        nombreBase = "Producto desconocido";
      }

      return {
        ...prod,
        NombreProducto: nombreBase,
        Caracteristicas: caracteristicas
      };
    });

    console.log("🛠️ Productos procesados:");
    console.log(productos);

    // Obtener datos de los almacenes
    const userResult = await pool
      .request()
      .input("Origen", sql.VarChar, Origen)
      .input("Destino", sql.VarChar, Destino)
      .query(`
        SELECT DISTINCT u.Correo, 
                        a_origen.CNOMBREALMACEN AS NombreAlmacenOrigen, 
                        a_destino.CNOMBREALMACEN AS NombreAlmacenDestino 
        FROM UsuariosLocal AS u
        JOIN admAlmacenes AS a_origen ON a_origen.CCODIGOALMACEN = @Origen
        JOIN admAlmacenes AS a_destino ON a_destino.CCODIGOALMACEN = @Destino
        WHERE u.Clave = a_origen.CNOMBREALMACEN 
          AND u.Correo IS NOT NULL;
      `);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ message: "No se encontró usuario con correo para el almacén." });
    }

    const { Correo, NombreAlmacenOrigen, NombreAlmacenDestino } = userResult.recordset[0];

    console.log("🛠️ Datos del usuario y almacén:");
    console.log(`Correo: ${Correo}, Origen: ${NombreAlmacenOrigen}, Destino: ${NombreAlmacenDestino}`);

    let barcodeImage = "";
    try {
      const canvas = createCanvas(200, 50);
      JsBarcode(canvas, NumeroPedido, {
        format: "CODE128",
        displayValue: true,
        fontSize: 14,
        textMargin: 4
      });
      barcodeImage = canvas.toDataURL();
    } catch (err) {
      console.error("⚠️ Error generando código de barras:", err);
    }

    console.log("🛠️ Imagen del código de barras generada.");

    // Crear la lista de productos en formato HTML
    const productosHTML = productos.map(prod => {
      const texto = `${prod.NombreProducto}${prod.Caracteristicas ? `, ${prod.Caracteristicas}` : ""}`;
      return `<li><strong>${prod.ProductoID}</strong> - ${texto} (${prod.Unidades} unidades)</li>`;
    }).join("");

    const mailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <h1 style="color: #2c3e50;">Orden de Surtir Traspaso</h1>
        <p><strong>Origen:</strong> ${NombreAlmacenOrigen}</p>
        <p><strong>Destino:</strong> ${NombreAlmacenDestino}</p>
        <p><strong>N° Traspaso:</strong> ${NumeroPedido}</p>
        <h2>Productos a surtir:</h2>
        <ul>${productosHTML}</ul>
        ${barcodeImage ? `
          <h2 style="margin-top: 30px;">Código de barras:</h2>
          <div style="margin-top: 10px;">
            <img src="${barcodeImage}" alt="Código de Barras">
          </div>
        ` : ""}
      </div>
    `;

    console.log("📧 Contenido del correo que se enviará:");
    console.log(mailContent);

    const mailOptions = {
      from: `"Sistema de Traspasos" <${process.env.EMAIL_USER}>`,
      to: Correo,
      subject: `Orden de Surtir Traspaso - ${NumeroPedido}`,
      html: mailContent
    };

    // Crear el transportador de correo
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 465,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: { rejectUnauthorized: false },
    });

    // Enviar correo
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Correo enviado a ${Correo} (${info.messageId})`);

    // Actualizar almacén (si es necesario)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

    const updateResponse = await fetch(`${apiUrl}/api/Actualizar-almacen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ NumeroPedido })
    });

    const updateResult = await updateResponse.json();

    console.log("📊 Respuesta de actualización de almacén:");
    console.log(updateResult);

    return res.status(200).json({ message: "Correo enviado y almacén actualizado", update: updateResult });
  } catch (error) {
    console.error("❌ Error en el envío de correo:", error);
    return res.status(500).json({ message: "Error interno", error: error.message });
  }
}
