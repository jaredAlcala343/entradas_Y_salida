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

    // ✅ Convertimos Origen y Destino a STRING antes de pasarlos a SQL
    Origen = Origen.toString();
    Destino = Destino.toString();

    if (!Origen || !Destino || !NumeroPedido || !Array.isArray(Producto) || Producto.length === 0) {
      console.error("❌ Datos inválidos:", { Origen, Destino, NumeroPedido, Producto });
      return res.status(400).json({ message: "Datos inválidos en la petición" });
    }

    const pool = await connectToDatabase();

    console.log("🔍 Obteniendo datos del almacén y correo del usuario asignado al origen...");

    const query = `
      SELECT DISTINCT u.Correo, 
                      a_origen.CNOMBREALMACEN AS NombreAlmacenOrigen, 
                      a_destino.CNOMBREALMACEN AS NombreAlmacenDestino 
      FROM UsuariosLocal AS u
      JOIN admAlmacenes AS a_origen ON a_origen.CCODIGOALMACEN = @Origen
      JOIN admAlmacenes AS a_destino ON a_destino.CCODIGOALMACEN = @Destino
      WHERE u.Clave = a_origen.CNOMBREALMACEN 
        AND u.Correo IS NOT NULL;
    `;

    console.log("🔍 Query:", query);

    const result = await pool
      .request()
      .input("Origen", sql.VarChar, Origen) // ✅ Cambiado a sql.VarChar
      .input("Destino", sql.VarChar, Destino) // ✅ Cambiado a sql.VarChar
      .query(query);

    console.log("📜 Resultado de la consulta:", result.recordset);

    if (result.recordset.length === 0) {
      console.error("❌ No se encontró un usuario con correo asignado al almacén de origen.");
      return res.status(404).json({ message: "No hay usuario válido para enviar el correo" });
    }

    const { Correo, NombreAlmacenOrigen, NombreAlmacenDestino } = result.recordset[0];

    console.log(`✅ Correo encontrado: ${Correo}`);

    console.log("🖨 Generando código de barras...");
    let barcodeImage = "";
    try {
      const canvas = createCanvas(200, 50);
      JsBarcode(canvas, NumeroPedido, { format: "CODE128", displayValue: true, fontSize: 14, textMargin: 4 });
      barcodeImage = canvas.toDataURL();
    } catch (barcodeError) {
      console.error("⚠️ Error generando código de barras, pero se continuará con el correo:", barcodeError);
    }

    const productosHTML = Producto.map(
      (prod) => `<li><strong>${prod.NombreProducto}</strong> - ${prod.Unidades} unidades</li>`
    ).join("");

    const mailOptions = {
      from: `"Sistema de Traspasos" <${process.env.EMAIL_USER}>`,
      to: Correo,
      subject: `Orden de Surtir Traspaso - ${NumeroPedido}`,
      html: `
        <h1>Orden de Surtir Traspaso</h1>
        <p><strong>Origen:</strong> ${NombreAlmacenOrigen}</p>
        <p><strong>Destino:</strong> ${NombreAlmacenDestino}</p>
        <p><strong>Número de Traspaso:</strong> ${NumeroPedido}</p>
        <h2>Productos</h2>
        <ul>${productosHTML}</ul>
        ${barcodeImage ? `<p><strong>Código de Barras del Traspaso:</strong></p><img src="${barcodeImage}" alt="Código de Barras">` : ""}
      `,
    };

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

    console.log("📨 Intentando enviar correo...");
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Correo enviado con éxito a ${Correo} (${info.messageId})`);
      return res.status(200).json({ message: "Correo enviado con éxito" });
    } catch (emailError) {
      console.error("❌ Error enviando correo:", emailError);
      return res.status(500).json({ message: "Error enviando el correo", error: emailError.message });
    }
  } catch (error) {
    console.error("❌ Error en enviar-correo.js:", error);
    return res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
}
