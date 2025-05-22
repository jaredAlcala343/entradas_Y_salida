import React, { useState, useEffect, useRef } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import JsBarcode from "jsbarcode";
import styles from "./SurtirPedido.module.css";
import Navbar from "./navbar";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

const procesarProducto = (producto) => {
  if (!producto) return [];
  
  const codigoProducto = producto.CCODIGOPRODUCTO || producto.codigoProducto;
  const idProducto = producto.idProducto || producto.Producto;
  
  if (producto.nombre_producto?.startsWith("null,")) {
    const caracteristicas = producto.nombre_producto.split(",")
      .slice(1)
      .map(c => c.trim())
      .filter(c => c && c.toLowerCase() !== "null");
    
    if (caracteristicas.length === 0) return [];
    
    const unidadesPorVariante = Math.ceil(producto.Unidades / caracteristicas.length);
    
    return caracteristicas.map(caracteristica => ({
      ...producto,
      nombreBase: producto.CNOMBREPRODUCTO,
      caracteristicas: [caracteristica],
      nombreCompleto: `Cubierta Cubytop Antiderrame Lisa, ${caracteristica}`,
      CCODIGOPRODUCTO: codigoProducto,
      idProducto: idProducto,
      codigoVariante: `${codigoProducto}-${idProducto}-${caracteristica.replace(/\s+/g, '-')}`,
      Unidades: unidadesPorVariante,
      valido: true
    }));
  }

  const nombreProducto = producto.CNOMBREPRODUCTO || producto.nombre_producto || "";
  const partes = nombreProducto.split(",")
    .map(p => p.trim())
    .filter(p => p && p.toLowerCase() !== "null");

  if (partes.length === 0) return [];

  const nombreBase = partes[0];
  const caracteristicas = partes.slice(1);

  if (nombreBase === "Cubierta Cubytop Antiderrame Lisa") {
    if (caracteristicas.length === 0) return [];
    
    const unidadesPorVariante = Math.ceil(producto.Unidades / caracteristicas.length);
    
    return caracteristicas.map(caracteristica => ({
      ...producto,
      nombreBase,
      caracteristicas: [caracteristica],
      nombreCompleto: `${nombreBase}, ${caracteristica}`,
      CCODIGOPRODUCTO: codigoProducto,
      idProducto: idProducto,
      codigoVariante: `${codigoProducto}-${idProducto}-${caracteristica.replace(/\s+/g, '-')}`,
      Unidades: unidadesPorVariante,
      valido: true
    }));
  }

  if (caracteristicas.length > 0) {
    return [
      ...caracteristicas.map(caracteristica => ({
        ...producto,
        nombreBase,
        caracteristicas: [caracteristica],
        nombreCompleto: `${nombreBase}, ${caracteristica}`,
        CCODIGOPRODUCTO: codigoProducto,
        idProducto: idProducto,
        codigoVariante: `${codigoProducto}-${idProducto}-${caracteristica.replace(/\s+/g, '-')}`,
        Unidades: producto.Unidades,
        valido: true
      }))
    ];
  }

  return [{
    ...producto,
    nombreBase,
    caracteristicas: [],
    nombreCompleto: nombreBase,
    CCODIGOPRODUCTO: codigoProducto,
    idProducto: idProducto,
    codigoVariante: `${codigoProducto}-${idProducto}`.replace(/-+$/, ''),
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
  const [operacionesRealizadas, setOperacionesRealizadas] = useState([]);

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

  const buscarPedido = async () => {
    if (!codigoPedido.trim()) {
      alert("⚠️ Ingresa un código de Traspaso válido.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/sPedido?numeroPedido=${codigoPedido}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al buscar el Traspaso");
      }

      const productosProcesados = data.productosPedido
        ?.map(procesarProducto)
        ?.flat()
        ?.filter(p => p.valido) || [];

      if (productosProcesados.length === 0) {
        throw new Error("No se encontraron productos válidos en el traspaso");
      }

      const conteoInicial = {};
      productosProcesados.forEach((p) => {
        conteoInicial[p.codigoVariante] = 0;
      });

      setPedidoInfo({
        codigo: codigoPedido,
        pedido: data.pedido,
        productos: productosProcesados,
        productosRelacionados: data.productosRelacionados || [],
        operaciones: data.operacionesRealizadas || []
      });

      setProductosEscaneados(conteoInicial);
      setProductoActual(productosProcesados[0]);
      setEscaneosRestantes(productosProcesados[0].Unidades);
      setAutenticacionPendiente(false);
      setOperacionesRealizadas(data.operacionesRealizadas || []);
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const verificarProducto = async (codigoProducto) => {
    if (!pedidoInfo || !productoActual || autenticacionPendiente) return;

    codigoProducto = codigoProducto.trim();

    const codigoBaseActual = productoActual.CCODIGOPRODUCTO?.split('-')[0]?.trim();
    const codigoBaseEscaneado = codigoProducto.split('-')[0]?.trim();
    
    if (codigoBaseEscaneado !== codigoBaseActual) {
      alert(`⚠️ Debes escanear un código que comience con: ${codigoBaseActual} para ${productoActual.nombreCompleto}`);
      return;
    }

    if ((productosEscaneados[productoActual.codigoVariante] || 0) >= productoActual.Unidades) {
      alert("⚠️ Ya completaste las unidades requeridas de este producto");
      return;
    }

    try {
      const response = await fetch(
        `/api/verificarProducto?numeroPedido=${codigoPedido}&codigoProducto=${codigoProducto}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error en la verificación del producto");
      }

      const productoEncontrado = data.productos.find(p => {
        if (p.idProducto == (productoActual.idProducto || productoActual.Producto)) {
          return true;
        }
        
        const nombreActual = productoActual.nombreCompleto.toLowerCase().replace(/\s+/g, '');
        const nombreEncontrado = (p.nombreProducto || '').toLowerCase().replace(/\s+/g, '');
        
        return nombreActual.includes(nombreEncontrado) || 
               nombreEncontrado.includes(nombreActual);
      });

      if (!productoEncontrado) {
        alert(`⚠️ El código escaneado (${codigoProducto}) no corresponde a:\n${productoActual.nombreCompleto}\nCódigo esperado: ${productoActual.CCODIGOPRODUCTO}`);
        return;
      }

      const nuevosEscaneos = {
        ...productosEscaneados,
        [productoActual.codigoVariante]: (productosEscaneados[productoActual.codigoVariante] || 0) + 1,
      };

      setProductosEscaneados(nuevosEscaneos);
      setEscaneosRestantes(prev => prev - 1);

      if (nuevosEscaneos[productoActual.codigoVariante] >= productoActual.Unidades) {
        alert(`✅ Completado: ${productoActual.nombreCompleto}`);
        
        const productosOrdenados = [...pedidoInfo.productos].sort(
          (a, b) => Number(a.idProducto || a.Producto) - Number(b.idProducto || b.Producto)
        );

        const actualId = Number(productoActual.idProducto || productoActual.Producto);
        const siguienteProducto = productosOrdenados.find(
          p =>
            Number(p.idProducto || p.Producto) > actualId &&
            (nuevosEscaneos[p.codigoVariante] || 0) < p.Unidades
        );

        if (siguienteProducto) {
          setProductoActual(siguienteProducto);
          setEscaneosRestantes(
            siguienteProducto.Unidades - (nuevosEscaneos[siguienteProducto.codigoVariante] || 0)
          );
        } else if (productosOrdenados.every(p => (nuevosEscaneos[p.codigoVariante] || 0) >= p.Unidades)) {
          alert("✅ Todos los productos han sido escaneados correctamente");
          setAutenticacionPendiente(true);
        }
      }
    } catch (error) {
      console.error("Error en verificación:", error);
      alert("⚠️ Error de conexión, usando verificación local");

      const nuevosEscaneos = {
        ...productosEscaneados,
        [productoActual.codigoVariante]: (productosEscaneados[productoActual.codigoVariante] || 0) + 1,
      };

      setProductosEscaneados(nuevosEscaneos);
      setEscaneosRestantes(prev => prev - 1);
    }
  };

  const validarYConfirmarSurtido = async () => {
    if (!usuario || !password) {
      alert("Debe ingresar usuario y contraseña");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/data?type=validarUsuario&usuario=${usuario}&contrasena=${password}`);
      const data = await res.json();

      if (!res.ok || !data.valid) {
        throw new Error(data.message || "Credenciales inválidas");
      }

      await confirmarSurtido();
    } catch (error) {
      setMensajeError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmarSurtido = async () => {
    try {
      await Promise.all([
        generarPDFDetallesPedido(),
        generarPDFCodigosBarras(),
        actualizarEstadoPedido()
      ]);

      alert(`✅ Traspaso ${codigoPedido} surtido correctamente`);
      resetearEstado();
    } catch (error) {
      console.error("Error al confirmar:", error);
      alert("Error al confirmar el surtido");
    }
  };

  const actualizarEstadoPedido = async () => {
    const response = await fetch(`/api/actualizarEstadoPedido`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        numeroPedido: codigoPedido, 
        nuevoEstado: "Surtido" 
      }),
    });

    if (!response.ok) {
      throw new Error("Error al actualizar estado del pedido");
    }
  };

  const generarPDFDetallesPedido = async () => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text(`Detalles del Traspaso: ${codigoPedido}`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Origen: ${pedidoInfo.pedido.origen || "No especificado"}`, 14, 30);
    doc.text(`Destino: ${pedidoInfo.pedido.destino || "No especificado"}`, 14, 40);
    doc.text(`Fecha: ${new Date(pedidoInfo.pedido.fechaCreacion).toLocaleDateString()}`, 14, 50);
    
    const productos = pedidoInfo.productos.map((producto, index) => [
      index + 1,
      producto.nombreCompleto,
      producto.CCODIGOPRODUCTO,
      producto.Unidades,
      productosEscaneados[producto.codigoVariante] || 0,
      {
        content: (productosEscaneados[producto.codigoVariante] || 0) >= producto.Unidades ? "COMPLETO" : "PENDIENTE",
        styles: {
          textColor: (productosEscaneados[producto.codigoVariante] || 0) >= producto.Unidades ? [0, 128, 0] : [255, 0, 0]
        }
      }
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
      }
    });

    doc.save(`Detalles_Traspaso_${codigoPedido}.pdf`);
  };

  const generarPDFCodigosBarras = async () => {
    const doc = new jsPDF();
    let yPosition = 20;
    
    doc.setFontSize(16);
    doc.text(`Códigos de Barras - Traspaso ${codigoPedido}`, 14, 15);
    doc.setFontSize(10);
    
    for (const producto of pedidoInfo.productos) {
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, producto.CCODIGOPRODUCTO, { 
        format: "CODE128",
        width: 2,
        height: 50,
        displayValue: true
      });
      
      const imgData = canvas.toDataURL("image/png");
      
      doc.text(`${producto.nombreCompleto}`, 14, yPosition);
      yPosition += 5;
      
      doc.addImage(imgData, "PNG", 14, yPosition, 100, 30);
      yPosition += 35;
      
      doc.text(`Código: ${producto.CCODIGOPRODUCTO} - Unidades: ${producto.Unidades}`, 14, yPosition);
      yPosition += 10;
      
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }
    }

    doc.save(`Codigos_Barras_Traspaso_${codigoPedido}.pdf`);
  };

  const resetearEstado = () => {
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
    setOperacionesRealizadas([]);
  };

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
            <button 
              className={styles.primaryButton} 
              onClick={buscarPedido} 
              disabled={loading}
            >
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
                  <p><strong>ID Producto:</strong> {productoActual.idProducto || productoActual.Producto}</p>
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
                  <div className={styles.tableColumn}><h3>ID Producto</h3></div>
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
                        className={`${styles.tableRow} 
                          ${isActive ? styles.activeRow : ""} 
                          ${isCompleted ? styles.completedRow : ""}`}
                      >
                        <div className={styles.tableColumn}>{index + 1}</div>
                        <div className={styles.tableColumn}>
                          {producto.nombre_producto || producto.CNOMBREPRODUCTO}
                        </div>
                        <div className={styles.tableColumn}>{producto.idProducto || producto.Producto}</div>
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