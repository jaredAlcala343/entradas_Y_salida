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
  const [mostrarModalDevolucion, setMostrarModalDevolucion] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [motivoDevolucion, setMotivoDevolucion] = useState('');
  const [cantidadDevolucion, setCantidadDevolucion] = useState(0);
  const [usuarioDevolucion, setUsuarioDevolucion] = useState('');
  const [passwordDevolucion, setPasswordDevolucion] = useState('');
  const [mensajeError, setMensajeError] = useState('');

  const buscarPedido = async () => {
    if (!pedidoId.trim()) {
      alert('⚠️ Ingresa un código de Traspaso válido.');
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
          productos: data.productos.map(p => ({
            ...p,
            id: Number(p.id),
            cantidadRecibida: 0
          })),
        });
        setProductoIndex(0);
        setCodigoEscaneado([]);
        setPedidoTerminado(false);
        setMostrarFormularioValidacion(false);
        setMensajeError('');
      } else {
        alert(data.message || 'Traspaso no encontrado');
        setPedidoInfo(null);
      }
    } catch (err) {
      alert('Error al buscar el Traspaso');
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
    if (!pedidoInfo?.productos || productoIndex >= pedidoInfo.productos.length) {
      alert('No hay productos para escanear');
      return;
    }

    const productoActual = pedidoInfo.productos[productoIndex];
    const [codigoBase, cantidadEscaneada] = codigo.includes('-') 
      ? [codigo.substring(0, codigo.lastIndexOf('-')), parseInt(codigo.split('-').pop()) || 1]
      : [codigo, 1];

    if (codigoBase === productoActual.codigo) {
      const nuevosEscaneos = Array(cantidadEscaneada).fill(codigoBase);
      setCodigoEscaneado(prev => [...prev, ...nuevosEscaneos]);
      
      const nuevosProductos = [...pedidoInfo.productos];
      nuevosProductos[productoIndex].cantidadRecibida = 
        (nuevosProductos[productoIndex].cantidadRecibida || 0) + cantidadEscaneada;
      setPedidoInfo({...pedidoInfo, productos: nuevosProductos});

      if (nuevosProductos[productoIndex].cantidadRecibida >= productoActual.cantidad) {
        if (verificarEscaneoCompleto()) {
          alert('✅ Todos los productos han sido escaneados. Ahora puedes confirmar el traspaso.');
        } else {
          setProductoIndex(productoIndex + 1);
        }
      }
    } else {
      alert(`❌ Código incorrecto. Esperado: ${productoActual.codigo}, Recibido: ${codigoBase}`);
    }
  };

  const verificarEscaneoCompleto = () => {
    return pedidoInfo?.productos?.every(producto => {
      return (producto.cantidadRecibida || 0) >= producto.cantidad;
    });
  };

  const abrirModalDevolucion = (producto) => {
    if (!producto?.id) {
      alert('El producto no tiene ID definido');
      return;
    }
    setProductoSeleccionado({
      ...producto,
      id: Number(producto.id)
    });
    setCantidadDevolucion(producto.cantidad - (producto.cantidadRecibida || 0));
    setUsuarioDevolucion('');
    setPasswordDevolucion('');
    setMostrarModalDevolucion(true);
    setMensajeError('');
  };

  const validarUsuarioAutorizado = async (usuario, password) => {
    if (!usuario || !password) {
      throw new Error("Debe ingresar usuario y contraseña");
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

      if (!['Admin', 'Supervisor'].includes(data.rol)) {
        throw new Error("Usuario no tiene permisos suficientes");
      }

      return true;
    } catch (error) {
      throw error;
    }
  };

  const confirmarDevolucion = async () => {
    try {
      if (!pedidoId || !productoSeleccionado?.id || cantidadDevolucion <= 0 || !usuarioDevolucion || !passwordDevolucion) {
        throw new Error(`Datos incompletos:
          - Traspaso: ${pedidoId || 'Falta'}
          - Producto ID: ${productoSeleccionado?.id || 'Falta ID'}
          - Cantidad: ${cantidadDevolucion > 0 ? 'OK' : 'Debe ser > 0'}
          - Usuario: ${usuarioDevolucion || 'Falta'}
          - Contraseña: ${passwordDevolucion ? 'OK' : 'Falta'}`);
      }

      await validarUsuarioAutorizado(usuarioDevolucion, passwordDevolucion);

      const productoIdNumerico = Number(productoSeleccionado.id);
      if (isNaN(productoIdNumerico)) {
        throw new Error('El ID del producto no es válido');
      }

      const response = await fetch('/api/devoluciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numeroPedido: pedidoId,
          productoId: productoIdNumerico,
          cantidadDevolucion: Number(cantidadDevolucion),
          motivo: motivoDevolucion,
          usuarioAutorizacion: usuarioDevolucion,
          fecha: new Date().toISOString()
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error en la respuesta del servidor');
      }

      alert(`✅ Devolución registrada: ${cantidadDevolucion} unidades de ${productoSeleccionado.nombre}`);
      
      const nuevosProductos = [...pedidoInfo.productos];
      const productoIndex = nuevosProductos.findIndex(p => p.id === productoSeleccionado.id);
      nuevosProductos[productoIndex].cantidadRecibida += cantidadDevolucion;
      setPedidoInfo({...pedidoInfo, productos: nuevosProductos});

      setMostrarModalDevolucion(false);
      setMotivoDevolucion('');
      setCantidadDevolucion(0);
      setUsuarioDevolucion('');
      setPasswordDevolucion('');
      setMensajeError('');
    } catch (error) {
      setMensajeError(error.message);
      console.error('Error al registrar devolución:', error);
    }
  };

  const cerrarModalDevolucion = () => {
    setMostrarModalDevolucion(false);
    setMotivoDevolucion('');
    setCantidadDevolucion(0);
    setUsuarioDevolucion('');
    setPasswordDevolucion('');
    setMensajeError('');
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
    doc.text(`Fecha: ${new Date().toLocaleString()}`, 20, 80);

    const productos = pedidoInfo.productos.map((producto, index) => [
      index + 1,
      producto.nombre,
      producto.cantidad,
      producto.cantidadRecibida || 0,
      producto.codigo,
    ]);

    doc.autoTable({
      head: [['#', 'Producto', 'Solicitado', 'Recibido', 'Código']],
      body: productos,
      startY: 90,
    });

    doc.save(`Comprobante_Traspaso_${pedidoInfo.id}.pdf`);
  };

  const generarCodigosBarrasPDF = () => {
    if (!pedidoInfo) return;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Códigos de Barras de Productos', 20, 20);
    doc.setFontSize(10);
    doc.text(`Traspaso: ${pedidoInfo.id} - ${new Date().toLocaleDateString()}`, 20, 30);

    let yPos = 40;

    pedidoInfo.productos.forEach((producto) => {
      const codigoBase = producto.codigo.includes('-')
        ? producto.codigo.substring(0, producto.codigo.lastIndexOf('-'))
        : producto.codigo;

      for (let i = 0; i < producto.cantidad; i++) {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, codigoBase, { 
          format: 'CODE128',
          displayValue: true,
          fontSize: 12
        });
        const imgData = canvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 20, yPos, 100, 30);
        doc.text(`${producto.nombre} (${codigoBase})`, 20, yPos + 35);
        yPos += 50;
        
        if (yPos > 260) {
          doc.addPage();
          yPos = 20;
        }
      }
    });

    doc.save(`Codigos_Barras_Traspaso_${pedidoInfo.id}.pdf`);
  };

  const confirmarTerminarPedido = async () => {
    try {
      await validarUsuarioAutorizado(usuario, password);

      const response = await fetch('/api/completarPedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroPedido: pedidoId, usuario, password }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('✅ Traspaso Completado con Éxito.');
        generarComprobantePDF();
        generarCodigosBarrasPDF();

        if (pedidoInfo && pedidoInfo.destino) {
          const updateResponse = await fetch('/api/Almacen_destino', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numeroPedido: pedidoId, destino: pedidoInfo.destino }),
          });

          if (!updateResponse.ok) {
            const updateData = await updateResponse.json();
            alert(updateData.message || '⚠️ Error al actualizar el almacén');
          }
        }

        setPedidoInfo(null);
        setPedidoId('');
        setUsuario('');
        setPassword('');
        setPedidoTerminado(false);
        setMostrarFormularioValidacion(false);
        setMensajeError('');
      } else {
        throw new Error(data.message || '❌ Error al actualizar el Traspaso');
      }
    } catch (error) {
      setMensajeError(error.message);
      console.error(error);
    }
  };

  return (
    <div>
      <Navbar />
      <div className={styles.panelContainer}>
        <h3>Recibir Traspaso</h3>
        
        {mensajeError && (
          <div className={styles.errorMessage}>
            {mensajeError}
          </div>
        )}

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
                autoFocus
              />
              <button onClick={buscarPedido} disabled={loading}>
                {loading ? 'Buscando...' : 'Buscar Traspaso'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className={styles.pedidoHeader}>
              <h4>Traspaso Numero: {pedidoInfo.id}</h4>
              <p><strong>Origen:</strong> {pedidoInfo.origen}</p>
              <p><strong>Destino:</strong> {pedidoInfo.destino}</p>
              <p><strong>Estado:</strong> {verificarEscaneoCompleto() ? '✅ Listo para confirmar' : '🔄 En progreso'}</p>
            </div>
            
            <div className={styles.productosContainer}>
              <h5>Productos:</h5>
              <table className={styles.productosTable}>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Código</th>
                    <th>Solicitado</th>
                    <th>Recibido</th>
                    <th>Faltante</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidoInfo.productos.map((producto, index) => {
                    const faltante = Math.max(0, producto.cantidad - (producto.cantidadRecibida || 0));
                    return (
                      <tr key={index} className={faltante <= 0 ? styles.completo : ''}>
                        <td>{producto.nombre}</td>
                        <td>{producto.codigo}</td>
                        <td>{producto.cantidad}</td>
                        <td>{producto.cantidadRecibida || 0}</td>
                        <td>{faltante}</td>
                        <td>
                          <button 
                            onClick={() => abrirModalDevolucion(producto)}
                            disabled={faltante <= 0}
                            className={styles.botonDevolucion}
                          >
                            Devolución
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.scanSection}>
              <h5>Escaneo de productos</h5>
              <p>Producto actual: <strong>
                {pedidoInfo.productos[productoIndex]?.nombre || '✅ Todos los productos escaneados'}
              </strong></p>
              <p>Formato aceptado: <code>CÓDIGO-CANTIDAD</code> (ej: {pedidoInfo.productos[productoIndex]?.codigo || 'CODIGO'}-3)</p>
              <input
                type="text"
                placeholder="Escanea el código de barras"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    escanearProducto(e.target.value.trim());
                    e.target.value = '';
                  }
                }}
                autoFocus
                className={styles.scanInput}
              />
            </div>

            {verificarEscaneoCompleto() && (
              <div className={styles.confirmacionSection}>
                <h4>Confirmar Recepción Completa</h4>
                <div className={styles.formGroup}>
                  <label>Usuario:</label>
                  <input
                    type="text"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    placeholder="Tu usuario"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Contraseña:</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Tu contraseña"
                  />
                </div>
                <button 
                  onClick={confirmarTerminarPedido}
                  className={styles.botonConfirmar}
                >
                  Confirmar Traspaso
                </button>
              </div>
            )}

            {mostrarModalDevolucion && (
              <div className={styles.modalOverlay}>
                <div className={styles.modal}>
                  <h4>Registrar Devolución</h4>
                  <div className={styles.modalBody}>
                    <p><strong>Producto:</strong> {productoSeleccionado?.nombre}</p>
                    <p><strong>Código:</strong> {productoSeleccionado?.codigo}</p>
                    <p><strong>Disponible para devolución:</strong> {productoSeleccionado?.cantidad - (productoSeleccionado?.cantidadRecibida || 0)}</p>

                    <div className={styles.formGroup}>
                      <label>Cantidad a devolver:</label>
                      <input
                        type="number"
                        min="1"
                        max={productoSeleccionado?.cantidad - (productoSeleccionado?.cantidadRecibida || 0)}
                        value={cantidadDevolucion}
                        onChange={(e) => setCantidadDevolucion(Math.max(1, Math.min(
                          productoSeleccionado.cantidad - (productoSeleccionado.cantidadRecibida || 0),
                          Number(e.target.value)
                        )))}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Motivo:</label>
                      <textarea
                        value={motivoDevolucion}
                        onChange={(e) => setMotivoDevolucion(e.target.value)}
                        placeholder="Describe el motivo de la devolución"
                        rows={3}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Usuario autorizado (Admin/Supervisor):</label>
                      <input
                        type="text"
                        value={usuarioDevolucion}
                        onChange={(e) => setUsuarioDevolucion(e.target.value)}
                        placeholder="Ingrese su usuario"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Contraseña:</label>
                      <input
                        type="password"
                        value={passwordDevolucion}
                        onChange={(e) => setPasswordDevolucion(e.target.value)}
                        placeholder="Ingrese su contraseña"
                      />
                    </div>

                    <div className={styles.modalFooter}>
                      <button 
                        onClick={confirmarDevolucion}
                        disabled={!cantidadDevolucion || !motivoDevolucion || !usuarioDevolucion || !passwordDevolucion}
                        className={styles.botonConfirmar}
                      >
                        Registrar Devolución
                      </button>
                      <button 
                        onClick={cerrarModalDevolucion}
                        className={styles.botonCancelar}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
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