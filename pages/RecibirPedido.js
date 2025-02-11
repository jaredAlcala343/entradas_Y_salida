import React, { useState } from 'react';
import { QrReader } from 'react-qr-reader';
import jsPDF from 'jspdf'; // Importar jsPDF
import 'jspdf-autotable';
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

  const buscarPedido = async () => {
    try {
      const response = await fetch(`/api/recibirPedido?pedidoId=${pedidoId}`);
      const data = await response.json();

      if (response.ok) {
        setPedidoInfo(data);
        setProductoIndex(0);
        setCodigoEscaneado([]);
        setPedidoTerminado(false);
      } else {
        alert(data.message || 'Pedido no encontrado');
        setPedidoInfo(null);
      }
    } catch (err) {
      alert('Error al buscar el pedido');
      console.error(err);
    }
  };

  const escanearProducto = (codigo) => {
    const productoActual = pedidoInfo.productos[productoIndex];
    if (codigo === productoActual.codigo) {
      setCodigoEscaneado((prev) => [...prev, codigo]);

      if (codigoEscaneado.length + 1 === productoActual.cantidad) {
        if (productoIndex + 1 < pedidoInfo.productos.length) {
          setProductoIndex(productoIndex + 1);
          setCodigoEscaneado([]);
        } else {
          setPedidoTerminado(true);
        }
      }
    } else {
      alert('Código incorrecto, intenta nuevamente.');
    }
  };

  const generarComprobantePDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text('Comprobante de Pedido Recibido', 20, 20);

    doc.setFontSize(12);
    doc.text(`Pedido ID: ${pedidoInfo.id}`, 20, 40);
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

    doc.save(`Comprobante_Pedido_${pedidoInfo.id}.pdf`);
  };

  const confirmarTerminarPedido = () => {
    if (usuario && password) {
      alert('Pedido terminado con éxito.');
      generarComprobantePDF(); // Generar el PDF al confirmar
      setPedidoInfo(null);
      setPedidoId('');
      setUsuario('');
      setPassword('');
      setPedidoTerminado(false);
    } else {
      alert('Por favor ingresa usuario y contraseña');
    }
  };

  return (
    <div>
      <Navbar />
      <div className={styles.panelContainer}>
        <h3>Recibir Pedido</h3> {/* Aquí cambiamos el título */}

        {!pedidoInfo ? (
          <div>
            <h4>Escanea el QR o Ingresa el Número del Pedido</h4>
            <QrReader
              onResult={(result, error) => {
                if (result) {
                  setPedidoId(result.text);
                  buscarPedido();
                } else if (error) {
                  console.error(error);
                }
              }}
              style={{ width: '100%' }}
            />
            <div className={styles.inputContainer}>
              <input
                type="text"
                placeholder="Ingresa el número de pedido"
                value={pedidoId}
                onChange={(e) => setPedidoId(e.target.value)}
              />
              <button onClick={buscarPedido}>Buscar Pedido</button>
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

            {!pedidoTerminado && (
              <div>
                <h5>Escanea el código de barras para: {pedidoInfo.productos[productoIndex].nombre}</h5>
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
                <p>
                  Productos escaneados: {codigoEscaneado.length} de{' '}
                  {pedidoInfo.productos[productoIndex].cantidad}
                </p>
              </div>
            )}

            {pedidoTerminado && (
              <div>
                <h5>Terminar Pedido</h5>
                <div>
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
                  <button onClick={confirmarTerminarPedido}>Confirmar</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecibirPedido;
