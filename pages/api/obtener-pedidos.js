import { getPool } from "../../dbconfig";
import sql from "mssql";

export default async function handler(req, res) {
  console.log('🔹 Inicio de handler - Método:', req.method);
  
  if (req.method !== "GET") {
    console.log('⛔ Método no permitido:', req.method);
    return res.status(405).json({ message: "Método no permitido" });
  }

  try {
    console.log('🔸 Obteniendo pool de conexiones...');
    const pool = await getPool();
    console.log('✅ Pool de conexiones obtenido');
    
    console.log('🔸 Ejecutando consulta principal...');
    const result = await pool.request().query(`
      WITH MovimientosFiltrados AS (
        SELECT 
            d.CFOLIO AS NumeroPedido,
            d.CFECHA AS FechaDocumento,
            m.CIDPRODUCTO,
            p.CNOMBREPRODUCTO,
            m.CUNIDADES,
            a_origen.CCODIGOALMACEN AS CodigoOrigen,
            NULLIF((
                SELECT TOP 1 a_destino.CCODIGOALMACEN 
                FROM admMovimientos m_destino
                JOIN admAlmacenes a_destino ON m_destino.CIDALMACEN = a_destino.CIDALMACEN
                WHERE m_destino.CIDMOVTOOWNER = m.CIDMOVIMIENTO
                AND a_destino.CCODIGOALMACEN <> '99'
            ), '') AS CodigoDestino
        FROM 
            admDocumentos d
        JOIN 
            admMovimientos m ON d.CIDDOCUMENTO = m.CIDDOCUMENTO
        JOIN 
            admProductos p ON m.CIDPRODUCTO = p.CIDPRODUCTO
        JOIN 
            admAlmacenes a_origen ON m.CIDALMACEN = a_origen.CIDALMACEN
        WHERE 
            d.CFECHA BETWEEN DATEADD(HOUR, -24, SYSDATETIME()) AND SYSDATETIME()
            AND d.CIDDOCUMENTODE = 34
            AND NOT EXISTS (SELECT 1 FROM Pedidos WHERE NumeroPedido = d.CFOLIO)
            AND a_origen.CCODIGOALMACEN <> '99'
      )
      
      SELECT 
          NumeroPedido,
          FechaDocumento,
          CIDPRODUCTO AS ProductoID,
          CNOMBREPRODUCTO AS NombreProducto,
          CUNIDADES AS Unidades,
          CodigoOrigen AS OrigenID,
          CodigoDestino AS DestinoID
      FROM MovimientosFiltrados
      WHERE CodigoOrigen IS NOT NULL
      ORDER BY NumeroPedido DESC;
    `);

    console.log('🔹 Resultados de consulta principal:', result.recordset.length, 'registros');
    
    if (result.recordset.length === 0) {
      console.log("🚫 No hay nuevos pedidos o todos ya están registrados en la tabla Pedidos.");
      return res.status(200).json([]);
    }

    console.log('🔸 Creando sets para folios con/sin características...');
    const foliosConCaracteristicas = new Set();
    const foliosSinCaracteristicas = new Set();
    
    console.log('🔸 Agrupando productos por folio...');
    const productosPorFolio = result.recordset.reduce((acc, row) => {
      if (!acc[row.NumeroPedido]) {
        acc[row.NumeroPedido] = [];
      }
      acc[row.NumeroPedido].push(row);
      return acc;
    }, {});

    console.log('🔹 Folios encontrados:', Object.keys(productosPorFolio).join(', '));
    
    console.log('🔸 Verificando características por folio...');
    for (const [folio, productos] of Object.entries(productosPorFolio)) {
      console.log('🔹 Procesando folio:', folio, 'con', productos.length, 'productos');
      const tieneCaracteristicas = await verificarCaracteristicas(pool, folio, productos);
      
      if (tieneCaracteristicas) {
        console.log('✅ Folio', folio, 'TIENE características');
        foliosConCaracteristicas.add(folio);
      } else {
        console.log('❌ Folio', folio, 'NO tiene características');
        foliosSinCaracteristicas.add(folio);
      }
    }

    console.log('🔸 Procesando folios con características...');
    const pedidosConCaracteristicas = [];
    for (const folio of foliosConCaracteristicas) {
      console.log('🔹 Obteniendo detalle para folio con características:', folio);
      const detalle = await obtenerDetalleConCaracteristicas(pool, folio);
      pedidosConCaracteristicas.push(detalle);
    }

    console.log('🔸 Procesando folios sin características...');
    const pedidosSinCaracteristicas = result.recordset
      .filter(row => foliosSinCaracteristicas.has(row.NumeroPedido))
      .reduce((acc, row) => {
        const { NumeroPedido, ProductoID, NombreProducto, Unidades, OrigenID, DestinoID, FechaDocumento } = row;
        
        if (!acc[NumeroPedido]) {
          acc[NumeroPedido] = {
            NumeroPedido,
            Origen: OrigenID,
            Destino: DestinoID,
            TipoMovimiento: 'PRINCIPAL',
            Fecha_Creacion: FechaDocumento.toISOString().split('T')[0],
            Producto: []
          };
        }

        if (!acc[NumeroPedido].Producto.some(p => p.ProductoID === ProductoID)) {
          acc[NumeroPedido].Producto.push({
            ProductoID,
            NombreProducto,
            Unidades
          });
        }

        return acc;
      }, {});

    console.log('🔸 Combinando resultados...');
    const pedidos = [
      ...pedidosConCaracteristicas,
      ...Object.values(pedidosSinCaracteristicas)
    ];

    console.log('🔹 Total de pedidos a devolver:', pedidos.length);
    console.log('✅ Proceso completado con éxito');
    return res.status(200).json(pedidos);
  } catch (error) {
    console.error("❌ Error obteniendo pedidos:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

async function verificarCaracteristicas(pool, folio, productos) {
  console.log(`🔸 [${folio}] Verificando características...`);
  try {
    const idsProductos = productos.map(p => p.ProductoID).join(",");
    console.log(`🔹 [${folio}] IDs de productos:`, idsProductos);
    
    const query = `
      SELECT TOP 1 1 
      FROM admProductosDetalles pd
      JOIN admCaracteristicasValores cv ON pd.CIDVALORCARACTERISTICA1 = cv.CIDVALORCARACTERISTICA
      WHERE pd.CIDPRODUCTO IN (${idsProductos})
    `;
    console.log(`🔹 [${folio}] Query ejecutada:`, query);
    
    const checkResult = await pool.request().query(query);
    console.log(`🔹 [${folio}] Resultado verificación:`, checkResult.recordset.length > 0);
    
    return checkResult.recordset.length > 0;
  } catch (error) {
    console.error(`❌ [${folio}] Error verificando características:`, error);
    return false;
  }
}

async function obtenerDetalleConCaracteristicas(pool, folio) {
  console.log(`🔸 [${folio}] Obteniendo detalle con características...`);
  try {
    const query = `
      WITH MovimientoPrincipal AS (
    SELECT 
        mov.CIDDOCUMENTO,
        mov.CIDMOVIMIENTO AS CIDMOVIMIENTO_PRINCIPAL,
        mov.CNUMEROMOVIMIENTO AS NUMEROMOVIMIENTO_PRINCIPAL,
        mov.CIDALMACEN AS CIDALMACEN_PRINCIPAL,
        alm.CCODIGOALMACEN AS CODIGOALMACEN_PRINCIPAL,
        alm.CNOMBREALMACEN AS NOMBREALMACEN_PRINCIPAL,
        ROW_NUMBER() OVER (ORDER BY mov.CNUMEROMOVIMIENTO) AS RowNum
    FROM admDocumentos doc
    JOIN admMovimientos mov ON doc.CIDDOCUMENTO = mov.CIDDOCUMENTO
    JOIN admAlmacenes alm ON mov.CIDALMACEN = alm.CIDALMACEN
    WHERE doc.CFOLIO = ${folio} AND doc.CIDDOCUMENTODE = 34
),

MovimientoBase AS (
    SELECT 
        doc.CIDDOCUMENTO,
        doc.CFOLIO,
        mov.CIDMOVIMIENTO,
        mov.CNUMEROMOVIMIENTO,
        mov.CIDPRODUCTO,
        mov.CIDALMACEN,
        mov.CUNIDADES,
        mov.CUNIDADESCAPTURADAS,
        mov.CUNIDADESPENDIENTES,
        mov.CMOVTOOCULTO,
        mov.CTIPOTRASPASO,
        0 AS Nivel,
        CAST(mov.CIDMOVIMIENTO AS VARCHAR(MAX)) AS CadenaMovimientos,
        NULL AS CIDMOVTOOWNER,
        alm.CCODIGOALMACEN,
        alm.CNOMBREALMACEN,
        mp.CIDMOVIMIENTO_PRINCIPAL,
        mp.CODIGOALMACEN_PRINCIPAL,
        mp.NOMBREALMACEN_PRINCIPAL,
        'ORIGEN' AS TipoMovimiento,
        DENSE_RANK() OVER (ORDER BY mp.RowNum, mov.CNUMEROMOVIMIENTO) AS OrdenSecuencia,
        -- Almacenamos los valores de producto para movimientos principales
        prod.CCODIGOPRODUCTO AS CodigoProductoBase,
        prod.CNOMBREPRODUCTO AS NombreProductoBase
    FROM admDocumentos doc
    JOIN admMovimientos mov ON doc.CIDDOCUMENTO = mov.CIDDOCUMENTO
    JOIN admAlmacenes alm ON mov.CIDALMACEN = alm.CIDALMACEN
    JOIN MovimientoPrincipal mp ON mov.CIDMOVIMIENTO = mp.CIDMOVIMIENTO_PRINCIPAL
    LEFT JOIN admProductos prod ON mov.CIDPRODUCTO = prod.CIDPRODUCTO
    WHERE doc.CFOLIO = ${folio} AND doc.CIDDOCUMENTODE = 34
),

MovimientoOculto AS (
    SELECT 
        doc.CIDDOCUMENTO,
        doc.CFOLIO,
        oculto.CIDMOVIMIENTO,
        oculto.CNUMEROMOVIMIENTO,
        oculto.CIDPRODUCTO,
        oculto.CIDALMACEN,
        oculto.CUNIDADES,
        oculto.CUNIDADESCAPTURADAS,
        oculto.CUNIDADESPENDIENTES,
        oculto.CMOVTOOCULTO,
        oculto.CTIPOTRASPASO,
        1 AS Nivel,
        CAST(mov.CIDMOVIMIENTO AS VARCHAR(MAX)) + '->' + CAST(oculto.CIDMOVIMIENTO AS VARCHAR(MAX)) AS CadenaMovimientos,
        oculto.CIDMOVTOOWNER,
        alm.CCODIGOALMACEN,
        alm.CNOMBREALMACEN,
        mp.CIDMOVIMIENTO_PRINCIPAL,
        mp.CODIGOALMACEN_PRINCIPAL,
        mp.NOMBREALMACEN_PRINCIPAL,
        CASE 
            WHEN alm.CCODIGOALMACEN = mp.CODIGOALMACEN_PRINCIPAL 
                 AND alm.CNOMBREALMACEN = mp.NOMBREALMACEN_PRINCIPAL 
            THEN 'ORIGEN'
            ELSE 'DESTINO'
        END AS TipoMovimiento,
        DENSE_RANK() OVER (ORDER BY mp.RowNum, mov.CNUMEROMOVIMIENTO, oculto.CNUMEROMOVIMIENTO) + 100 AS OrdenSecuencia,
        -- Obtenemos los valores del movimiento padre (principal)
        mb.CodigoProductoBase,
        mb.NombreProductoBase
    FROM admDocumentos doc
    JOIN admMovimientos mov ON doc.CIDDOCUMENTO = mov.CIDDOCUMENTO
    JOIN admMovimientos oculto ON mov.CIDMOVIMIENTO = oculto.CIDMOVTOOWNER
    JOIN admAlmacenes alm ON oculto.CIDALMACEN = alm.CIDALMACEN
    JOIN MovimientoPrincipal mp ON mov.CIDMOVIMIENTO = mp.CIDMOVIMIENTO_PRINCIPAL
    JOIN MovimientoBase mb ON mov.CIDMOVIMIENTO = mb.CIDMOVIMIENTO
    WHERE doc.CFOLIO = ${folio} AND doc.CIDDOCUMENTODE = 34
),

ResultadosCompletos AS (
    SELECT 
        mo.CFOLIO AS Folio,
        mo.CIDMOVIMIENTO,
        mo.CNUMEROMOVIMIENTO,
        mo.Nivel,
        mo.CadenaMovimientos,
        mo.CIDMOVTOOWNER AS MovimientoPadre,
        mo.TipoMovimiento,
        mo.CIDPRODUCTO,
        -- Usamos COALESCE para tomar el valor del producto o del movimiento padre si es NULL
        COALESCE(prod.CCODIGOPRODUCTO, mo.CodigoProductoBase) AS CodigoProducto,
        COALESCE(prod.CNOMBREPRODUCTO, mo.NombreProductoBase) AS NombreProducto,
        carac.CVALORCARACTERISTICA AS Caracteristica,
        mo.CUNIDADES,
        mo.CUNIDADESCAPTURADAS,
        mo.CUNIDADESPENDIENTES,
        mo.CMOVTOOCULTO,
        mo.CTIPOTRASPASO,
        mo.CCODIGOALMACEN AS CodigoAlmacen,
        mo.CNOMBREALMACEN AS NombreAlmacen,
        CASE 
            WHEN mo.CMOVTOOCULTO = 1 THEN 'MOVIMIENTO OCULTO'
            ELSE 'MOVIMIENTO PRINCIPAL'
        END AS EstadoMovimiento,
        mo.CODIGOALMACEN_PRINCIPAL AS CodigoAlmacenPrincipal,
        mo.NOMBREALMACEN_PRINCIPAL AS NombreAlmacenPrincipal,
        mo.OrdenSecuencia
    FROM (
        SELECT * FROM MovimientoBase
        UNION ALL
        SELECT * FROM MovimientoOculto
    ) mo
    LEFT JOIN admProductos prod ON mo.CIDPRODUCTO = prod.CIDPRODUCTO
    LEFT JOIN admProductosDetalles prodDet ON mo.CIDPRODUCTO = prodDet.CIDPRODUCTO
    LEFT JOIN admCaracteristicasValores carac ON prodDet.CIDVALORCARACTERISTICA1 = carac.CIDVALORCARACTERISTICA
)

SELECT * FROM ResultadosCompletos
ORDER BY OrdenSecuencia, Nivel;
    `;

    console.log(`🔹 [${folio}] Ejecutando consulta de detalle...`);
    const result = await pool.request().query(query);
    console.log(`🔹 [${folio}] Resultados obtenidos:`, result.recordset.length, 'registros');

    const pedido = {
      NumeroPedido: folio,
      Producto: [],
      TipoMovimiento: 'PRINCIPAL',
      ConCaracteristicas: true
    };

    if (result.recordset.length > 0) {
      const primerRegistro = result.recordset[0];
      pedido.Origen = primerRegistro.CodigoAlmacenPrincipal;
      
      const destinoReg = result.recordset.find(r => r.TipoMovimiento === 'DESTINO');
      pedido.Destino = destinoReg ? destinoReg.CodigoAlmacen : null;
      pedido.Fecha_Creacion = new Date().toISOString().split('T')[0];
    }

    const productosUnicos = {};
    result.recordset.forEach(row => {
      if (row.TipoMovimiento === 'ORIGEN' && !productosUnicos[row.CIDPRODUCTO]) {
        productosUnicos[row.CIDPRODUCTO] = true;
        
        const nombreProducto = row.Caracteristica 
          ? `${row.NombreProducto}, ${row.Caracteristica}`
          : row.NombreProducto;

        pedido.Producto.push({
          ProductoID: row.CIDPRODUCTO,
          NombreProducto: nombreProducto,
          Unidades: row.CUNIDADES,
          Caracteristica: row.Caracteristica,
          CodigoProducto: row.CodigoProducto
        });
      }
    });

    console.log(`✅ [${folio}] Detalle procesado correctamente. Productos:`, pedido.Producto.length);
    return pedido;
  } catch (error) {
    console.error(`❌ [${folio}] Error obteniendo detalle:`, error);
    return {
      NumeroPedido: folio,
      Error: "No se pudo obtener el detalle completo"
    };
  }
}