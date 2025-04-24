import { useEffect, useState } from "react";
import Navbar from "./navbar";
import styles from './reporteTraspasos.module.css';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const ReporteTraspasos = () => {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [numeroPedidoBusqueda, setNumeroPedidoBusqueda] = useState("");
  const [detallePedido, setDetallePedido] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [mostrarInputFecha, setMostrarInputFecha] = useState(false);
  const [mostrarInputNumero, setMostrarInputNumero] = useState(false);

  const toggleInputFecha = () => {
    setMostrarInputFecha(!mostrarInputFecha);
    setMostrarInputNumero(false);
    setPedidos([]);
    setError(null);
  };

  const toggleInputNumero = () => {
    setMostrarInputNumero(!mostrarInputNumero);
    setMostrarInputFecha(false);
    setPedidos([]);
    setError(null);
  };

  const fetchPedidos = async () => {
    if (!fechaInicio || !fechaFin) {
      setError("Por favor selecciona ambas fechas.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/rPedidos?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`
      );
      if (!response.ok) {
        throw new Error("Error al obtener los pedidos");
      }
      const data = await response.json();
      setPedidos(data.pedidos);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const buscarPorNumeroPedido = async () => {
    if (!numeroPedidoBusqueda) {
      setError("Por favor ingresa un número de pedido");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/detallePedido?numeroPedido=${numeroPedidoBusqueda}`);
      if (!response.ok) {
        throw new Error("Error al obtener el pedido");
      }
      const data = await response.json();
      
      const pedidoFormateado = {
        NumeroPedido: data.NumeroPedido,
        Origen: data.Origen,
        Destino: data.Destino,
        Estatus: data.Estatus,
        Observaciones: data.Observaciones || ""
      };
      
      setPedidos([pedidoFormateado]);
      setDetallePedido(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetallePedido = async (numeroPedido) => {
    try {
      const response = await fetch(`/api/detallePedido?numeroPedido=${numeroPedido}`);
      if (!response.ok) {
        throw new Error("Error al obtener los detalles del pedido");
      }
      const data = await response.json();
      setDetallePedido(data);
      setModalVisible(true);
    } catch (err) {
      console.error(err);
      alert("Error al obtener los detalles del pedido");
    }
  };

  const cerrarModal = () => {
    setModalVisible(false);
    setDetallePedido(null);
  };

  const descargarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Detalles del Traspaso", 14, 20);

    doc.setFontSize(12);
    doc.text(`Origen: ${detallePedido.Origen}`, 14, 30);
    doc.text(`Destino: ${detallePedido.Destino}`, 14, 40);
    doc.text(`Estatus: ${detallePedido.Estatus}`, 14, 50);

    autoTable(doc, {
      startY: 60,
      head: [["Producto", "Código", "Cantidad"]],
      body: detallePedido.Productos.map((producto) => [
        producto.CNOMBREPRODUCTO,
        producto.CCODIGOPRODUCTO,
        producto.CantidadPedido,
      ]),
    });

    doc.save(`Traspaso_${detallePedido.NumeroPedido}.pdf`);
  };

  const descargarExcel = () => {
    const worksheetData = [
      ["Detalles del Traspaso"],
      ["Origen", detallePedido.Origen],
      ["Destino", detallePedido.Destino],
      ["Estatus", detallePedido.Estatus],
      [],
      ["Producto", "Código", "Cantidad"],
      ...detallePedido.Productos.map((producto) => [
        producto.CNOMBREPRODUCTO,
        producto.CCODIGOPRODUCTO,
        producto.CantidadPedido,
      ]),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Traspaso");

    XLSX.writeFile(workbook, `Traspaso_${detallePedido.NumeroPedido}.xlsx`);
  };

  const generarReporteGeneral = async () => {
    try {
      const response = await fetch(`/api/detalleTraspasos?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`);
      if (!response.ok) {
        throw new Error("Error al obtener los detalles de los traspasos");
      }
  
      const pedidosConProductos = await response.json();
  
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("Reporte General de Traspasos", 14, 20);
  
      let y = 30;
  
      pedidosConProductos.forEach((pedido, index) => {
        if (index > 0) {
          y += 10;
        }
  
        doc.setFontSize(14);
        doc.text(`Pedido: ${pedido.NumeroPedido}`, 14, y);
        y += 10;
  
        doc.setFontSize(12);
        doc.text(`Origen: ${pedido.Origen}`, 14, y);
        y += 10;
        doc.text(`Destino: ${pedido.Destino}`, 14, y);
        y += 10;
        doc.text(`Estatus: ${pedido.Estatus}`, 14, y);
        y += 10;
  
        if (pedido.Productos && pedido.Productos.length > 0) {
          autoTable(doc, {
            startY: y,
            head: [["Producto", "Código", "Cantidad"]],
            body: pedido.Productos.map((producto) => [
              producto.CNOMBREPRODUCTO,
              producto.CCODIGOPRODUCTO,
              producto.CantidadPedido,
            ]),
          });
  
          y = doc.lastAutoTable.finalY + 20;
        } else {
          doc.text("No hay productos asociados a este pedido.", 14, y);
          y += 10;
        }
      });
  
      doc.save("Reporte_General_Traspasos.pdf");
    } catch (error) {
      console.error("Error al generar el reporte general:", error);
      alert("Error al generar el reporte general. Por favor, verifica la consola para más detalles.");
    }
  };

  return (
    <div>
      <Navbar />
      <div className={styles.container}>
        <h1 className={styles.title}>Reporte de Traspasos</h1>

        {/* Contenedor de botones de búsqueda */}
        <div className={styles.filterContainer}>
          <button 
            onClick={toggleInputFecha} 
            className={styles.button}
            style={{ marginRight: '10px' }}
          >
            {mostrarInputFecha ? 'Cancelar' : 'Buscar por Fecha'}
          </button>
          
          <button 
            onClick={toggleInputNumero} 
            className={styles.button}
          >
            {mostrarInputNumero ? 'Cancelar' : 'Buscar por Número'}
          </button>
        </div>

        {/* Inputs de búsqueda (ocultos inicialmente) */}
        {mostrarInputFecha && (
          <div className={styles.filterContainer}>
            <label>
              Fecha Inicio:
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className={styles.input}
              />
            </label>
            <label>
              Fecha Fin:
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className={styles.input}
              />
            </label>
            <button onClick={fetchPedidos} className={styles.button}>
              Buscar
            </button>
          </div>
        )}

        {mostrarInputNumero && (
          <div className={styles.filterContainer}>
            <label>
              Número de Pedido:
              <input
                type="text"
                value={numeroPedidoBusqueda}
                onChange={(e) => setNumeroPedidoBusqueda(e.target.value)}
                className={styles.input}
                placeholder="Ingrese número de pedido"
              />
            </label>
            <button onClick={buscarPorNumeroPedido} className={styles.button}>
              Buscar
            </button>
          </div>
        )}

        {/* Botón para generar reporte general */}
        {pedidos.length > 0 && mostrarInputFecha && (
          <div className={styles.reportButtonContainer}>
            <button onClick={generarReporteGeneral} className={styles.reportButton}>
              Generar Reporte General
            </button>
          </div>
        )}

        {/* Mostrar resultados */}
        {loading ? (
          <p>Cargando pedidos...</p>
        ) : error ? (
          <p className={styles.errorMessage}>{error}</p>
        ) : pedidos.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Número de Pedido</th>
                <th>Origen</th>
                <th>Destino</th>
                <th>Estatus</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((pedido) => (
                <tr 
                  key={pedido.NumeroPedido} 
                  onClick={() => fetchDetallePedido(pedido.NumeroPedido)} 
                  style={{ cursor: "pointer" }}
                >
                  <td>{pedido.NumeroPedido}</td>
                  <td>{pedido.Origen}</td>
                  <td>{pedido.Destino}</td>
                  <td>{pedido.Estatus}</td>
                  <td>{pedido.Observaciones || "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.noResults}>
            {mostrarInputFecha || mostrarInputNumero 
              ? "No se encontraron pedidos. Realice una búsqueda." 
              : "Seleccione un método de búsqueda."}
          </p>
        )}
      </div>

      {/* Modal para mostrar detalles del pedido */}
      {modalVisible && detallePedido && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Detalles del Traspaso</h2>
            <p><strong>Origen:</strong> {detallePedido.Origen}</p>
            <p><strong>Destino:</strong> {detallePedido.Destino}</p>
            <p><strong>Estatus:</strong> {detallePedido.Estatus}</p>
            <p><strong>Productos:</strong></p>
            <ul>
              {detallePedido.Productos.map((producto, index) => (
                <li key={index}>
                  {producto.CNOMBREPRODUCTO} (Código: {producto.CCODIGOPRODUCTO}) - Cantidad: {producto.CantidadPedido}
                </li>
              ))}
            </ul>
            <div className={styles.buttonContainer}>
              <button onClick={descargarPDF} className={styles.downloadButton}>
                Descargar PDF
              </button>
              <button onClick={descargarExcel} className={styles.downloadButton}>
                Descargar Excel
              </button>
              <button onClick={cerrarModal} className={styles.closeButton}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReporteTraspasos;