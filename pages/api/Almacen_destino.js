import { connectToDatabase, sql } from "../../dbconfig";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  const { numeroPedido, destino } = req.body; // Recibe el número de pedido y destino (nombre del almacén)

  if (!numeroPedido || !destino) {
    return res.status(400).json({ message: "Número de pedido y destino son requeridos." });
  }

  try {
    console.log("🔄 Conectando a la base de datos...");
    const pool = await connectToDatabase();

    console.log(`📌 Buscando CIDALMACEN para el almacén: ${destino}...`);
    const almacenConsulta = await pool.request()
      .input("CNOMBREALMACEN", sql.VarChar, destino)
      .query(`SELECT CIDALMACEN FROM admAlmacenes WHERE CNOMBREALMACEN = @CNOMBREALMACEN`);

    if (almacenConsulta.recordset.length === 0) {
      console.warn("⚠️ No se encontró el almacén.");
      return res.status(404).json({ success: false, message: "No se encontró el almacén especificado." });
    }

    const CIDALMACEN = almacenConsulta.recordset[0].CIDALMACEN;
    console.log(`✅ Almacén encontrado: CIDALMACEN = ${CIDALMACEN}`);

    console.log(`📌 Buscando movimientos para el pedido ${numeroPedido}...`);
    const movimientosConsulta = await pool.request()
      .input("numeroPedido", sql.VarChar, numeroPedido)
      .query(`
        SELECT TOP 1 D.CFOLIO, M.CIDMOVIMIENTO, M.CIDDOCUMENTO, M.CIDDOCUMENTODE, M.CIDPRODUCTO, M.CIDALMACEN, M.CFECHA
        FROM admMovimientos AS M
        JOIN admDocumentos AS D ON M.CIDDOCUMENTODE = D.CIDDOCUMENTODE
        WHERE M.CIDDOCUMENTODE = 34 AND M.CIDALMACEN = 21 AND M.CIDDOCUMENTO = 0 AND D.CFOLIO = @numeroPedido
        ORDER BY M.CFECHA DESC
      `);

    if (movimientosConsulta.recordset.length === 0) {
      console.warn("⚠️ No se encontraron movimientos para este pedido.");
      return res.status(404).json({ success: false, message: "No se encontraron movimientos para este pedido." });
    }

    console.log("✅ Movimientos encontrados:", movimientosConsulta.recordset);

    console.log("🔄 Actualizando almacén...");
    await pool.request()
      .input("numeroPedido", sql.VarChar, numeroPedido)
      .input("Destino", sql.Int, CIDALMACEN)
      .query(`
        UPDATE admMovimientos
        SET CIDALMACEN = @Destino
        WHERE CIDMOVIMIENTO IN (
          SELECT M.CIDMOVIMIENTO
          FROM admMovimientos AS M
          JOIN admDocumentos AS D ON M.CIDDOCUMENTODE = D.CIDDOCUMENTODE
          WHERE M.CIDDOCUMENTODE = 34 
            AND M.CIDALMACEN = 21 
            AND M.CIDDOCUMENTO = 0 
            AND D.CFOLIO = @numeroPedido
        );
      `);

    console.log("✅ Almacén actualizado correctamente.");
    return res.status(200).json({ success: true, message: "Almacén actualizado correctamente." });
  } catch (error) {
    console.error("❌ Error al actualizar el almacén:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno al actualizar el almacén.",
      error: error.message,
    });
  }
}
