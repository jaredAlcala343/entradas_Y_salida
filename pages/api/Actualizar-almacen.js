import { connectToDatabase, sql } from "../../dbconfig";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  try {
    console.log("🔄 Conectando a la base de datos...");
    const pool = await connectToDatabase();

    // 1. Buscar el movimiento más reciente
    console.log("📌 Buscando el movimiento más reciente...");
    const movimiento = await pool.request().query(`
      SELECT top 1 CIDMOVIMIENTO, CIDALMACEN
      FROM admMovimientos
      WHERE CIDDOCUMENTODE = 34
      ORDER BY CIDDOCUMENTO desc;
    `);

    if (movimiento.recordset.length === 0) {
      console.warn("⚠️ No se encontraron movimientos para actualizar.");
      return res.status(404).json({ success: false, message: "No se encontraron movimientos para actualizar." });
    }

    const { CIDMOVIMIENTO, CIDALMACEN } = movimiento.recordset[0];
    console.log(`📋 Movimiento encontrado: CIDMOVIMIENTO=${CIDMOVIMIENTO}, CIDALMACEN=${CIDALMACEN}`);

    // 2. Verificar y actualizar las siguientes líneas
    let siguienteMovimiento = await pool.request().query(`
      SELECT CIDMOVIMIENTO, CIDDOCUMENTO, CIDALMACEN
      FROM admMovimientos
      WHERE CIDMOVIMIENTO > ${CIDMOVIMIENTO}
      ORDER BY CIDMOVIMIENTO asc;
    `);

    for (let movimientoSiguiente of siguienteMovimiento.recordset) {
      const { CIDMOVIMIENTO: CIDSiguiente, CIDDOCUMENTO, CIDALMACEN: CIDAlmacenSiguiente } = movimientoSiguiente;

      // Si CIDDOCUMENTO es 0, verificar si el CIDALMACEN es diferente al de la respuesta del primer query
      if (CIDDOCUMENTO === 0) {
        if (CIDAlmacenSiguiente !== CIDALMACEN) {
          console.log(`🔄 Actualizando almacén del movimiento ${CIDSiguiente} a 21...`);
          await pool.request()
            .input("CIDMOVIMIENTO", sql.Int, CIDSiguiente)
            .query(`
              UPDATE admMovimientos
              SET CIDALMACEN = 21
              WHERE CIDMOVIMIENTO = @CIDMOVIMIENTO;
            `);
          console.log(`✅ Almacén actualizado para el movimiento ${CIDSiguiente}`);
        }
      } else {
        // Verificar si el CIDALMACEN del siguiente movimiento es diferente al del primer query (CIDALMACEN)
        if (CIDAlmacenSiguiente !== CIDALMACEN) {
          console.log(`🔄 Actualizando almacén del movimiento ${CIDSiguiente} a 21...`);
          await pool.request()
            .input("CIDMOVIMIENTO", sql.Int, CIDSiguiente)
            .query(`
              UPDATE admMovimientos
              SET CIDALMACEN = 21
              WHERE CIDMOVIMIENTO = @CIDMOVIMIENTO;
            `);
          console.log(`✅ Almacén actualizado para el movimiento ${CIDSiguiente}`);
        }
      }
    }

    // 3. Verificar la actualización de los almacenes
    console.log("🔍 Verificando actualizaciones...");
    const verificacion = await pool.request().query(`
      SELECT CIDMOVIMIENTO, CIDALMACEN
      FROM admMovimientos
      WHERE CIDMOVIMIENTO IN (${siguienteMovimiento.recordset.map(mov => mov.CIDMOVIMIENTO).join(',')});
    `);

    // Verificar si todos los almacenes han sido actualizados correctamente a 21
    if (verificacion.recordset.every(mov => mov.CIDALMACEN === 21)) {
      console.log("✅ Todos los movimientos fueron actualizados correctamente.");
      return res.status(200).json({ success: true, message: "Almacenes actualizados correctamente." });
    } else {
      console.error("❌ Error: No todos los movimientos fueron actualizados correctamente.");
      return res.status(500).json({ success: false, message: "Error: No todos los movimientos fueron actualizados correctamente." });
    }
  } catch (error) {
    console.error("❌ Error al actualizar los movimientos:", error);
    return res.status(500).json({
      message: "Error interno al actualizar los movimientos",
      error: error.message,
    });
  }
}
