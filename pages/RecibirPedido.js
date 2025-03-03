import React, { useState } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import styles from './PanelPedido.module.css';
import Navbar from './navbar';

const RecibirPedido = () => {
  const [pedidoId, setPedidoId] = useState('');
  const [pedidoInfo, setPedidoInfo] = useState(null);
  const [productoIndex, setProductoIndex] = useState(0);
  const [codigoEscaneado, setCodigoEscaneado] = useState([]);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [pedidoTerminado, setPedidoTerminado] = useState(false);
  const [mostrarFormularioValidacion, setMostrarFormularioValidacion] = useState(false);
  const [loading, setLoading] = useState(false);

  // 🔹 Buscar pedido en la base de datos
  const buscarPedido = async () => {
    if (!pedidoId.trim()) {
      alert("⚠️ Ingresa un código de Traspaso válido.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/recibirPedido?pedidoId=${pedidoId}`);
      const data = await response.json();

      if (response.ok) {
        setPedidoInfo({
          id: data.numeroPedido,
          origen: data.origen,
          destino: data.destino,
          productos: data.productos,
        });
       console.log(data);
        setProductoIndex(0);
        setCodigoEscaneado([]);
        setPedidoTerminado(false);
        setMostrarFormularioValidacion(false);
      } else {
        alert(data.message || 'Pedido no encontrado');
        setPedidoInfo(null);
      }
    } catch (err) {
      alert('Error al buscar el pedido');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePedidoIdKeyDown = (e) => {
    if (e.key === 'Enter') {
      buscarPedido();
    }
  };

  const escanearProducto = (codigo) => {
    if (!pedidoInfo || !pedidoInfo.productos || productoIndex >= pedidoInfo.productos.length) {
      alert('No hay productos para escanear');
      return;
    }

    const productoActual = pedidoInfo.productos[productoIndex];

    const codigoBase = codigo.includes('-')
      ? codigo.substring(0, codigo.lastIndexOf('-'))
      : codigo;

    if (codigoBase === productoActual.codigo) {
      setCodigoEscaneado((prev) => [...prev, codigo]);

      if (codigoEscaneado.length + 1 === pedidoInfo.productos.length) {
        setMostrarFormularioValidacion(true);
      } else {
        setProductoIndex(productoIndex + 1);
      }
    } else {
      alert('Código incorrecto, intenta nuevamente.');
    }
  };

  const generarComprobantePDF = () => {
    if (!pedidoInfo) return;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Comprobante de Traspaso Recibido', 20, 20);
    doc.setFontSize(12);
    doc.text(`Identificador del Traspaso: ${pedidoInfo.id}`, 20, 40);
    doc.text(`Origen: ${pedidoInfo.origen}`, 20, 50);
    doc.text(`Destino: ${pedidoInfo.destino}`, 20, 60);
    doc.text(`Confirmado por: ${usuario}`, 20, 70);

    const productos = pedidoInfo.productos.map((producto, index) => [
      index + 1,
      producto.nombre,
      producto.cantidad,
      producto.codigo,
    ]);

    doc.autoTable({
      head: [['#', 'Producto', 'Cantidad', 'Código']],
      body: productos,
      startY: 80,
    });

    doc.save(`Comprobante_Traspaso_${pedidoInfo.id}.pdf`);
  };

  const generarCodigosBarrasPDF = () => {
    if (!pedidoInfo) return;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Códigos de Barras de Productos', 20, 20);

    let yPos = 40;

    pedidoInfo.productos.forEach((producto) => {
      const codigoBase = producto.codigo.includes('-')
        ? producto.codigo.substring(0, producto.codigo.lastIndexOf('-'))
        : producto.codigo;

      for (let i = 0; i < producto.cantidad; i++) {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, codigoBase, { format: 'CODE128' });
        const imgData = canvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 20, yPos, 100, 30);
        yPos += 40;
        if (yPos > 260) {
          doc.addPage();
          yPos = 40;
        }
      }
    });

    doc.save(`Codigos_Barras_Traspaso_${pedidoInfo.id}.pdf`);
  };

  const confirmarTerminarPedido = async () => {
    if (!usuario || !password) {
      alert('Por favor ingresa usuario y contraseña');
      return;
    }
  
    try {
      // Completar el pedido
      const response = await fetch('/api/completarPedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroPedido: pedidoId, usuario, password }),
      });
  
      const data = await response.json();
  
      if (response.ok) {
        alert('Traspaso Completado con Éxito.');
        generarComprobantePDF();
        generarCodigosBarrasPDF();
  
        // 🔹 Asegurar que `pedidoInfo.destino` se envía correctamente
        if (pedidoInfo && pedidoInfo.destino) {
          const updateResponse = await fetch('/api/Almacen_destino', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numeroPedido: pedidoId, destino: pedidoInfo.destino }),
          });
  
          const updateData = await updateResponse.json();
  
          if (updateResponse.ok) {
            alert('Almacén actualizado correctamente.');
          } else {
            alert(updateData.message || 'Error al actualizar el almacén');
          }
        } else {
          alert('Error: No se encontró el destino del pedido.');
        }
  
        // Limpiar el estado
        setPedidoInfo(null);
        setPedidoId('');
        setUsuario('');
        setPassword('');
        setPedidoTerminado(false);
        setMostrarFormularioValidacion(false);
      } else {
        alert(data.message || 'Error al actualizar el Traspaso');
      }
    } catch (error) {
      alert('Error al completar el Traspaso');
      console.error(error);
    }
  };
  

  return (
    <div>
      <Navbar />
      <div className={styles.panelContainer}>
        <h3>Recibir Traspaso</h3>

        {!pedidoInfo ? (
          <div>
            <h4>Escanea código del Traspaso</h4>
            <div className={styles.inputContainer}>
              <input
                type="text"
                placeholder="Ingresa el número de Traspaso"
                value={pedidoId}
                onChange={(e) => setPedidoId(e.target.value)}
                onKeyDown={handlePedidoIdKeyDown}
              />
              <button onClick={buscarPedido} disabled={loading}>
                {loading ? "Buscando..." : "Buscar Traspaso"}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h4>Pedido ID: {pedidoInfo.id}</h4>
            <p>Origen: {pedidoInfo.origen}</p>
            <p>Destino: {pedidoInfo.destino}</p>
            <h5>Productos:</h5>
            <ul>
              {pedidoInfo.productos.map((producto, index) => (
                <li key={index}>
                  {producto.nombre} - Cantidad: {producto.cantidad}
                </li>
              ))}
            </ul>

            {!mostrarFormularioValidacion && (
              <div>
                {pedidoInfo.productos[productoIndex] ? (
                  <h5>Escanea el código de barras para: {pedidoInfo.productos[productoIndex].nombre}</h5>
                ) : (
                  <h5>No hay productos para escanear</h5>
                )}
                <input
                  type="text"
                  placeholder="Escanear producto"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      escanearProducto(e.target.value);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            )}

            {mostrarFormularioValidacion && (
              <div>
                <h4>Confirmar Recepción del Traspaso</h4>
                <input
                  type="text"
                  placeholder="Usuario"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button onClick={confirmarTerminarPedido}>Finalizar Traspaso</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecibirPedido;