import React, { useState, useEffect, useRef } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import JsBarcode from "jsbarcode";
import styles from "./SurtirPedido.module.css";
import Navbar from "./navbar";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

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
  
  // Refs para manejar el foco de los inputs
  const inputPedidoRef = useRef(null);
  const inputProductoRef = useRef(null);
  const inputUsuarioRef = useRef(null);

  // Enfocar el input correspondiente según el estado
  useEffect(() => {
    if (!pedidoInfo && inputPedidoRef.current) {
      inputPedidoRef.current.focus();
    } else if (productoActual && !autenticacionPendiente && inputProductoRef.current) {
      inputProductoRef.current.focus();
    } else if (autenticacionPendiente && inputUsuarioRef.current) {
      inputUsuarioRef.current.focus();
    }
  }, [pedidoInfo, productoActual, autenticacionPendiente]);

  // Buscar pedido en la base de datos
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

      // Inicializar estado de productos
      const conteoInicial = {};
      data.productosRelacionados.forEach(p => {
        conteoInicial[p.CCODIGOPRODUCTO] = 0;
      });

      setPedidoInfo({
        codigo: codigoPedido,
        pedido: data.pedido, // Incluye origen y destino
        productos: data.productosRelacionados
      });

      setProductosEscaneados(conteoInicial);

      // Establecer el primer producto como actual
      if (data.productosRelacionados.length > 0) {
        setProductoActual(data.productosRelacionados[0]);
        setEscaneosRestantes(data.productosRelacionados[0].CUNIDADES);
      }

      setAutenticacionPendiente(false);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Verificar producto en la base de datos y actualizar conteo
  const verificarProducto = async (codigoProducto) => {
    if (!pedidoInfo || !productoActual || autenticacionPendiente) return;
    
    // Limpiar código de posibles espacios
    codigoProducto = codigoProducto.trim();

    // Verificación local primero
    const productoEnPedido = pedidoInfo.productos.find(
      p => p.CCODIGOPRODUCTO === codigoProducto
    );

    if (!productoEnPedido) {
      alert(`⚠️ El producto ${codigoProducto} no está en este traspaso`);
      return;
    }

    // Verificar si es el producto actual
    if (codigoProducto !== productoActual.CCODIGOPRODUCTO) {
      alert(`⚠️ Debes escanear primero: ${productoActual.CNOMBREPRODUCTO} (${productoActual.CCODIGOPRODUCTO})`);
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
        [codigoProducto]: (productosEscaneados[codigoProducto] || 0) + 1
      };
      
      setProductosEscaneados(nuevosEscaneos);
      setEscaneosRestantes(prev => prev - 1);

      // Verificar si completamos este producto
      if (nuevosEscaneos[codigoProducto] >= productoActual.CUNIDADES) {
        alert(`✅ Completado: ${productoActual.CNOMBREPRODUCTO}`);
        
        // Buscar siguiente producto pendiente
        const indexActual = pedidoInfo.productos.findIndex(
          p => p.CCODIGOPRODUCTO === productoActual.CCODIGOPRODUCTO
        );
        
        const siguienteProducto = pedidoInfo.productos.slice(indexActual + 1).find(p => {
          const escaneados = nuevosEscaneos[p.CCODIGOPRODUCTO] || 0;
          return escaneados < p.CUNIDADES;
        });

        if (siguienteProducto) {
          setProductoActual(siguienteProducto);
          setEscaneosRestantes(
            siguienteProducto.CUNIDADES - (nuevosEscaneos[siguienteProducto.CCODIGOPRODUCTO] || 0)
          );
        } else {
          const todosCompletados = pedidoInfo.productos.every(
            p => (nuevosEscaneos[p.CCODIGOPRODUCTO] || 0) >= p.CUNIDADES
          );
          
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
        [codigoProducto]: (productosEscaneados[codigoProducto] || 0) + 1
      };
      
      setProductosEscaneados(nuevosEscaneos);
      setEscaneosRestantes(prev => prev - 1);
    }
  };

  const handleCodigoManual = (e) => {
    if (e.key === "Enter" && !autenticacionPendiente) {
      verificarProducto(codigoManual.trim());
      setCodigoManual("");
    }
  };

  const handleCodigoPedidoKeyDown = (e) => {
    if (e.key === "Enter") {
      buscarPedido();
    }
  };

  const validarYConfirmarSurtido = async () => {
    if (!usuario || !password) {
      alert("Debe ingresar usuario y contraseña");
      return;
    }

    try {
      const res = await fetch(`/api/data?type=validarUsuario&usuario=${usuario}&contrasena=${password}`, {
        method: "GET"
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

  const actualizarEstadoPedido = async (numeroPedido, nuevoEstado) => {
    try {
      const response = await fetch(`/api/actualizarEstadoPedido`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numeroPedido, nuevoEstado })
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
        if (!pedidoInfo || !pedidoInfo.productos) {
            throw new Error("Información del pedido o productos no está definida");
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Encabezado
        doc.setFontSize(18);
        doc.setTextColor(40);
        doc.text('Comprobante de Surtido', pageWidth / 2, 20, { align: 'center' });

        doc.setFontSize(12);
        doc.text(`Número de Traspaso: ${numeroPedido}`, 20, 40);
        doc.text(`Origen: ${pedidoInfo.pedido.origen || "No especificado"}`, 20, 50);
        doc.text(`Destino: ${pedidoInfo.pedido.destino || "No especificado"}`, 20, 60);
        doc.text(`Fecha: ${new Date().toLocaleString()}`, 20, 70);

        // Generar el código de barras
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, numeroPedido, {
            format: 'CODE128',
            displayValue: true,
            fontSize: 10,
        });
        const imgData = canvas.toDataURL('image/png');

        // Agregar el código de barras al PDF
        doc.addImage(imgData, 'PNG', pageWidth - 70, 30, 50, 20); // Posición y tamaño del código de barras

        // Tabla de productos
        const productos = pedidoInfo.productos.map((producto, index) => [
            index + 1,
            producto.CNOMBREPRODUCTO,
            producto.CUNIDADES,
            productosEscaneados[producto.CCODIGOPRODUCTO] || 0,
            producto.CCODIGOPRODUCTO,
        ]);

        doc.autoTable({
            head: [['#', 'Producto', 'Solicitado', 'Escaneado', 'Código']],
            body: productos,
            startY: 90,
            theme: 'grid',
            styles: {
                fontSize: 10,
                halign: 'center',
                valign: 'middle',
            },
            headStyles: {
                fillColor: [0, 123, 255],
                textColor: 255,
                fontSize: 12,
            },
        });

        // Espacio para firma
        const finalY = doc.autoTable.previous.finalY + 20;
        doc.setFontSize(12);
        doc.text('Firma del Empleado que Surtió:', 20, finalY);
        doc.line(20, finalY + 5, pageWidth - 20, finalY + 5); // Línea para la firma

        // Pie de página
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(10);
            doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
            doc.text('Traspasos Cubylam - Todos los derechos reservados', pageWidth / 2, pageHeight - 5, { align: 'center' });
        }

        doc.save(`Comprobante_Surtido_${numeroPedido}.pdf`);
    } catch (error) {
        console.error("Error al generar PDF:", error);
    }
  };

  const generarPDFCodigosBarras = async (numeroPedido, pedidoInfo) => {
    try {
        if (!pedidoInfo || !pedidoInfo.productos) {
            throw new Error("No hay información de productos");
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        let xPos = 20; // Margen izquierdo
        let yPos = 40; // Margen superior
        const labelWidth = 100; // Ancho de cada etiqueta
        const labelHeight = 60; // Altura de cada etiqueta
        const spaceBetweenLabels = 10; // Espacio entre etiquetas

        // Encabezado del PDF
        doc.setFontSize(16);
        doc.text('Códigos de Barras - Traspaso', pageWidth / 2, 20, { align: 'center' });
        doc.setFontSize(12);
        doc.text(`Número de Traspaso: ${numeroPedido}`, 20, 30);

        // Generar un código de barras por producto
        pedidoInfo.productos.forEach((producto) => {
            const codigoCombinado = `${producto.CCODIGOPRODUCTO}-${producto.CUNIDADES}`; // Código combinado

            // Crear el código de barras
            const canvas = document.createElement('canvas');
            JsBarcode(canvas, codigoCombinado, {
                format: 'CODE128',
                displayValue: true,
                fontSize: 10,
            });
            const imgData = canvas.toDataURL('image/png');

            // Dibujar la etiqueta
            doc.rect(xPos, yPos, labelWidth, labelHeight); // Borde de la etiqueta
            doc.addImage(imgData, 'PNG', xPos + 5, yPos + 5, labelWidth - 10, 30); // Código de barras
            doc.text(producto.CNOMBREPRODUCTO, xPos + labelWidth / 2, yPos + 45, { align: 'center' }); // Nombre del producto
            doc.text(codigoCombinado, xPos + labelWidth / 2, yPos + 55, { align: 'center' }); // Código combinado

            // Ajustar posición para la siguiente etiqueta
            xPos += labelWidth + spaceBetweenLabels;

            // Si no hay espacio horizontal, mover a la siguiente fila
            if (xPos + labelWidth > pageWidth - 20) {
                xPos = 20; // Reiniciar posición horizontal
                yPos += labelHeight + spaceBetweenLabels;

                // Si no hay espacio vertical, agregar una nueva página
                if (yPos + labelHeight > pageHeight - 20) {
                    doc.addPage();
                    yPos = 40; // Reiniciar posición vertical
                }
            }
        });

        // Guardar el PDF
        doc.save(`Codigos_Barras_Traspaso_${numeroPedido}.pdf`);
    } catch (error) {
        console.error("Error al generar PDF de códigos:", error);
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
              </div>
            </div>
            
            {productoActual && (
              <div className={styles.productoActualContainer}>
                <h4 className={styles.productoActualTitle}>Producto actual</h4>
                <div className={styles.productoActualInfo}>
                  <p><strong>Nombre:</strong> {productoActual.CNOMBREPRODUCTO}</p>
                  <p><strong>Código:</strong> {productoActual.CCODIGOPRODUCTO}</p>
                  <p className={styles.escaneosInfo}>
                    <strong>Escaneados:</strong> 
                    <span className={styles.escaneosCount}>
                      {productosEscaneados[productoActual.CCODIGOPRODUCTO] || 0} / {productoActual.CUNIDADES}
                    </span>
                  </p>
                </div>
              </div>
            )}
            
            <div className={styles.productosContainer}>
              <div className={styles.tableHeader}>
                <div className={styles.tableColumn}><h3>Productos</h3></div>
                <div className={styles.tableColumn}><h3>Cantidad</h3></div>
                <div className={styles.tableColumn}><h3>Escaneados</h3></div>
              </div>
              
              <div className={styles.tableBody}>
                {pedidoInfo.productos.map((producto, index) => (
                  <div 
                    key={index} 
                    className={`${styles.tableRow} ${
                      producto.CCODIGOPRODUCTO === productoActual?.CCODIGOPRODUCTO ? styles.activeRow : ''
                    }`}
                  >
                    <div className={styles.tableColumn}>{producto.CNOMBREPRODUCTO}</div>
                    <div className={styles.tableColumn}>{producto.CUNIDADES}</div>
                    <div className={styles.tableColumn}>
                      <span className={
                        (productosEscaneados[producto.CCODIGOPRODUCTO] || 0) >= producto.CUNIDADES 
                          ? styles.completed 
                          : styles.pending
                      }>
                        {productosEscaneados[producto.CCODIGOPRODUCTO] || 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {!pedidoSurtido && !autenticacionPendiente && (
              <div className={styles.scanContainer}>
                <h5 className={styles.scanTitle}>Escanea el producto actual:</h5>
                <div className={styles.inputContainer}>
                    <input
                        ref={inputProductoRef}
                        className={styles.inputLarge}
                        type="text"
                        placeholder={`Ingrese código: ${productoActual?.CCODIGOPRODUCTO || ''}`}
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