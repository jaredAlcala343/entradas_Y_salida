import React, { useState } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import JsBarcode from "jsbarcode";
import styles from "./SurtirPedido.module.css";
import Navbar from "./navbar";

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

  // 🔹 Buscar pedido en la base de datos
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

      setPedidoInfo({ codigo: codigoPedido, productos: data });

      // 🔹 Inicializar conteo de productos escaneados
      const conteoInicial = {};
      data.forEach((p) => (conteoInicial[p.CCODIGOPRODUCTO] = 0));
      setProductosEscaneados(conteoInicial);

      setAutenticacionPendiente(false);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Verificar producto en la base de datos y actualizar conteo
  const verificarProducto = async (codigoProducto) => {
    if (!pedidoInfo || autenticacionPendiente) return; // 🔹 Bloquear escaneo si hay autenticación pendiente

    try {
      const response = await fetch(`/api/verificarProducto?numeroPedido=${codigoPedido}&codigoProducto=${codigoProducto}`);
      const data = await response.json();

      if (!response.ok || !data.existe) {
        alert("⚠️ Código no pertenece al Traspaso.");
        return;
      }

      setProductosEscaneados((prev) => {
        const nuevosEscaneos = { ...prev };

        if (!nuevosEscaneos[codigoProducto]) nuevosEscaneos[codigoProducto] = 0;
        nuevosEscaneos[codigoProducto]++;

        // 🔹 Verificar si se completaron todas las unidades de este producto
        const producto = pedidoInfo.productos.find((p) => p.CCODIGOPRODUCTO === codigoProducto);
        if (nuevosEscaneos[codigoProducto] >= producto.Unidades) {
          alert(`✅ Se completaron todas las unidades de ${producto.CNOMBREPRODUCTO}`);
        }

        // 🔹 Verificar si se escanearon todos los productos
        const todosEscaneados = pedidoInfo.productos.every(
          (p) => nuevosEscaneos[p.CCODIGOPRODUCTO] >= p.Unidades
        );

        if (todosEscaneados) {
          alert("✅ Todos los productos han sido escaneados.");
          setAutenticacionPendiente(true); // 🔹 Mostrar panel de autenticación
        }

        return nuevosEscaneos;
      });
    } catch (error) {
      console.error("Error al verificar producto:", error);
    }
  };

  // 🔹 Escaneo con enter automático
  const handleCodigoEscaneado = (codigo) => {
    verificarProducto(codigo);
  };

  // 🔹 Ingreso manual con "Enter"
  const handleCodigoManual = (e) => {
    if (e.key === "Enter" && !autenticacionPendiente) { // 🔹 Bloquear escaneo si hay autenticación pendiente
      verificarProducto(codigoManual.trim());
      setCodigoManual("");
    }
  };

  // 🔹 Auto enter para buscar el traspaso
  const handleCodigoPedidoKeyDown = (e) => {
    if (e.key === "Enter") {
      buscarPedido();
    }
  };

  // 🔹 Validar usuario y confirmar surtido
  const validarYConfirmarSurtido = async () => {
    if (!usuario || !password) {
      alert("Debe ingresar un usuario y una contraseña.");
      return;
    }

    try {
      const res = await fetch(
        `/api/data?type=validarUsuario&usuario=${usuario}&contrasena=${password}`,
        { method: "GET" }
      );

      if (!res.ok) {
        alert("Error al validar credenciales.");
        return;
      }

      const data = await res.json();

      if (!data.valid) {
        alert("Usuario o contraseña incorrectos.");
        return;
      }

      await confirmarSurtido();
    } catch (error) {
      console.error("Error durante la validación:", error);
      alert("Hubo un error al validar las credenciales.");
    }
  };

  // 🔹 Función para actualizar el estado del pedido
  const actualizarEstadoPedido = async (numeroPedido, nuevoEstado) => {
    try {
      const response = await fetch(`/api/actualizarEstadoPedido`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          numeroPedido: numeroPedido,
          nuevoEstado: nuevoEstado,
        }),
      });

      if (!response.ok) {
        throw new Error("Error al actualizar el estado del Traspaso");
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error al actualizar el estado del Traspaso:", error);
      throw error;
    }
  };

  // 🔹 Generar PDF con detalles del pedido
  const generarPDFDetallesPedido = async (numeroPedido, pedidoInfo) => {
    try {
      if (!pedidoInfo || !pedidoInfo.productos) {
        throw new Error("TraspasoInfo o productos no están definidos");
      }

      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage([600, 800]);

      // 🔹 Generar código de barras para el número de pedido
      const canvasPedido = document.createElement("canvas");
      JsBarcode(canvasPedido, numeroPedido, {
        format: "CODE128",
        displayValue: true,
        fontSize: 16,
        textMargin: 8,
      });

      // Convertir el código de barras a imagen
      const barcodeImage = canvasPedido.toDataURL("image/png");
      const barcodeEmbed = await pdfDoc.embedPng(barcodeImage);

      // 🔹 Agregar título y código de barras al PDF
      page.drawText("Detalles del Traspaso", { x: 50, y: 750, size: 18, color: rgb(0, 0, 0) });
      page.drawText(`Número de Traspaso: ${numeroPedido}`, { x: 50, y: 720, size: 10 });
      page.drawText(`Origen del Traspaso: ${pedidoInfo.Origen}`, { x: 60, y: 690, size: 10 });
      page.drawText(`Destino del Traspaso: ${pedidoInfo.Destino}`, { x: 70, y: 790, size: 10 });

      // Insertar código de barras en la parte superior
      page.drawImage(barcodeEmbed, {
        x: 370,
        y: 537,
        width: 200,
        height: 50,
      });

      let currentY = 643;
      const lineHeight = 20;

      // 🔹 Agregar encabezados de tabla
      page.drawRectangle({ x: 40, y: currentY, width: 520, height: 20, color: rgb(0.8, 0.8, 0.8) });
      page.drawText("Código", { x: 50, y: currentY + 5, size: 10, color: rgb(0, 0, 0) });
      page.drawText("Descripción", { x: 150, y: currentY + 5, size: 10, color: rgb(0, 0, 0) });
      page.drawText("Cantidad", { x: 500, y: currentY + 5, size: 10, color: rgb(0, 0, 0) });

      currentY -= lineHeight;
      let totalProductos = 0;

      // 🔹 Agregar productos al PDF
      for (const prod of pedidoInfo.productos) {
        const { CCODIGOPRODUCTO, CNOMBREPRODUCTO, Unidades } = prod;
        totalProductos += parseInt(Unidades, 10);

        page.drawRectangle({ x: 40, y: currentY - 5, width: 520, height: 20, color: rgb(0.95, 0.95, 0.95) });
        page.drawText(CCODIGOPRODUCTO, { x: 50, y: currentY, size: 10 });
        page.drawText(CNOMBREPRODUCTO, { x: 150, y: currentY, size: 10 });
        page.drawText(`${Unidades}`, { x: 520, y: currentY, size: 10 });

        currentY -= lineHeight;
      }

      currentY -= lineHeight;
      page.drawText(`Total Productos: ${totalProductos}`, { x: 50, y: currentY, size: 10 });

      // 🔹 Guardar y descargar PDF
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Detalles_Traspaso_${numeroPedido}.pdf`;
      link.click();
    } catch (error) {
      console.error("Error al generar el PDF de detalles:", error);
    }
  };

  // 🔹 Generar PDF con códigos de barras
  const generarPDFCodigosBarras = async (numeroPedido, pedidoInfo) => {
    try {
      if (!pedidoInfo || !pedidoInfo.productos) {
        throw new Error("pedidoInfo o productos no están definidos");
      }

      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage([600, 800]);

      let yPos = 650; // Posición inicial en la página
      const barWidth = 300;
      const barHeight = 80;
      const spaceY = 200; // Espaciado entre códigos

      page.drawText(`Códigos de Barras - Traspaso ${numeroPedido}`, { x: 50, y: 750, size: 16, color: rgb(0, 0, 0) });

      for (const prod of pedidoInfo.productos) {
        const { CCODIGOPRODUCTO, CNOMBREPRODUCTO, Unidades } = prod;

        const codigoBarras = `${CCODIGOPRODUCTO}-${Unidades}`;

        // Generar código de barras en un canvas
        const canvasProducto = document.createElement("canvas");
        JsBarcode(canvasProducto, codigoBarras, {
          format: "CODE128",
          displayValue: true,
          fontSize: 16,
          textMargin: 8,
        });

        // Convertir el código de barras a imagen y agregarlo al PDF
        const barcodeImage = canvasProducto.toDataURL("image/png");
        const barcodeEmbed = await pdfDoc.embedPng(barcodeImage);

        page.drawText(`Producto: ${CNOMBREPRODUCTO}`, { x: 50, y: yPos + 40, size: 12, color: rgb(0, 0, 0) });
        page.drawText(`Código: ${codigoBarras}`, { x: 50, y: yPos + 1, size: 12, color: rgb(0, 0, 0) });

        page.drawImage(barcodeEmbed, {
          x: 180,
          y: yPos - 60,
          width: barWidth,
          height: barHeight,
        });

        yPos -= spaceY;

        if (yPos < 100) {
          page = pdfDoc.addPage([600, 800]);
          yPos = 500;
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Codigos_Barras_Traspaso_${numeroPedido}.pdf`;
      link.click();
    } catch (error) {
      console.error("Error al generar el PDF de códigos de barras:", error);
    }
  };

  // 🔹 Confirmar surtido
  const confirmarSurtido = async () => {
    try {
      await generarPDFDetallesPedido(codigoPedido, pedidoInfo);
      await generarPDFCodigosBarras(codigoPedido, pedidoInfo);
      await actualizarEstadoPedido(codigoPedido, "En proceso");

      alert(`Traspaso surtido con éxito. Número de Traspaso: ${codigoPedido}`);
      setPedidoSurtido(true);

      // 🔹 Reiniciar el estado para escanear el siguiente traspaso
      setCodigoPedido("");
      setPedidoInfo(null);
      setProductosEscaneados({});
      setCodigoManual("");
      setUsuario("");
      setPassword("");
      setAutenticacionPendiente(false);
    } catch (error) {
      console.error("Error al confirmar el surtido:", error);
      alert("Hubo un error al confirmar el surtido.");
    }
  };

  return (
    <div>
      <Navbar />
      <div className={styles.panelContainer}>
        <h3>Panel de Surtir Traspaso</h3>

        {!pedidoInfo ? (
          <div>
            <h4>Ingresa o Escanea el Código del Traspaso</h4>
            <input
              type="text"
              placeholder="Código de Traspaso"
              value={codigoPedido}
              onChange={(e) => setCodigoPedido(e.target.value)}
              onKeyDown={handleCodigoPedidoKeyDown} // 🔹 Auto enter
            />
            <button onClick={buscarPedido} disabled={loading}>
              {loading ? "Buscando..." : "Buscar Traspaso"}
            </button>
          </div>
        ) : (
          <div>
            <h4>Pedido: {pedidoInfo.codigo}</h4>
            <ul>
              {pedidoInfo.productos.map((producto, index) => (
                <li key={index}>
                  {producto.CNOMBREPRODUCTO} - Cantidad: {producto.Unidades} - Escaneados:{" "}
                  {productosEscaneados[producto.CCODIGOPRODUCTO] || 0}
                </li>
              ))}
            </ul>

            {!pedidoSurtido && !autenticacionPendiente && ( // 🔹 Bloquear escaneo si hay autenticación pendiente
              <div>
                <h5>Escanea un producto o ingrésalo manualmente:</h5>
                <input
                  type="text"
                  placeholder="Ingrese código"
                  value={codigoManual}
                  onChange={(e) => setCodigoManual(e.target.value)}
                  onKeyDown={handleCodigoManual}
                  disabled={autenticacionPendiente} // 🔹 Deshabilitar input si hay autenticación pendiente
                />
              </div>
            )}

            {autenticacionPendiente && (
              <div>
                <h4>Ingrese sus credenciales para confirmar el Traspaso</h4>
                <input type="text" placeholder="Usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
                <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
                {mensajeError && <p className={styles.error}>{mensajeError}</p>}
                <button onClick={validarYConfirmarSurtido} disabled={loading}>
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