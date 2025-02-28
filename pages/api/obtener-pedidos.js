import { getPool } from "../../dbconfig";
import sql from "mssql";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  try {
    const pool = await getPool(); // Obtener la conexión activa
    const result = await pool.request().query(`
      WITH Movimientos AS (
          SELECT 
              d.CFOLIO, 
              p.CIDPRODUCTO, 
              p.CNOMBREPRODUCTO,  
              d.CFECHA, 
              d.CSERIEDOCUMENTO, 
              m.CUNIDADES, 
              al_origen.CCODIGOALMACEN AS OrigenCodigo, 
              al_origen.CNOMBREALMACEN AS OrigenNombre,
              -- Obtener el destino más reciente para el mismo producto
              (
                  SELECT TOP 1 al_destino.CCODIGOALMACEN 
                  FROM admMovimientos m_destino
                  JOIN admAlmacenes al_destino ON m_destino.CIDALMACEN = al_destino.CIDALMACEN
                  WHERE m_destino.CIDPRODUCTO = m.CIDPRODUCTO 
                    AND m_destino.CIDDOCUMENTO <> m.CIDDOCUMENTO -- Evitar que sea el mismo documento
                    AND al_destino.CCODIGOALMACEN <> al_origen.CCODIGOALMACEN -- Asegurar que el destino es diferente
                  ORDER BY m_destino.CIDDOCUMENTO DESC
              ) AS DestinoCodigo,
              (
                  SELECT TOP 1 al_destino.CNOMBREALMACEN 
                  FROM admMovimientos m_destino
                  JOIN admAlmacenes al_destino ON m_destino.CIDALMACEN = al_destino.CIDALMACEN
                  WHERE m_destino.CIDPRODUCTO = m.CIDPRODUCTO 
                    AND m_destino.CIDDOCUMENTO <> m.CIDDOCUMENTO
                    AND al_destino.CCODIGOALMACEN <> al_origen.CCODIGOALMACEN
                  ORDER BY m_destino.CIDDOCUMENTO DESC
              ) AS DestinoNombre
          FROM 
              admDocumentos AS d
          JOIN 
              admMovimientos AS m ON m.CIDDOCUMENTO = d.CIDDOCUMENTO
          JOIN 
              admProductos AS p ON p.CIDPRODUCTO = m.CIDPRODUCTO
          JOIN 
              admAlmacenes AS al_origen ON m.CIDALMACEN = al_origen.CIDALMACEN
          WHERE 
              d.CFECHA BETWEEN DATEADD(HOUR, -24, SYSDATETIME()) AND SYSDATETIME()
      )
      SELECT 
          CFOLIO, 
          CIDPRODUCTO, 
          CNOMBREPRODUCTO,  
          CFECHA, 
          CSERIEDOCUMENTO, 
          CUNIDADES, 
          OrigenCodigo, 
          OrigenNombre,
          DestinoCodigo, 
          DestinoNombre
      FROM Movimientos
      ORDER BY CFOLIO DESC;

    `);

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error("❌ Error obteniendo pedidos:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}
