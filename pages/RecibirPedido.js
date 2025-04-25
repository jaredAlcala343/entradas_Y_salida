import React, { useState } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import styles from './recibirpedidos.module.css';
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
  const [mostrarModalBorrado, setMostrarModalBorrado] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [motivoDevolucion, setMotivoDevolucion] = useState('');
  const [cantidadDevolucion, setCantidadDevolucion] = useState(0);
  const [usuarioDevolucion, setUsuarioDevolucion] = useState('');
  const [passwordDevolucion, setPasswordDevolucion] = useState('');
  const [mensajeError, setMensajeError] = useState('');
  const [loadingBorrado, setLoadingBorrado] = useState(false);
  const [resumenBorrado, setResumenBorrado] = useState(null);

  const buscarPedido = async () => {
    if (!pedidoId.trim()) {
      setMensajeError('⚠️ Ingresa un código de Traspaso válido.');
      return;
    }
    setLoading(true);
    setMensajeError('');
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
        setResumenBorrado(null);
      } else {
        setMensajeError(data.message || 'Traspaso no encontrado');
        setPedidoInfo(null);
      }
    } catch (err) {
      setMensajeError('Error al buscar el Traspaso');
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
      setMensajeError('No hay productos para escanear');
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
          setMensajeError('✅ Todos los productos han sido escaneados. Ahora puedes confirmar el traspaso.');
        } else {
          setProductoIndex(productoIndex + 1);
        }
      }
    } else {
      setMensajeError(`❌ Código incorrecto. Esperado: ${productoActual.codigo}, Recibido: ${codigoBase}`);
    }
  };

  const verificarEscaneoCompleto = () => {
    return pedidoInfo?.productos?.every(producto => {
      return (producto.cantidadRecibida || 0) >= producto.cantidad;
    });
  };

  const abrirModalDevolucion = (producto) => {
    if (!producto?.id) {
      setMensajeError('El producto no tiene ID definido');
      return;
    }
    
    const maxDevolucion = Math.max(0, (producto.cantidadRecibida || 0) - 1);
    
    setProductoSeleccionado({
      ...producto,
      id: Number(producto.id)
    });
    setCantidadDevolucion(1); // Iniciar con 1 unidad en lugar de la cantidad faltante
    setMotivoDevolucion('');
    setUsuarioDevolucion('');
    setPasswordDevolucion('');
    setMostrarModalDevolucion(true);
    setMensajeError('');
  };

  const abrirModalBorrado = (producto) => {
    if (!producto?.id) {
      setMensajeError('El producto no tiene ID definido');
      return;
    }
    setProductoSeleccionado({
      ...producto,
      id: Number(producto.id)
    });
    setUsuarioDevolucion('');
    setPasswordDevolucion('');
    setMostrarModalBorrado(true);
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

        // Validar que no se deje el producto en 0
        const cantidadActual = productoSeleccionado.cantidadRecibida || 0;
        const nuevaCantidadRecibida = cantidadActual - cantidadDevolucion;

        if (nuevaCantidadRecibida < 0) {
            throw new Error('No puedes devolver más unidades de las que se han recibido');
        }

        if (nuevaCantidadRecibida === 0) {
            throw new Error('No puedes dejar el producto con 0 unidades recibidas');
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

        setMensajeError(`✅ Devolución registrada: ${cantidadDevolucion} unidades de ${productoSeleccionado.nombre}`);

        // Actualizar las cantidades de solicitado y escaneado
        const nuevosProductos = [...pedidoInfo.productos];
        const productoIndex = nuevosProductos.findIndex(p => p.id === productoSeleccionado.id);

        if (productoIndex !== -1) {
            nuevosProductos[productoIndex].cantidad -= cantidadDevolucion; // Reducir la cantidad solicitada
            nuevosProductos[productoIndex].cantidadRecibida -= cantidadDevolucion; // Reducir la cantidad escaneada
        }

        setPedidoInfo({ ...pedidoInfo, productos: nuevosProductos });

        setMostrarModalDevolucion(false);
        setMotivoDevolucion('');
        setCantidadDevolucion(0);
        setUsuarioDevolucion('');
        setPasswordDevolucion('');
    } catch (error) {
        setMensajeError(error.message);
        console.error('Error al registrar devolución:', error);
    }
};

  const confirmarBorrado = async () => {
    try {
      setLoadingBorrado(true);
      setMensajeError('');

      if (!pedidoId || !productoSeleccionado?.id || !usuarioDevolucion || !passwordDevolucion) {
        throw new Error('Datos incompletos para borrar el producto');
      }

      await validarUsuarioAutorizado(usuarioDevolucion, passwordDevolucion);

      const response = await fetch('/api/borrarProducto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numeroPedido: pedidoId,
          productoId: Number(productoSeleccionado.id),
          usuarioAutorizacion: usuarioDevolucion
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Error al borrar el producto');
      }

      // Mostrar resumen del borrado
      setResumenBorrado({
        producto: productoSeleccionado.nombre,
        codigo: productoSeleccionado.codigo,
        cantidad: productoSeleccionado.cantidad,
        traspasoCompleto: data.detalles.documentoEliminado,
        pdfBase64: data.detalles.pdfBase64
      });

      // Mostrar PDF en nueva pestaña
      if (data.detalles.pdfBase64) {
        const pdfWindow = window.open();
        pdfWindow.document.write(`
          <iframe width='100%' height='100%' 
          src='data:application/pdf;base64,${data.detalles.pdfBase64}'></iframe>
        `);
      }

      setMensajeError(`✅ Producto borrado: ${productoSeleccionado.nombre}`);
      
      // Actualizar lista de productos
      const nuevosProductos = pedidoInfo.productos.filter(p => p.id !== productoSeleccionado.id);
      
      if (nuevosProductos.length === 0) {
        // Si no quedan productos, limpiar todo
        setPedidoInfo(null);
        setPedidoId('');
      } else {
        // Si quedan productos, actualizar la lista
        setPedidoInfo({...pedidoInfo, productos: nuevosProductos});
      }

      setMostrarModalBorrado(false);
      setUsuarioDevolucion('');
      setPasswordDevolucion('');
    } catch (error) {
      setMensajeError(error.message);
      console.error('Error al borrar producto:', error);
    } finally {
      setLoadingBorrado(false);
    }
  };

  const cerrarModalDevolucion = () => {
    setMostrarModalDevolucion(false);
    setMotivoDevolucion('');
    setCantidadDevolucion(0);
    setUsuarioDevolucion('');
    setPasswordDevolucion('');
  };

  const cerrarModalBorrado = () => {
    setMostrarModalBorrado(false);
    setUsuarioDevolucion('');
    setPasswordDevolucion('');
  };

  const generarComprobantePDF = () => {
    if (!pedidoInfo) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Encabezado
    doc.setFontSize(18);
    doc.setTextColor(40);
    doc.text('Comprobante de Traspaso Recibido', pageWidth / 2, 20, { align: 'center' });

    // Información del traspaso
    doc.setFontSize(12);
    doc.text(`Identificador del Traspaso: ${pedidoInfo.id}`, 20, 40);
    doc.text(`Origen: ${pedidoInfo.origen}`, 20, 50);
    doc.text(`Destino: ${pedidoInfo.destino}`, 20, 60);
    doc.text(`Confirmado por: ${usuario}`, 20, 70);
    doc.text(`Fecha: ${new Date().toLocaleString()}`, 20, 80);

    // Tabla de productos
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
    doc.text('Firma del Empleado que Recibe:', 20, finalY);
    doc.line(20, finalY + 5, pageWidth - 20, finalY + 5); // Línea para la firma

    // Pie de página
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        doc.text('Traspasos Cubylam - Todos los derechos reservados', pageWidth / 2, pageHeight - 5, { align: 'center' });
    }

    doc.save(`Comprobante_Traspaso_${pedidoInfo.id}.pdf`);
  };

  const generarCodigosBarrasPDF = () => {
    if (!pedidoInfo) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFontSize(16);
    doc.text('Códigos de Barras de Productos', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Traspaso: ${pedidoInfo.id} - ${new Date().toLocaleDateString()}`, 20, 30);

    let xPos = 20;
    let yPos = 40;
    const labelWidth = 60;
    const labelHeight = 40;

    pedidoInfo.productos.forEach((producto) => {
        const codigoBase = producto.codigo.includes('-')
            ? producto.codigo.substring(0, producto.codigo.lastIndexOf('-'))
            : producto.codigo;

        for (let i = 0; i < producto.cantidad; i++) {
            const canvas = document.createElement('canvas');
            JsBarcode(canvas, codigoBase, {
                format: 'CODE128',
                displayValue: true,
                fontSize: 10,
            });
            const imgData = canvas.toDataURL('image/png');

            // Dibujar etiqueta
            doc.rect(xPos, yPos, labelWidth, labelHeight); // Borde de la etiqueta
            doc.addImage(imgData, 'PNG', xPos + 5, yPos + 5, labelWidth - 10, 20);
            doc.text(producto.nombre, xPos + labelWidth / 2, yPos + 30, { align: 'center' });
            doc.text(codigoBase, xPos + labelWidth / 2, yPos + 35, { align: 'center' });

            xPos += labelWidth + 10;
            if (xPos + labelWidth > pageWidth) {
                xPos = 20;
                yPos += labelHeight + 10;
                if (yPos + labelHeight > pageHeight - 20) {
                    doc.addPage();
                    yPos = 20;
                }
            }
        }
    });

    doc.save(`Codigos_Barras_Traspaso_${pedidoInfo.id}.pdf`);
  };

  const confirmarTerminarPedido = async () => {
    try {
      setLoading(true);
      setMensajeError('');

      await validarUsuarioAutorizado(usuario, password);

      const response = await fetch('/api/completarPedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroPedido: pedidoId, usuario, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setMensajeError('✅ Traspaso Completado con Éxito.');
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
            setMensajeError(updateData.message || '⚠️ Error al actualizar el almacén');
          }
        }

        setPedidoInfo(null);
        setPedidoId('');
        setUsuario('');
        setPassword('');
        setPedidoTerminado(false);
        setMostrarFormularioValidacion(false);
      } else {
        throw new Error(data.message || '❌ Error al actualizar el Traspaso');
      }
    } catch (error) {
      setMensajeError(error.message);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const cerrarResumenBorrado = () => {
    setResumenBorrado(null);
  };

  return (
    <div>
      <Navbar />
      <div className={styles.panelContainer}>
        <h3>Recibir Traspaso</h3>
        
        {mensajeError && (
          <div className={mensajeError.includes('✅') ? styles.successMessage : styles.errorMessage}>
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
                    const productoCompleto = (producto.cantidadRecibida || 0) >= producto.cantidad;
                    return (
                      <tr key={index} className={faltante <= 0 ? styles.completo : ''}>
                        <td>{producto.nombre}</td>
                        <td>{producto.codigo}</td>
                        <td>{producto.cantidad}</td>
                        <td>{producto.cantidadRecibida || 0}</td>
                        <td>{faltante}</td>
                        <td>
                          <div className={styles.botonesAccion}>
                            <button 
                              onClick={() => abrirModalDevolucion(producto)}
                              disabled={!productoCompleto || (producto.cantidadRecibida || 0) <= 1}
                              className={styles.botonDevolucion}
                            >
                              Devolución
                            </button>
                            <button 
                              onClick={() => abrirModalBorrado(producto)}
                              className={styles.botonBorrar}
                            >
                              Borrar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.scanSection}>
              {!verificarEscaneoCompleto() ? (
                <>
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
                </>
              ) : (
                <p className={styles.successMessage}>✅ Todos los productos han sido escaneados. Puedes confirmar el traspaso.</p>
              )}
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
                  disabled={loading}
                >
                  {loading ? 'Procesando...' : 'Confirmar Traspaso'}
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
                    <p><strong>Recibido:</strong> {productoSeleccionado?.cantidadRecibida || 0} / {productoSeleccionado?.cantidad}</p>
                    <p><strong>Máximo a devolver:</strong> {Math.max(0, (productoSeleccionado?.cantidadRecibida || 0) - 1)}</p>

                    <div className={styles.formGroup}>
                      <label>Cantidad a devolver (1-{Math.max(0, (productoSeleccionado?.cantidadRecibida || 0) - 1)}):</label>
                      <input 
                        type="number"
                        min="1"
                        max={Math.max(0, (productoSeleccionado?.cantidadRecibida || 0) - 1)}
                        value={cantidadDevolucion}
                        onChange={(e) => {
                          const max = Math.max(0, (productoSeleccionado?.cantidadRecibida || 0) - 1);
                          const value = Math.max(1, Math.min(max, Number(e.target.value) || 1) );
                          setCantidadDevolucion(value);
                        }}
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
                        disabled={!cantidadDevolucion || !motivoDevolucion || !usuarioDevolucion || !passwordDevolucion || loading}
                        className={styles.botonConfirmar}
                      >
                        {loading ? 'Procesando...' : 'Registrar Devolución'}
                      </button>
                      <button 
                        onClick={cerrarModalDevolucion}
                        disabled={loading}
                        className={styles.botonCancelar}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {mostrarModalBorrado && (
              <div className={styles.modalOverlay}>
                <div className={styles.modal}>
                  <h4>Confirmar Borrado de Producto</h4>
                  <div className={styles.modalBody}>
                    <div className={styles.warningAlert}>
                      <h5>¡Atención! Esta acción es irreversible</h5>
                      <p>Estás a punto de eliminar completamente este producto del traspaso.</p>
                    </div>

                    <div className={styles.productoInfo}>
                      <p><strong>Producto:</strong> {productoSeleccionado?.nombre}</p>
                      <p><strong>Código:</strong> {productoSeleccionado?.codigo}</p>
                      <p><strong>Cantidad:</strong> {productoSeleccionado?.cantidad} unidades</p>
                      <p><strong>Traspaso:</strong> {pedidoId}</p>
                    </div>

                    <div className={styles.formGroup}>
                      <label>Usuario autorizado (Admin/Supervisor):</label>
                      <input
                        type="text"
                        value={usuarioDevolucion}
                        onChange={(e) => setUsuarioDevolucion(e.target.value)}
                        placeholder="Ingrese su usuario"
                        disabled={loadingBorrado}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Contraseña:</label>
                      <input
                        type="password"
                        value={passwordDevolucion}
                        onChange={(e) => setPasswordDevolucion(e.target.value)}
                        placeholder="Ingrese su contraseña"
                        disabled={loadingBorrado}
                      />
                    </div>

                    <div className={styles.modalFooter}>
                      <button 
                        onClick={confirmarBorrado}
                        disabled={!usuarioDevolucion || !passwordDevolucion || loadingBorrado}
                        className={styles.botonBorrar}
                      >
                        {loadingBorrado ? 'Procesando...' : 'Confirmar Borrado'}
                      </button>
                      <button 
                        onClick={cerrarModalBorrado}
                        disabled={loadingBorrado}
                        className={styles.botonCancelar}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {resumenBorrado && (
              <div className={styles.modalOverlay}>
                <div className={styles.modal}>
                  <h4>Resumen de Producto Borrado</h4>
                  <div className={styles.modalBody}>
                    <div className={styles.successAlert}>
                      <h5>✅ Producto eliminado correctamente</h5>
                    </div>

                    <div className={styles.productoInfo}>
                      <p><strong>Producto:</strong> {resumenBorrado.producto}</p>
                      <p><strong>Código:</strong> {resumenBorrado.codigo}</p>
                      <p><strong>Cantidad eliminada:</strong> {resumenBorrado.cantidad} unidades</p>
                      <p><strong>Traspaso:</strong> {pedidoId}</p>
                      <p><strong>Estado:</strong> {resumenBorrado.traspasoCompleto ? 
                        'Traspaso completo eliminado' : 'Producto eliminado (traspaso permanece)'}</p>
                    </div>

                    <div className={styles.modalFooter}>
                      <button 
                        onClick={cerrarResumenBorrado}
                        className={styles.botonConfirmar}
                      >
                        Aceptar
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