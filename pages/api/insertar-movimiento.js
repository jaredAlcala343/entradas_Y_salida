import { connectToDatabase, sql } from "../../dbconfig";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  try {
    console.log("📩 Datos recibidos:", req.body);

    const { TipoMovimiento, Producto, NumeroPedido, Origen, Destino } = req.body;

    if (!TipoMovimiento || !NumeroPedido || Origen === undefined || Destino === undefined) {
      console.error("❌ Datos incompletos o incorrectos.", { TipoMovimiento, Producto, NumeroPedido, Origen, Destino });
      return res.status(400).json({ message: "Faltan datos necesarios o el formato es incorrecto." });
    }

    if (!Array.isArray(Producto)) {
      console.error("❌ Producto no es un array válido.", Producto);
      return res.status(400).json({ message: "Producto debe ser un array." });
    }

    const origenInt = parseInt(Origen, 10);
    const destinoInt = parseInt(Destino, 10);

    if (isNaN(origenInt) || isNaN(destinoInt)) {
      console.error("❌ Error: Origen o Destino no son números válidos.", { Origen, Destino });
      return res.status(400).json({ message: "Origen y Destino deben ser números válidos." });
    }

    const fechaHoy = new Date().toISOString().split("T")[0];
    const fechaCompromiso = new Date(new Date().setDate(new Date().getDate() + 15))
      .toISOString()
      .split("T")[0];

    const pool = await connectToDatabase();
    const numeroPedidoStr = String(NumeroPedido);

    // Función para limpiar "(Ninguno)"
    const limpiarNinguno = (texto) => {
      if (!texto) return texto;
      return texto.replace(/\(ninguno\)/gi, '') // Elimina (ninguno) en cualquier caso
                 .replace(/, ,/g, ',')        // Elimina comas dobles
                 .replace(/, $/g, '')         // Elimina coma al final
                 .trim();                     // Elimina espacios al inicio/final
    };

    for (const prod of Producto) {
      const { ProductoID, Unidades, NombreProducto } = prod || {};

      if (!ProductoID || !Unidades) {
        console.error("❌ Producto inválido en la solicitud.", prod);
        return res.status(400).json({ message: "Los datos del producto son incorrectos." });
      }

      // Verificar si ya existe el producto para ese pedido
      const checkDuplicate = await pool.request()
        .input("NumeroPedido", sql.NVarChar, numeroPedidoStr)
        .input("Producto", sql.Int, ProductoID)
        .query(`
          SELECT 1 FROM Pedidos
          WHERE NumeroPedido = @NumeroPedido AND Producto = @Producto
        `);

      if (checkDuplicate.recordset.length > 0) {
        console.warn(`⚠️ Producto ${ProductoID} ya está registrado en el pedido ${numeroPedidoStr}. Se omite.`);
        continue;
      }

      // Limpiar el nombre del producto
      const nombreProductoLimpio = limpiarNinguno(NombreProducto || `Producto ${ProductoID}`);

      console.log("📌 Insertando pedido con:", { 
        origenInt, 
        destinoInt, 
        ProductoID, 
        Unidades, 
        nombreProductoLimpio
      });

      await pool
        .request()
        .input("NumeroPedido", sql.NVarChar, numeroPedidoStr)
        .input("Origen", sql.Int, origenInt)
        .input("Destino", sql.Int, destinoInt)
        .input("Producto", sql.Int, ProductoID)
        .input("Unidades", sql.Int, Unidades)
        .input("nombre_producto", sql.NVarChar, nombreProductoLimpio)
        .input("Fecha_Creacion", sql.Date, fechaHoy)
        .input("Fecha_Compromiso", sql.Date, fechaCompromiso)
        .input("Estatus", sql.NVarChar, "Pendiente")
        .query(`
          INSERT INTO Pedidos 
          (NumeroPedido, Origen, Destino, Producto, Unidades, nombre_producto, Fecha_Creacion, Fecha_Compromiso, Estatus)
          VALUES 
          (@NumeroPedido, @Origen, @Destino, @Producto, @Unidades, @nombre_producto, @Fecha_Creacion, @Fecha_Compromiso, @Estatus);
        `);
    }

    console.log(`✅ Pedido ${numeroPedidoStr} registrado con éxito.`);

    // 🚀 Llamada a la API para enviar el correo
    const correoResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/enviar-correo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        NumeroPedido: numeroPedidoStr, 
        Origen, 
        Destino, 
        Producto: Producto.map(p => ({
          ProductoID: p.ProductoID,
          Unidades: p.Unidades,
          nombre_producto: limpiarNinguno(p.NombreProducto || `Producto ${p.ProductoID}`)
        })) 
      }),
    });

    if (!correoResponse.ok) {
      console.error("❌ Error al enviar el correo de notificación.", await correoResponse.text());
    } else {
      console.log("📧 Correo enviado correctamente.");
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