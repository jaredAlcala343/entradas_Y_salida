import { connectToDatabase, sql } from "../../dbconfig";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  try {
    console.log("🔄 Conectando a la base de datos...");
    const pool = await connectToDatabase();

    console.log("📌 Buscando el movimiento más reciente...");
    const movimiento = await pool.request().query(`
     SELECT top 5 CIDMOVIMIENTO, CIDALMACEN
      FROM admMovimientos
      WHERE CIDDOCUMENTODE = 34
	    and CIDDOCUMENTO = 0
      ORDER BY CIDMOVIMIENTO desc;
    `);

    if (movimiento.recordset.length === 0) {
      console.warn("⚠️ No se encontraron movimientos para actualizar.");
      return res.status(404).json({ success: false, message: "No se encontraron movimientos para actualizar." });
    }

    const { CIDMOVIMIENTO, CIDALMACEN } = movimiento.recordset[0];
    console.log(`📋 Movimiento encontrado: CIDMOVIMIENTO=${CIDMOVIMIENTO}, CIDALMACEN=${CIDALMACEN}`);

    if (CIDALMACEN === 21) {
      console.log("✅ El movimiento ya está en el almacén 21, no se requiere actualización.");
      return res.status(200).json({ success: false, message: "El movimiento ya está en el almacén 21, no se requiere actualización." });
    }

    console.log("🔄 Actualizando almacén...");
    await pool.request()
      .input("CIDMOVIMIENTO", sql.Int, CIDMOVIMIENTO)
      .query(`
        UPDATE admMovimientos
        SET CIDALMACEN = 21
        WHERE CIDMOVIMIENTO = @CIDMOVIMIENTO;
      `);

    console.log("🔍 Verificando actualización...");
    const verificacion = await pool.request()
      .input("CIDMOVIMIENTO", sql.Int, CIDMOVIMIENTO)
      .query(`
        SELECT *
        FROM admMovimientos
        WHERE CIDMOVIMIENTO = @CIDMOVIMIENTO;
      `);
      console.log(verificacion.recordset);
    if (verificacion.recordset.length > 0 && verificacion.recordset[0].CIDALMACEN === 21) {
      console.log("✅ Almacén actualizado correctamente.");
      return res.status(200).json({ success: true, message: "Almacén actualizado correctamente." });
    } else {
      console.error("❌ Error: La actualización no se reflejó en la base de datos.");
      return res.status(500).json({ success: false, message: "Error: La actualización no se reflejó en la base de datos." });
    }
  } catch (error) {
    console.error("❌ Error al actualizar el almacén:", error);
    return res.status(500).json({
      message: "Error interno al actualizar el almacén",
      error: error.message,
    });
  }
}
