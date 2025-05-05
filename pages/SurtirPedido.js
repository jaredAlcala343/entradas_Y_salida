import React, { useState, useEffect, useRef } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import JsBarcode from "jsbarcode";
import styles from "./SurtirPedido.module.css";
import Navbar from "./navbar";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

const procesarProducto = (producto) => {
  // Caso especial para productos con características (ej: "null, Autum Indian Slate")
  if (producto.nombre_producto && producto.nombre_producto.startsWith("null,")) {
    const caracteristicas = producto.nombre_producto.split(",")
      .slice(1) // Eliminamos el "null" inicial
      .map(c => c.trim())
      .filter(c => c && c.toLowerCase() !== "null");
    
    if (caracteristicas.length === 0) return []; // No hay características válidas
    
    // Calculamos unidades por variante (distribución equitativa)
    const unidadesPorVariante = Math.ceil(producto.Unidades / caracteristicas.length);
    
    return caracteristicas.map(caracteristica => ({
      ...producto,
      nombreBase: "Cubierta Cubytop Antiderrame Lisa",
      caracteristicas: [caracteristica],
      nombreCompleto: `Cubierta Cubytop Antiderrame Lisa, ${caracteristica}`,
      CCODIGOPRODUCTO: "CUANL",
      codigoVariante: `${producto.Producto}-${caracteristica.replace(/\s+/g, '-')}`,
      Unidades: unidadesPorVariante,
      valido: true
    }));
  }

  // Productos normales
  const nombreProducto = producto.CNOMBREPRODUCTO || producto.nombre_producto || "";
  const partes = nombreProducto.split(",")
    .map(p => p.trim())
    .filter(p => p && p.toLowerCase() !== "null");

  if (partes.length === 0) return []; // No hay nombre válido

  const nombreBase = partes[0];
  const caracteristicas = partes.slice(1);

  // Si es el producto que queremos excluir, solo mostramos variantes con características
  if (nombreBase === "Cubierta Cubytop Antiderrame Lisa") {
    if (caracteristicas.length === 0) return []; // Excluimos el base
    
    const unidadesPorVariante = Math.ceil(producto.Unidades / caracteristicas.length);
    
    return caracteristicas.map(caracteristica => ({
      ...producto,
      nombreBase,
      caracteristicas: [caracteristica],
      nombreCompleto: `${nombreBase}, ${caracteristica}`,
      CCODIGOPRODUCTO: producto.CCODIGOPRODUCTO || "CODIGO_NO_DISPONIBLE",
      codigoVariante: `${producto.Producto}-${caracteristica.replace(/\s+/g, '-')}`,
      Unidades: unidadesPorVariante,
      valido: true
    }));
  }

  // Para otros productos, mostramos base + características si existen
  if (caracteristicas.length > 0) {
    return [
      {
        ...producto,
        nombreBase,
        caracteristicas: [],
        nombreCompleto: nombreBase,
        codigoVariante: producto.Producto,
        valido: true
      },
      ...caracteristicas.map(caracteristica => ({
        ...producto,
        nombreBase,
        caracteristicas: [caracteristica],
        nombreCompleto: `${nombreBase}, ${caracteristica}`,
        CCODIGOPRODUCTO: producto.CCODIGOPRODUCTO || "CODIGO_NO_DISPONIBLE",
        codigoVariante: `${producto.Producto}-${caracteristica.replace(/\s+/g, '-')}`,
        Unidades: producto.Unidades, // Mismas unidades para cada variante
        valido: true
      }))
    ];
  }

  // Producto normal sin características
  return [{
    ...producto,
    nombreBase,
    caracteristicas: [],
    nombreCompleto: nombreBase,
    codigoVariante: producto.Producto,
    valido: true
  }];
};

const PanelSurtir = () => {
  const [codigoPedido, setCodigoPedido] = useState("");
  const [pedidoInfo, setPedidoInfo] = useState(null);
  const [productosEscaneados, setProductosEscaneados] = useState({});
  const [codigoManual, setCodigoManual] = useState("");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [pedidoSurtido, setPedidoSurtido] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autenticacionPendiente, setAutenticacionPendiente] = useState(false);
  const [mensajeError, setMensajeError] = useState("");
  const [productoActual, setProductoActual] = useState(null);
  const [escaneosRestantes, setEscaneosRestantes] = useState(0);

  const inputPedidoRef = useRef(null);
  const inputProductoRef = useRef(null);
  const inputUsuarioRef = useRef(null);

  useEffect(() => {
    if (!pedidoInfo && inputPedidoRef.current) {
      inputPedidoRef.current.focus();
    } else if (productoActual && !autenticacionPendiente && inputProductoRef.current) {
      inputProductoRef.current.focus();
    } else if (autenticacionPendiente && inputUsuarioRef.current) {
      inputUsuarioRef.current.focus();
    }
  }, [pedidoInfo, productoActual, autenticacionPendiente]);

  const handleCodigoPedidoKeyDown = (e) => {
    if (e.key === "Enter") {
      buscarPedido();
    }
  };

  const handleCodigoManual = (e) => {
    if (e.key === "Enter" && !autenticacionPendiente) {
      verificarProducto(codigoManual.trim());
      setCodigoManual("");
    }
  };

  const buscarPedido = async () => {
    if (!codigoPedido.trim()) {
      alert("⚠️ Ingresa un código de Traspaso válido.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/sPedido?numeroPedido=${codigoPedido}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.message || "Error al buscar el Traspaso");

      // Procesar productos y aplanar el array
      const productosProcesados = data.productosPedido
        .map(procesarProducto)
        .flat()
        .filter(p => p.valido); // Filtramos solo productos válidos

      if (productosProcesados.length === 0) {
        throw new Error("No se encontraron productos válidos en el traspaso");
      }

      // Inicializar conteo de escaneos
      const conteoInicial = {};
      productosProcesados.forEach((p) => {
        conteoInicial[p.codigoVariante] = 0;
      });

      setPedidoInfo({
        codigo: codigoPedido,
        pedido: data.pedido,
        productos: productosProcesados
      });

      setProductosEscaneados(conteoInicial);
      setProductoActual(productosProcesados[0]);
      setEscaneosRestantes(productosProcesados[0].Unidades);
      setAutenticacionPendiente(false);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const verificarProducto = async (codigoProducto) => {
    if (!pedidoInfo || !productoActual || autenticacionPendiente) return;

    codigoProducto = codigoProducto.trim();

    if (codigoProducto !== productoActual.CCODIGOPRODUCTO) {
      alert(`⚠️ Debes escanear el código: ${productoActual.CCODIGOPRODUCTO} para ${productoActual.nombreCompleto}`);
      return;
    }

    if (escaneosRestantes <= 0) {
      alert("⚠️ Ya completaste las unidades requeridas de este producto");
      return;
    }

    try {
      const response = await fetch(
        `/api/verificarProducto?numeroPedido=${codigoPedido}&codigoProducto=${codigoProducto}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error en la respuesta del servidor");
      }

      // Actualizar conteo
      const nuevosEscaneos = {
        ...productosEscaneados,
        [productoActual.codigoVariante]: (productosEscaneados[productoActual.codigoVariante] || 0) + 1,
      };

      setProductosEscaneados(nuevosEscaneos);
      setEscaneosRestantes((prev) => prev - 1);

      // Verificar si se completó este producto
      if (nuevosEscaneos[productoActual.codigoVariante] >= productoActual.Unidades) {
        alert(`✅ Completado: ${productoActual.nombreCompleto}`);

        // Buscar siguiente producto pendiente
        const indexActual = pedidoInfo.productos.findIndex(
          (p) => p.codigoVariante === productoActual.codigoVariante
        );

        const siguienteProducto = pedidoInfo.productos.slice(indexActual + 1).find((p) => {
          return (nuevosEscaneos[p.codigoVariante] || 0) < p.Unidades;
        });

        if (siguienteProducto) {
          setProductoActual(siguienteProducto);
          setEscaneosRestantes(
            siguienteProducto.Unidades - (nuevosEscaneos[siguienteProducto.codigoVariante] || 0)
          );
        } else {
          const todosCompletados = pedidoInfo.productos.every((p) => {
            return (nuevosEscaneos[p.codigoVariante] || 0) >= p.Unidades;
          });

          if (todosCompletados) {
            alert("✅ Todos los productos han sido escaneados correctamente");
            setAutenticacionPendiente(true);
          }
        }
      }
    } catch (error) {
      console.error("Error en verificación:", error);
      alert("⚠️ Error de conexión, usando verificación local");

      // Actualizar conteo a pesar del error
      const nuevosEscaneos = {
        ...productosEscaneados,
        [productoActual.codigoVariante]: (productosEscaneados[productoActual.codigoVariante] || 0) + 1,
      };

      setProductosEscaneados(nuevosEscaneos);
      setEscaneosRestantes((prev) => prev - 1);
    }
  };

  const validarYConfirmarSurtido = async () => {
    if (!usuario || !password) {
      alert("Debe ingresar usuario y contraseña");
      return;
    }

    try {
      const res = await fetch(`/api/data?type=validarUsuario&usuario=${usuario}&contrasena=${password}`, {
        method: "GET",
      });

      if (!res.ok) throw new Error("Error en la validación");

      const data = await res.json();

      if (!data.valid) {
        throw new Error("Credenciales inválidas");
      }

      await confirmarSurtido();
    } catch (error) {
      setMensajeError(error.message);
    }
  };

  const confirmarSurtido = async () => {
    try {
      await generarPDFDetallesPedido(codigoPedido, pedidoInfo);
      await generarPDFCodigosBarras(codigoPedido, pedidoInfo);
      await actualizarEstadoPedido(codigoPedido, "Surtido");

      alert(`✅ Traspaso ${codigoPedido} surtido correctamente`);

      // Resetear estado
      setCodigoPedido("");
      setPedidoInfo(null);
      setProductosEscaneados({});
      setCodigoManual("");
      setUsuario("");
      setPassword("");
      setAutenticacionPendiente(false);
      setProductoActual(null);
      setEscaneosRestantes(0);
      setPedidoSurtido(true);
    } catch (error) {
      console.error("Error al confirmar:", error);
      alert("Error al confirmar el surtido");
    }
  };

  const actualizarEstadoPedido = async (numeroPedido, nuevoEstado) => {
    try {
      const response = await fetch(`/api/actualizarEstadoPedido`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numeroPedido, nuevoEstado }),
      });

      if (!response.ok) throw new Error("Error al actualizar estado");
      return await response.json();
    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
  };

  const generarPDFDetallesPedido = async (numeroPedido, pedidoInfo) => {
    try {
      const doc = new jsPDF();
      
      // Encabezado
      doc.setFontSize(16);
      doc.text(`Detalles del Traspaso: ${numeroPedido}`, 14, 20);
      doc.setFontSize(12);
      doc.text(`Origen: ${pedidoInfo.pedido.origen || "No especificado"}`, 14, 30);
      doc.text(`Destino: ${pedidoInfo.pedido.destino || "No especificado"}`, 14, 40);
      doc.text(`Fecha: ${new Date(pedidoInfo.pedido.fechaCreacion).toLocaleDateString()}`, 14, 50);
      
      // Tabla de productos
      const productos = pedidoInfo.productos.map((producto, index) => [
        index + 1,
        producto.nombreCompleto,
        producto.CCODIGOPRODUCTO,
        producto.Unidades,
        productosEscaneados[producto.codigoVariante] || 0,
        (productosEscaneados[producto.codigoVariante] || 0) >= producto.Unidades ? "COMPLETO" : "PENDIENTE"
      ]);

      doc.autoTable({
        startY: 60,
        head: [["#", "Producto", "Código", "Solicitado", "Escaneado", "Estado"]],
        body: productos,
        styles: {
          cellPadding: 4,
          fontSize: 10,
          valign: 'middle'
        },
        columnStyles: {
          1: { cellWidth: 60 },
          5: { cellWidth: 25 }
        },
        didDrawCell: (data) => {
          if (data.column.index === 5 && data.cell.raw === "COMPLETO") {
            doc.setTextColor(0, 128, 0);
          } else if (data.column.index === 5) {
            doc.setTextColor(255, 0, 0);
          }
        }
      });

      doc.save(`Detalles_Traspaso_${numeroPedido}.pdf`);
    } catch (error) {
      console.error("Error al generar PDF:", error);
    }
  };

  const generarPDFCodigosBarras = async (numeroPedido, pedidoInfo) => {
    try {
      const doc = new jsPDF();
      let yPosition = 20;
      
      // Encabezado
      doc.setFontSize(16);
      doc.text(`Códigos de Barras - Traspaso ${numeroPedido}`, 14, 15);
      doc.setFontSize(10);
      
      // Generar códigos de barras
      for (const producto of pedidoInfo.productos) {
        const canvas = document.createElement("canvas");
        JsBarcode(canvas, producto.CCODIGOPRODUCTO, { 
          format: "CODE128",
          width: 2,
          height: 50,
          displayValue: true
        });
        
        const imgData = canvas.toDataURL("image/png");
        
        // Agregar información del producto
        doc.text(`${producto.nombreCompleto}`, 14, yPosition);
        yPosition += 5;
        
        // Agregar código de barras
        doc.addImage(imgData, "PNG", 14, yPosition, 100, 30);
        yPosition += 35;
        
        // Agregar detalles
        doc.text(`Código: ${producto.CCODIGOPRODUCTO} - Unidades: ${producto.Unidades}`, 14, yPosition);
        yPosition += 10;
        
        // Nueva página si es necesario
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }
      }

      doc.save(`Codigos_Barras_Traspaso_${numeroPedido}.pdf`);
    } catch (error) {
      console.error("Error al generar PDF de códigos:", error);
    }
  };

  return (
    <div className={styles.container}>
      <Navbar />
      <div className={styles.panelContainer}>
        <h3 className={styles.panelTitle}>Panel de Surtir Traspaso</h3>

        {!pedidoInfo ? (
          <div className={styles.searchContainer}>
            <h4 className={styles.subtitle}>Ingresa o Escanea el Código del Traspaso</h4>
            <div className={styles.inputContainer}>
              <input
                ref={inputPedidoRef}
                className={styles.inputLarge}
                type="text"
                placeholder="Código de Traspaso"
                value={codigoPedido}
                onChange={(e) => setCodigoPedido(e.target.value)}
                onKeyDown={handleCodigoPedidoKeyDown}
                autoFocus
              />
            </div>
            <button className={styles.primaryButton} onClick={buscarPedido} disabled={loading}>
              {loading ? "Buscando..." : "Buscar Traspaso"}
            </button>
          </div>
        ) : (
          <div className={styles.pedidoContainer}>
            <div className={styles.header}>
              <h4 className={styles.pedidoTitle}>Traspaso: {pedidoInfo.codigo}</h4>
              <div className={styles.pedidoInfo}>
                <p><strong>Origen:</strong> {pedidoInfo.pedido.origen || "No especificado"}</p>
                <p><strong>Destino:</strong> {pedidoInfo.pedido.destino || "No especificado"}</p>
                <p><strong>Fecha creación:</strong> {new Date(pedidoInfo.pedido.fechaCreacion).toLocaleDateString()}</p>
                <p><strong>Estatus:</strong> {pedidoInfo.pedido.estatus}</p>
              </div>
            </div>

            {productoActual && (
              <div className={styles.productoActualContainer}>
                <h4 className={styles.productoActualTitle}>Producto actual</h4>
                <div className={styles.productoActualInfo}>
                  <p><strong>Nombre:</strong> {productoActual.nombreCompleto}</p>
                  <p><strong>Código a escanear:</strong> {productoActual.CCODIGOPRODUCTO}</p>
                  <p><strong>Unidades requeridas:</strong> {productoActual.Unidades}</p>
                  <p className={styles.escaneosInfo}>
                    <strong>Escaneados:</strong>
                    <span className={styles.escaneosCount}>
                      {productosEscaneados[productoActual.codigoVariante] || 0} / {productoActual.Unidades}
                    </span>
                  </p>
                </div>
              </div>
            )}

            <div className={styles.productosContainer}>
              <h4 className={styles.productosTitle}>Productos a escanear</h4>
              <div className={styles.tableContainer}>
                <div className={styles.tableHeader}>
                  <div className={styles.tableColumn}><h3>#</h3></div>
                  <div className={styles.tableColumn}><h3>Producto</h3></div>
                  <div className={styles.tableColumn}><h3>Código</h3></div>
                  <div className={styles.tableColumn}><h3>Solicitado</h3></div>
                  <div className={styles.tableColumn}><h3>Escaneado</h3></div>
                </div>

                <div className={styles.tableBody}>
                  {pedidoInfo.productos.map((producto, index) => {
                    const isActive = productoActual?.codigoVariante === producto.codigoVariante;
                    const isCompleted = (productosEscaneados[producto.codigoVariante] || 0) >= producto.Unidades;

                    return (
                      <div
                        key={`producto-${index}`}
                        className={`${styles.tableRow} ${isActive ? styles.activeRow : ""} ${
                          isCompleted ? styles.completedRow : ""
                        }`}
                      >
                        <div className={styles.tableColumn}>{index + 1}</div>
                        <div className={styles.tableColumn}>
                          {producto.caracteristicas.length > 0 ? (
                            <>
                              <strong>{producto.nombreBase}</strong>
                              <div className={styles.caracteristicas}>
                                {producto.caracteristicas.join(", ")}
                              </div>
                            </>
                          ) : (
                            <strong>{producto.nombreBase}</strong>
                          )}
                        </div>
                        <div className={styles.tableColumn}>{producto.CCODIGOPRODUCTO}</div>
                        <div className={styles.tableColumn}>{producto.Unidades}</div>
                        <div className={styles.tableColumn}>
                          <span className={isCompleted ? styles.completed : styles.pending}>
                            {productosEscaneados[producto.codigoVariante] || 0}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {!pedidoSurtido && !autenticacionPendiente && productoActual && (
              <div className={styles.scanContainer}>
                <h5 className={styles.scanTitle}>Escanea el producto actual:</h5>
                <div className={styles.inputContainer}>
                  <input
                    ref={inputProductoRef}
                    className={styles.inputLarge}
                    type="text"
                    placeholder={`Ingrese código: ${productoActual.CCODIGOPRODUCTO}`}
                    value={codigoManual}
                    onChange={(e) => setCodigoManual(e.target.value)}
                    onKeyDown={handleCodigoManual}
                  />
                </div>
                <p className={styles.scanHint}>Presiona Enter para confirmar el escaneo</p>
              </div>
            )}

            {autenticacionPendiente && (
              <div className={styles.authContainer}>
                <h4 className={styles.authTitle}>Confirmación de Traspaso</h4>
                <p className={styles.authSubtitle}>Ingrese sus credenciales para finalizar el proceso</p>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Usuario:</label>
                  <input
                    ref={inputUsuarioRef}
                    className={styles.formInput}
                    type="text"
                    placeholder="Usuario"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Contraseña:</label>
                  <input
                    className={styles.formInput}
                    type="password"
                    placeholder="Contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {mensajeError && <p className={styles.errorMessage}>{mensajeError}</p>}

                <button
                  className={styles.primaryButton}
                  onClick={validarYConfirmarSurtido}
                  disabled={loading}
                >
                  {loading ? "Validando..." : "Confirmar Surtido"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PanelSurtir;