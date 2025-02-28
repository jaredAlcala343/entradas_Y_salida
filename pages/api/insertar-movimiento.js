import { connectToDatabase, sql } from "../../dbconfig";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  try {
    const { TipoMovimiento, Producto, NumeroPedido, Origen, Destino } = req.body;
    // console.log("📥 Pedido recibido:", JSON.stringify(req.body, null, 2));

    // 🔍 Validación de datos
    if (!TipoMovimiento || !Producto || !NumeroPedido || !Array.isArray(Producto) || Origen === undefined || Destino === undefined) {
      console.error("❌ Datos incompletos o incorrectos.");
      return res.status(400).json({ message: "Faltan datos necesarios o el formato es incorrecto." });
    }

    // 🔄 Convertir `Origen` y `Destino` a enteros
    const origenInt = parseInt(Origen, 10);
    const destinoInt = parseInt(Destino, 10);

    if (isNaN(origenInt) || isNaN(destinoInt)) {
      console.error("❌ Error: Origen o Destino no son números válidos.");
      return res.status(400).json({ message: "Origen y Destino deben ser números válidos." });
    }

    // Obtener la fecha de hoy en formato YYYY-MM-DD
    const fechaHoy = new Date().toISOString().split("T")[0];

    const pool = await connectToDatabase();
    const numeroPedidoStr = String(NumeroPedido);

    // ❓ Verificar si el pedido ya está registrado en el día actual
    const pedidoExistente = await pool
      .request()
      .input("NumeroPedido", sql.NVarChar, numeroPedidoStr)
      .input("Fecha_Creacion", sql.Date, fechaHoy)
      .query(`
        SELECT COUNT(*) AS count 
        FROM Pedidos 
        WHERE NumeroPedido = @NumeroPedido AND Fecha_Creacion = @Fecha_Creacion
      `);

    if (pedidoExistente.recordset[0].count > 0) {
      console.log(`⏩ Pedido ${numeroPedidoStr} ya se registró hoy. No se insertará nuevamente.`);
      return res.status(200).json({ success: true, message: "El pedido ya está registrado hoy." });
    }

    // Si no está registrado, proceder con la inserción
    const fechaCompromiso = new Date(new Date().setDate(new Date().getDate() + 15))
      .toISOString()
      .split("T")[0];

    // 📝 Insertar cada producto en la base de datos
    for (const prod of Producto) {
      const { ProductoID, Unidades } = prod;

      console.log("📌 Insertando pedido con:", { origenInt, destinoInt, ProductoID, Unidades });

      await pool
        .request()
        .input("NumeroPedido", sql.NVarChar, numeroPedidoStr)
        .input("Origen", sql.Int, origenInt)
        .input("Destino", sql.Int, destinoInt)
        .input("Producto", sql.Int, ProductoID)
        .input("Unidades", sql.Int, Unidades)
        .input("Fecha_Creacion", sql.Date, fechaHoy)
        .input("Fecha_Compromiso", sql.Date, fechaCompromiso)
        .input("Estatus", sql.NVarChar, "Pendiente")
        .query(`
          INSERT INTO Pedidos 
          (NumeroPedido, Origen, Destino, Producto, Unidades, Fecha_Creacion, Fecha_Compromiso, Estatus)
          VALUES 
          (@NumeroPedido, @Origen, @Destino, @Producto, @Unidades, @Fecha_Creacion, @Fecha_Compromiso, @Estatus);
        `);
    }

    console.log(`✅ Pedido ${numeroPedidoStr} registrado con éxito.`);

    // 📧 Enviar correo con la información del pedido (solo si es nuevo)
    const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
    try {
      const emailResponse = await fetch(`${baseURL}/api/enviar-correo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Origen: origenInt, Destino: destinoInt, NumeroPedido, Producto }),
      });

      const emailData = await emailResponse.json();
      if (!emailResponse.ok) {
        console.error("❌ Error al enviar correo:", emailData.message);
      } else {
        console.log("📩 Correo enviado con éxito.");
      }
    } catch (error) {
      console.error("❌ Error al intentar enviar correo:", error);
    }

    return res.status(200).json({
      success: true,
      NumeroPedido: numeroPedidoStr,
      message: "Pedido registrado con éxito y correo enviado.",
    });

  } catch (error) {
    console.error("❌ Error al registrar el pedido:", error);
    return res.status(500).json({
      message: "Error interno al registrar el pedido",
      error: error.message,
    });
  }
}
