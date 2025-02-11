import React, { useState, useEffect } from "react";
import Navbar from "./navbar";
import { PDFDocument, rgb } from "pdf-lib";
import JsBarcode from "jsbarcode";
import styles from "./PedidoNuevo.module.css";

const PedidoNuevo = () => {
  const [step, setStep] = useState(1);
  const [almacenes, setAlmacenes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [formData, setFormData] = useState({
    TipoMovimiento: "",
    Origen: "",
    Destino: "",
    Producto: [],
    Usuario: "",
    Contraseña: "",
    NumeroPedido: "",
    Fecha_Creacion: new Date().toISOString().split("T")[0],
    Fecha_Compromiso: new Date(new Date().setDate(new Date().getDate() + 15))
      .toISOString()
      .split("T")[0],
  });
  const [newProducto, setNewProducto] = useState({
    ProductoID: "",
    Unidades: "",
  });

  // Cargar datos iniciales desde la API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [movRes, almRes, prodRes] = await Promise.all([
          fetch("/api/documentos-modelo"),
          fetch("/api/almacenes"),
          fetch("/api/Productos"),
        ]);

        if (!movRes.ok || !almRes.ok || !prodRes.ok)
          throw new Error("Error al cargar datos iniciales");

        const [movData, almData, prodData] = await Promise.all([
          movRes.json(),
          almRes.json(),
          prodRes.json(),
        ]);

        setMovimientos(movData);
        setAlmacenes(almData);
        setProductos(prodData);
      } catch (error) {
        console.error(error);
        alert("Error al cargar los datos iniciales.");
      }
    };

    fetchData();
  }, []);

  // Manejo de cambios en los formularios
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleProductoChange = (e) => {
    const { name, value } = e.target;
    setNewProducto({ ...newProducto, [name]: value });
  };

  const agregarProducto = () => {
    if (!newProducto.ProductoID || !newProducto.Unidades) {
      alert("Selecciona un producto y especifica las unidades.");
      return;
    }
  
    const productoSeleccionado = productos.find(
      (prod) => prod.CIDPRODUCTO === parseInt(newProducto.ProductoID)
    );
  
    if (!productoSeleccionado) {
      alert("Producto no encontrado.");
      return;
    }
  
    setFormData((prevState) => ({
      ...prevState,
      Producto: [
        ...prevState.Producto,
        { 
          ...newProducto, 
          NombreProducto: productoSeleccionado.CNOMBREPRODUCTO,
          CodigoProducto: productoSeleccionado.CCODIGOPRODUCTO // Añadir el código del producto
        },
      ],
    }));
    setNewProducto({ ProductoID: "", Unidades: "" });
  };

  
  // Validar usuario y registrar pedido
  const validarYRegistrarPedido = async () => {
    if (!formData.Usuario || !formData.Contraseña) {
      alert("Debe ingresar un usuario y una contraseña.");
      return;
    }

    try {
      const res = await fetch(
        `/api/data?type=validarUsuario&usuario=${formData.Usuario}&contrasena=${formData.Contraseña}`,
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

      await registrarPedido();
    } catch (error) {
      console.error("Error durante la validación:", error);
      alert("Hubo un error al validar las credenciales.");
    }
  };

  const registrarPedido = async () => {
    try {
      const res = await fetch("/api/insertar-movimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData), // Enviar todos los datos, incluidos los productos
      });
  
      if (!res.ok) {
        alert("Error al registrar el pedido.");
        return;
      }
  
      const data = await res.json();
  
      // Generar PDF tras registrar
      await generarPDF(data.NumeroPedido, formData);
      alert(`Pedido registrado con éxito. Número de Pedido: ${data.NumeroPedido}`);
  
      // Reiniciar el formulario y volver al paso 1
      setFormData({
        TipoMovimiento: "",
        Origen: "",
        Destino: "",
        Producto: [],
        Usuario: "",
        Contraseña: "",
        NumeroPedido: "",
        Fecha_Creacion: new Date().toISOString().split("T")[0],
        Fecha_Compromiso: new Date(new Date().setDate(new Date().getDate() + 15))
          .toISOString()
          .split("T")[0],
      });
  
      setStep(1);
    } catch (error) {
      console.error("Error al registrar el pedido:", error);
      alert("Hubo un error al registrar el pedido.");
    }
  };
  const generarPDF = async (numeroPedido, formData) => {
    try {
      if (!formData || !formData.Producto) {
        throw new Error("formData o Producto no están definidos");
      }
  
      const pdfDoc = await PDFDocument.create();
  
      // Página principal con detalles del pedido
      let page = pdfDoc.addPage([600, 800]);
      const { Producto, Fecha_Creacion, Fecha_Compromiso, Origen, Destino } = formData;
  
      // Encabezado del documento
      page.drawText(`Pedido Detallado`, {
        x: 50,
        y: 680,
        size: 18,
        color: rgb(0, 0, 0),
      });
  
      // Información del pedido
      page.drawText(`Fecha: ${Fecha_Creacion}`, { x: 50, y: 650, size: 10 });
      page.drawText(`Fecha de Entrega: ${Fecha_Compromiso}`, { x: 300, y: 650, size: 10 });
      page.drawText(`Origen: ${Origen}`, { x: 50, y: 630, size: 10 });
      page.drawText(`Destino: ${Destino}`, { x: 300, y: 630, size: 10 });
  
      // Tabla de productos
      const startY = 600;
      let currentY = startY;
      const lineHeight = 20;
  
      // Dibujar tabla: Encabezados
      page.drawRectangle({ x: 40, y: currentY, width: 520, height: 20, color: rgb(0.8, 0.8, 0.8) });
      page.drawText("Código", { x: 50, y: currentY + 5, size: 10, color: rgb(0, 0, 0) });
      page.drawText("Descripción", { x: 150, y: currentY + 5, size: 10, color: rgb(0, 0, 0) });
      page.drawText("Cantidad", { x: 500, y: currentY + 5, size: 10, color: rgb(0, 0, 0) });
  
      currentY -= lineHeight;
  
      let totalProductos = 0;
  
      for (const prod of Producto) {
        const { ProductoID, NombreProducto, Unidades, CodigoProducto } = prod;
        totalProductos += parseInt(Unidades, 10);
  
        // Dibujar fila
        page.drawRectangle({ x: 40, y: currentY - 5, width: 520, height: 20, color: rgb(0.95, 0.95, 0.95) });
        page.drawText(ProductoID, { x: 50, y: currentY, size: 10 });
        page.drawText(NombreProducto, { x: 150, y: currentY, size: 10 });
        page.drawText(`${Unidades}`, { x: 520, y: currentY, size: 10 });
  
        currentY -= lineHeight;
      }
  
      // Resumen del pedido
      currentY -= lineHeight;
      page.drawText(`Total Productos: ${totalProductos}`, { x: 50, y: currentY, size: 10 });
  
      // Generar código de barras del número de pedido
      const canvasPedido = document.createElement("canvas");
      JsBarcode(canvasPedido, numeroPedido, {
        format: "CODE128",
        displayValue: true,
        fontSize: 14,
        textMargin: 4,
      });
      const barcodePedidoImage = canvasPedido.toDataURL("image/png");
      const barcodePedidoEmbed = await pdfDoc.embedPng(barcodePedidoImage);
  
      // Agregar número de pedido y código de barras al pie
      currentY -= 60;
      page.drawText(`Número de Pedido: ${numeroPedido}`, { x: 50, y: currentY, size: 12, color: rgb(0, 0, 0) });
      page.drawImage(barcodePedidoEmbed, {
        x: 300,
        y: currentY - 30,
        width: 200,
        height: 60,
      });
  
      // Crear una hoja por cada producto con sus códigos de barras distribuidos
      for (const prod of Producto) {
        const { ProductoID, NombreProducto, Unidades, CodigoProducto } = prod;
  
        let barcodePage = pdfDoc.addPage([600, 800]);
        let xPos = 50;
        let yPos = 700;
        const barWidth = 200;
        const barHeight = 60;
        const spaceX = 250; // Espaciado horizontal entre códigos
        const spaceY = 100; // Espaciado vertical entre códigos
        let count = 0;
  
        barcodePage.drawText(`Producto: ${NombreProducto}`, { x: 50, y: 750, size: 14, color: rgb(0, 0, 0) });
        barcodePage.drawText(`Código: ${ProductoID}`, { x: 50, y: 730, size: 12, color: rgb(0, 0, 0) });
  
        for (let i = 0; i < Unidades; i++) {
          // Generar código de barras por unidad
          const canvasProducto = document.createElement("canvas");
          JsBarcode(canvasProducto, CodigoProducto, { // Usar CodigoProducto en lugar de ProductoID
            format: "CODE128",
            displayValue: true,
            fontSize: 14,
            textMargin: 4,
          });
          const barcodeProductoImage = canvasProducto.toDataURL("image/png");
          const barcodeProductoEmbed = await pdfDoc.embedPng(barcodeProductoImage);
  
          barcodePage.drawImage(barcodeProductoEmbed, {
            x: xPos,
            y: yPos,
            width: barWidth,
            height: barHeight,
          });
  
          xPos += spaceX; // Mover a la siguiente columna
          count++;
  
          if (count % 2 === 0) { // Cada dos códigos, bajar a la siguiente fila
            xPos = 50;
            yPos -= spaceY;
          }
  
          if (yPos < 100) { // Si se llena la página, agregar una nueva
            barcodePage = pdfDoc.addPage([600, 800]);
            xPos = 50;
            yPos = 700;
            count = 0;
          }
        }
      }
  
      // Descargar el PDF
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Pedido_${numeroPedido}.pdf`;
      link.click();
    } catch (error) {
      console.error("Error al generar el PDF:", error);
    }
  };
  

  const avanzarPaso = () => setStep((prev) => prev + 1);
  const retrocederPaso = () => setStep((prev) => prev - 1);

  return (
    <div>
      <Navbar />
      <div className={styles.formContainer}>
        <h3>Registrar Nuevo Pedido</h3>
        {/* Renders por pasos*/}
        {step === 1 && (
          <div>
            <h4>Paso 1: Seleccionar Tipo de Movimiento</h4>
            <select name="TipoMovimiento" value={formData.TipoMovimiento} onChange={handleChange}>
              <option value="">Seleccione un movimiento</option>
              {movimientos.map((mov) => (
                <option key={mov.CIDDOCUMENTODE} value={mov.CIDDOCUMENTODE}>
                  {mov.CDESCRIPCION}
                </option>
              ))}
            </select>
            <button onClick={avanzarPaso}>Siguiente</button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h4>Paso 2: Seleccionar Almacén de Origen y Destino</h4>
            <select name="Origen" value={formData.Origen} onChange={handleChange}>
              <option value="">Seleccione un almacén</option>
              {almacenes.map((almacen) => (
                <option key={almacen.CIDALMACEN} value={almacen.CIDALMACEN}>
                  {almacen.CNOMBREALMACEN}
                </option>
              ))}
            </select>

            <select name="Destino" value={formData.Destino} onChange={handleChange}>
              <option value="">Seleccione un almacén</option>
              {almacenes.map((almacen) => (
                <option key={almacen.CIDALMACEN} value={almacen.CIDALMACEN}>
                  {almacen.CNOMBREALMACEN}
                </option>
              ))}
            </select>

            <button onClick={retrocederPaso}>Retroceder</button>
            <button onClick={avanzarPaso}>Siguiente</button>
          </div>
        )}

        {step === 3 && (
          <div>
            <h4>Paso 3: Seleccionar Productos</h4>
            <select name="ProductoID" value={newProducto.ProductoID} onChange={handleProductoChange}>
              <option value="">Seleccione un producto</option>
              {productos.map((producto) => (
                <option key={producto.CIDPRODUCTO} value={producto.CIDPRODUCTO}>
                  {producto.CNOMBREPRODUCTO}
                </option>
              ))}
            </select>
            <input
              type="number"
              name="Unidades"
              value={newProducto.Unidades}
              onChange={handleProductoChange}
              placeholder="Unidades"
            />
            <button onClick={agregarProducto}>Agregar Producto</button>

            <h5>Productos seleccionados:</h5>
            <ul>
              {formData.Producto.map((prod, index) => (
                <li key={index}>
                  {prod.NombreProducto} - {prod.Unidades} unidades
                </li>
              ))}
            </ul>

            <button onClick={retrocederPaso}>Retroceder</button>
            <button onClick={avanzarPaso}>Siguiente</button>
          </div>
        )}

        {step === 4 && (
          <div>
            <h4>Resumen del Pedido</h4>
            <p>Tipo de Movimiento: {formData.TipoMovimiento}</p>
            <p>Origen: {formData.Origen}</p>
            <p>Destino: {formData.Destino}</p>
            <h5>Productos:</h5>
            <ul>
              {formData.Producto.map((prod, index) => (
                <li key={index}>
                  {prod.NombreProducto} - {prod.Unidades} unidades
                </li>
              ))}
            </ul>

            <h5>Ingrese sus credenciales para confirmar:</h5>
            <input
              type="text"
              name="Usuario"
              value={formData.Usuario}
              onChange={handleChange}
              placeholder="Usuario"
            />
            <input
              type="password"
              name="Contraseña"
              value={formData.Contraseña}
              onChange={handleChange}
              placeholder="Contraseña"
            />
            <button onClick={retrocederPaso}>Retroceder</button>
            <button onClick={validarYRegistrarPedido}>Finalizar Pedido</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PedidoNuevo;
