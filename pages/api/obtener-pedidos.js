import { getPool } from "../../dbconfig";
import sql from "mssql";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      WITH Movimientos AS (
        SELECT 
            d.CFOLIO AS NumeroPedido, 
            p.CIDPRODUCTO AS ProductoID, 
            p.CNOMBREPRODUCTO,  
            d.CFECHA, 
            d.CSERIEDOCUMENTO, 
            m.CUNIDADES AS Unidades,
            m.CIDDOCUMENTODE AS TipoMovimiento,
            CASE 
                WHEN m.CIDDOCUMENTO <> 0 THEN al_origen.CCODIGOALMACEN 
                ELSE NULL 
            END AS OrigenID, 
            CASE 
                WHEN m.CIDDOCUMENTO = 0 THEN al_origen.CCODIGOALMACEN 
                ELSE (
                    SELECT TOP 1 al_destino.CCODIGOALMACEN 
                    FROM admMovimientos m_destino
                    JOIN admAlmacenes al_destino ON m_destino.CIDALMACEN = al_destino.CIDALMACEN
                    WHERE m_destino.CIDPRODUCTO = m.CIDPRODUCTO 
                      AND m_destino.CIDDOCUMENTO <> m.CIDDOCUMENTO
                      AND al_destino.CIDALMACEN <> al_origen.CIDALMACEN  
                      AND al_destino.CIDALMACEN <> 99 
                    ORDER BY m_destino.CIDDOCUMENTODE DESC
                ) 
            END AS DestinoID
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
            and m.CIDDOCUMENTODE = 34
      )
      SELECT * FROM Movimientos WHERE DestinoID <> 99
      ORDER BY NumeroPedido DESC;
    `);

    if (result.recordset.length === 0) {
      console.log("🚫 No hay nuevos pedidos o todos tienen DestinoID 99.");
      return res.status(200).json([]);
    }

    // Agrupar productos por NumeroPedido
    const pedidosMap = new Map();

    result.recordset.forEach(({ NumeroPedido, ProductoID, Unidades, OrigenID, DestinoID, TipoMovimiento }) => {
      if (!pedidosMap.has(NumeroPedido)) {
        pedidosMap.set(NumeroPedido, {
          NumeroPedido,
          Origen: OrigenID,
          Destino: DestinoID,
          TipoMovimiento,
          Producto: []
        });
      }
      pedidosMap.get(NumeroPedido).Producto.push({ ProductoID, Unidades });
    });

    const pedidos = Array.from(pedidosMap.values());

    return res.status(200).json(pedidos);
  } catch (error) {
    console.error("❌ Error obteniendo pedidos:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}
