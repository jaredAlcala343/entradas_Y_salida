import React, { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import styles from './recibirpedidos.module.css';
import Navbar from './navbar';

const RecibirPedido = () => {
  // Estados principales
  const [pedidoId, setPedidoId] = useState('');
  const [pedidoInfo, setPedidoInfo] = useState(null);
  const [productoActual, setProductoActual] = useState(null);
  const [codigoEscaneado, setCodigoEscaneado] = useState({});
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [pedidoTerminado, setPedidoTerminado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mensajeError, setMensajeError] = useState('');
  const [escaneosRestantes, setEscaneosRestantes] = useState(0);

  // Estados para modales
  const [mostrarModalDevolucion, setMostrarModalDevolucion] = useState(false);
  const [mostrarModalBorrado, setMostrarModalBorrado] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [motivoDevolucion, setMotivoDevolucion] = useState('');
  const [cantidadDevolucion, setCantidadDevolucion] = useState(0);
  const [usuarioDevolucion, setUsuarioDevolucion] = useState('');
  const [passwordDevolucion, setPasswordDevolucion] = useState('');
  const [loadingBorrado, setLoadingBorrado] = useState(false);
  const [resumenBorrado, setResumenBorrado] = useState(null);

  // Referencias para enfoque automático
  const inputPedidoRef = useRef(null);
  const inputProductoRef = useRef(null);
  const inputUsuarioRef = useRef(null);

  // Función para verificar si el escaneo está completo
  const verificarEscaneoCompleto = () => {
    return pedidoInfo?.productos?.every(producto => {
      return (codigoEscaneado[producto.id] || 0) >= producto.cantidad;
    });
  };

  // Efecto para manejar el enfoque de los inputs
  useEffect(() => {
    if (!pedidoInfo && inputPedidoRef.current) {
      inputPedidoRef.current.focus();
    } else if (productoActual && !verificarEscaneoCompleto() && inputProductoRef.current) {
      inputProductoRef.current.focus();
    } else if (verificarEscaneoCompleto() && inputUsuarioRef.current) {
      inputUsuarioRef.current.focus();
    }
  }, [pedidoInfo, productoActual, codigoEscaneado]);

  // Procesar productos para que cada variante sea única y escaneable
  const procesarProductos = (productos) => {
    return productos.flatMap((producto) => {
      const nombreProducto = producto.nombre || producto.CNOMBREPRODUCTO || '';
      const codigoProducto = producto.codigo || producto.CCODIGOPRODUCTO || '';
      const idProducto = producto.id || producto.Producto || producto.idProducto;

      // Dividir el nombre del producto en partes
      const partes = nombreProducto.split(',')
        .map((p) => p.trim())
        .filter((p) => p && p.toLowerCase() !== "null");

      if (partes.length === 0) return [];

      const nombreBase = partes[0];
      const caracteristicas = partes.slice(1);

      if (caracteristicas.length > 0) {
        return caracteristicas.map((caracteristica) => ({
          ...producto,
          nombreBase,
          caracteristicas: [caracteristica],
          nombreCompleto: `${nombreBase}, ${caracteristica}`,
          codigo: codigoProducto,
          id: `${idProducto}-${caracteristica.replace(/\s+/g, '-')}`,
          cantidad: producto.cantidad || producto.Unidades || producto.unidadesPedido,
          cantidadRecibida: 0,
          valido: true,
        }));
      }

      return {
        ...producto,
        nombreBase,
        caracteristicas: [],
        nombreCompleto: nombreBase,
        codigo: codigoProducto,
        id: idProducto,
        cantidad: producto.cantidad || producto.Unidades || producto.unidadesPedido,
        cantidadRecibida: 0,
        valido: true,
      };
    }).filter(Boolean);
  };

  // Buscar pedido en el servidor
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

      if (!response.ok) throw new Error(data.message || 'Error al buscar el Traspaso');

      const productosProcesados = procesarProductos(data.productos);

      if (productosProcesados.length === 0) {
        throw new Error("No se encontraron productos válidos en el traspaso");
      }

      const conteoInicial = {};
      productosProcesados.forEach(p => {
        conteoInicial[p.id] = 0;
      });

      setPedidoInfo({
        ...data.pedido,
        productos: productosProcesados,
      });
      
      setProductoActual(productosProcesados[0]);
      setEscaneosRestantes(productosProcesados[0].cantidad);
      setCodigoEscaneado(conteoInicial);
      setPedidoTerminado(false);
      setResumenBorrado(null);
    } catch (err) {
      setMensajeError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Escanear un producto
  const escanearProducto = (codigo) => {
    if (!productoActual || !pedidoInfo) return;

    const [codigoBase, cantidadStr] = codigo.includes('-') 
      ? [codigo.substring(0, codigo.lastIndexOf('-')), parseInt(codigo.split('-').pop()) || 1]
      : [codigo, 1];

    const codigoAComparar = productoActual.codigo === "CUANL" ? "CUANL" : productoActual.codigo;
    
    if (codigoBase !== codigoAComparar) {
      setMensajeError(`⚠️ Debes escanear: ${productoActual.codigo} (${productoActual.nombreCompleto})`);
      return;
    }

    if (cantidadStr > escaneosRestantes) {
      setMensajeError(`⚠️ Cantidad excede lo requerido (${escaneosRestantes} restantes)`);
      return;
    }

    const nuevosEscaneos = {
      ...codigoEscaneado,
      [productoActual.id]: (codigoEscaneado[productoActual.id] || 0) + cantidadStr,
    };

    setCodigoEscaneado(nuevosEscaneos);
    setEscaneosRestantes(prev => prev - cantidadStr);

    const nuevosProductos = pedidoInfo.productos.map(p => 
      p.id === productoActual.id 
        ? { ...p, cantidadRecibida: (p.cantidadRecibida || 0) + cantidadStr }
        : p
    );

    setPedidoInfo({...pedidoInfo, productos: nuevosProductos});

    if (nuevosEscaneos[productoActual.id] >= productoActual.cantidad) {
      setMensajeError(`✅ Completado: ${productoActual.nombreCompleto}`);

      const indexActual = pedidoInfo.productos.findIndex(p => p.id === productoActual.id);
      const siguienteProducto = pedidoInfo.productos.slice(indexActual + 1).find(p => {
        return (nuevosEscaneos[p.id] || 0) < p.cantidad;
      });

      if (siguienteProducto) {
        setProductoActual(siguienteProducto);
        setEscaneosRestantes(siguienteProducto.cantidad - (nuevosEscaneos[siguienteProducto.id] || 0));
      } else if (verificarEscaneoCompleto()) {
        setMensajeError("✅ Todos los productos escaneados. Ingresa credenciales para confirmar.");
      }
    }
  };

  // Abrir modal de devolución
  const abrirModalDevolucion = (producto) => {
    if (!producto?.id) {
      setMensajeError('El producto no tiene ID definido');
      return;
    }
    
    setProductoSeleccionado(producto);
    setCantidadDevolucion(1);
    setMotivoDevolucion('');
    setUsuarioDevolucion('');
    setPasswordDevolucion('');
    setMostrarModalDevolucion(true);
    setMensajeError('');
  };

  // Abrir modal de borrado
  const abrirModalBorrado = (producto) => {
    if (!producto?.id) {
      setMensajeError('El producto no tiene ID definido');
      return;
    }
    setProductoSeleccionado(producto);
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
      const url = `/api/data?type=validarUsuario&usuario=${encodeURIComponent(usuario)}&contrasena=${encodeURIComponent(password)}`;
      
      console.log('URL de validación:', url);
      
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error HTTP: ${res.status}`);
      }

      const data = await res.json();

      if (!data.valid) {
        throw new Error(data.message || "Credenciales inválidas");
      }

      if (!['Admin', 'Supervisor'].includes(data.rol)) {
        throw new Error("Usuario no tiene permisos suficientes");
      }

      return true;
    } catch (error) {
      console.error('Error en validarUsuarioAutorizado:', {
        usuario,
        error: error.message
      });
      throw new Error("Error al validar credenciales. Por favor intente nuevamente.");
    }
  };

  // Función mejorada para confirmar devolución
  const confirmarDevolucion = async () => {
    try {
      setLoading(true);
      setMensajeError('');

      const response = await fetch('/api/registrarDevolucion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedidoId,
          productoId: productoSeleccionado.Producto || productoSeleccionado.idProducto || productoSeleccionado.id,
          motivo: motivoDevolucion,
          cantidad: cantidadDevolucion,
          usuario: usuarioDevolucion,
          password: passwordDevolucion
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Error al registrar la devolución');
      }

      // --- ACTUALIZA EL FRONTEND AUTOMÁTICAMENTE ---
      // Resta la cantidad devuelta al producto correspondiente
      setCodigoEscaneado(prev => ({
        ...prev,
        [productoSeleccionado.id]: (prev[productoSeleccionado.id] || 0) - Number(cantidadDevolucion)
      }));

      // Opcional: actualiza el objeto de productos si tienes un estado para ello
      setPedidoInfo(prev => ({
        ...prev,
        productos: prev.productos.map(p =>
          p.id === productoSeleccionado.id
            ? { ...p, cantidad: p.cantidad - Number(cantidadDevolucion) }
            : p
        )
      }));

      // Cierra el modal y limpia campos
      setMostrarModalDevolucion(false);
      setCantidadDevolucion('');
      setMotivoDevolucion('');
      setUsuarioDevolucion('');
      setPasswordDevolucion('');
      setProductoSeleccionado(null);

      setMensajeError('✅ Devolución registrada correctamente');
    } catch (error) {
      setMensajeError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Confirmar borrado de producto - FUNCIÓN ACTUALIZADA CON PDF
  const confirmarBorrado = async () => {
    try {
      setLoadingBorrado(true);
      setMensajeError('');

      if (!pedidoId || !productoSeleccionado?.id || !usuarioDevolucion || !passwordDevolucion) {
        throw new Error('Datos incompletos para borrar el producto');
      }

      await validarUsuarioAutorizado(usuarioDevolucion, passwordDevolucion);

      // Enviar el ID real del producto
      const productoIdReal = productoSeleccionado.Producto || productoSeleccionado.idProducto || productoSeleccionado.id;

      const response = await fetch('/api/borrarProducto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numeroPedido: pedidoId,
          productoId: productoIdReal,
          usuario: usuarioDevolucion,
          password: passwordDevolucion
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Error al borrar el producto');
      }

      // Crear resumen con los datos del PDF
      setResumenBorrado({
        producto: productoSeleccionado.nombreCompleto,
        codigo: productoSeleccionado.codigo,
        cantidad: productoSeleccionado.cantidad,
        traspasoCompleto: data.detalles.documentoEliminado,
        pdfBase64: data.detalles.pdfBase64,
        usuario: usuarioDevolucion,
        fecha: new Date().toLocaleString('es-MX', {
          timeZone: 'America/Mexico_City'
        })
      });

      // Mostrar PDF en nueva pestaña
      if (data.detalles.pdfBase64) {
        const pdfWindow = window.open();
        pdfWindow.document.write(`
          <iframe 
            width='100%' 
            height='100%' 
            src='data:application/pdf;base64,${data.detalles.pdfBase64}'
            style="border: none;"
          ></iframe>
        `);
      }

      setMensajeError(`✅ Producto borrado: ${productoSeleccionado.nombreCompleto}`);
      
      // Actualizar lista de productos
      const nuevosProductos = pedidoInfo.productos.filter(p => p.id !== productoSeleccionado.id);
      
      if (nuevosProductos.length === 0) {
        setPedidoInfo(null);
        setPedidoId('');
      } else {
        if (productoActual?.id === productoSeleccionado.id) {
          const siguienteProducto = nuevosProductos.find(p => (codigoEscaneado[p.id] || 0) < p.cantidad) || nuevosProductos[0];
          setProductoActual(siguienteProducto);
          setEscaneosRestantes(siguienteProducto.cantidad - (codigoEscaneado[siguienteProducto.id] || 0));
        }
        
        setPedidoInfo({...pedidoInfo, productos: nuevosProductos});
      }

      setMostrarModalBorrado(false);
    } catch (error) {
      setMensajeError(error.message);
    } finally {
      setLoadingBorrado(false);
    }
  };

  // Generar comprobante PDF
  const generarComprobantePDF = () => {
    if (!pedidoInfo) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.setTextColor(40);
    doc.text('Comprobante de Traspaso Recibido', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.text(`Identificador del Traspaso: ${pedidoInfo.numero}`, 20, 40);
    doc.text(`Origen: ${pedidoInfo.NombreOrigen || pedidoInfo.origen} (${pedidoInfo.origen})`, 20, 50);
    doc.text(`Destino: ${pedidoInfo.NombreDestino || pedidoInfo.destino} (${pedidoInfo.destino})`, 20, 60);
    doc.text(`Confirmado por: ${usuario}`, 20, 70);
    doc.text(`Fecha: ${new Date().toLocaleString()}`, 20, 80);

    const productos = pedidoInfo.productos.map((producto, index) => [
      index + 1,
      producto.nombreCompleto,
      producto.cantidad,
      codigoEscaneado[producto.id] || 0,
      producto.codigo,
      (codigoEscaneado[producto.id] || 0) >= producto.cantidad ? '✅' : '❌'
    ]);

    doc.autoTable({
      head: [['#', 'Producto', 'Solicitado', 'Recibido', 'Código', 'Estado']],
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
      columnStyles: {
        1: { cellWidth: 60 },
        5: { cellWidth: 20 }
      }
    });

    doc.save(`Comprobante_Traspaso_${pedidoInfo.numero}.pdf`);
  };

  // Confirmar terminación del pedido
  const confirmarTerminarPedido = async () => {
    try {
      setLoading(true);
      setMensajeError('');

      if (!usuario || !password) {
        throw new Error('Debe ingresar usuario y contraseña');
      }

      await validarUsuarioAutorizado(usuario, password);

      const productosParaEnviar = pedidoInfo.productos.map(p => ({
        id: p.id,
        codigo: p.codigo,
        cantidad: codigoEscaneado[p.id] || 0
      }));

      console.log('Enviando datos para terminar pedido:', {
        pedidoId,
        usuario,
        productos: productosParaEnviar
      });

      const response = await fetch('/api/recibirPedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pedidoId,
          usuario: usuario.trim(),
          password: password.trim(),
          productosEscaneados: productosParaEnviar
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMensajeError('✅ Traspaso Completado con Éxito.');
        generarComprobantePDF();
        
        if (pedidoInfo.destino) {
          const updateResponse = await fetch('/api/Almacen_destino', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              numeroPedido: pedidoId, 
              destino: pedidoInfo.destino,
              productos: productosParaEnviar
            }),
          });

          if (!updateResponse.ok) {
            const updateData = await updateResponse.json();
            setMensajeError(updateData.message || '⚠️ Error al actualizar el almacén');
          }
        }

        setPedidoTerminado(true);
      } else {
        throw new Error(data.message || '❌ Error al actualizar el Traspaso');
      }
    } catch (error) {
      setMensajeError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Navbar />
      <div className={styles.panelContainer}>
        <h3 className={styles.panelTitle}>Recepción de Traspasos</h3>
        
        {mensajeError && (
          <div className={mensajeError.includes('✅') ? styles.successMessage : styles.errorMessage}>
            {mensajeError}
          </div>
        )}

        {!pedidoInfo ? (
          <div className={styles.searchContainer}>
            <h4 className={styles.subtitle}>Escanea código del Traspaso</h4>
            <div className={styles.inputGroup}>
              <input
                ref={inputPedidoRef}
                type="text"
                placeholder="Ingresa el número de Traspaso"
                value={pedidoId}
                onChange={(e) => setPedidoId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarPedido()}
                autoFocus
              />
              <button 
                onClick={buscarPedido} 
                disabled={loading}
                className={styles.primaryButton}
              >
                {loading ? 'Buscando...' : 'Buscar Traspaso'}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.pedidoContainer}>
            <div className={styles.pedidoHeader}>
              <h4>Traspaso: {pedidoInfo.numero}</h4>
              <div className={styles.pedidoInfo}>
                <p><strong>Origen:</strong> {pedidoInfo.NombreOrigen || pedidoInfo.origen}</p>
                <p><strong>Destino:</strong> {pedidoInfo.NombreDestino || pedidoInfo.destino}</p>
                <p><strong>Fecha creación:</strong> {new Date(pedidoInfo.fechaCreacion).toLocaleDateString()}</p>
                <p><strong>Estatus:</strong> {pedidoInfo.estatus || 'Activo'}</p>
              </div>
            </div>
            
            {productoActual && !verificarEscaneoCompleto() && (
              <div className={styles.productoActualContainer}>
                <h4 className={styles.productoActualTitle}>Producto actual</h4>
                <div className={styles.productoActualInfo}>
                  <p><strong>{productoActual.nombreCompleto}</strong></p>
                  <p><strong>Código:</strong> {productoActual.codigo}</p>
                  <p><strong>Cantidad a escanear:</strong> {productoActual.cantidad}</p>
                  <p><strong>Escaneados:</strong> {codigoEscaneado[productoActual.id] || 0}</p>
                </div>
              </div>
            )}

            <div className={styles.productosContainer}>
              <h4>Productos a escanear</h4>
              <div className={styles.tableContainer}>
                <table className={styles.productosTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Producto</th>
                      <th>Código</th>
                      <th>Solicitado</th>
                      <th>Escaneado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidoInfo.productos.map((producto, index) => {
                      const productoCompleto = (codigoEscaneado[producto.id] || 0) >= producto.cantidad;
                      const esProductoActual = productoActual?.id === producto.id;

                      return (
                        <tr key={index} className={`
                          ${esProductoActual ? styles.activeRow : ''}
                          ${productoCompleto ? styles.completedRow : ''}
                        `}>
                          <td>{index + 1}</td>
                          <td>{producto.nombreCompleto}</td>
                          <td>{producto.codigo}</td>
                          <td>{producto.Unidades}</td>
                          <td>{codigoEscaneado[producto.id] || 0}</td>
                          <td>
                            <div className={styles.accionesContainer}>
                              <button 
                                onClick={() => abrirModalDevolucion(producto)}
                                disabled={!productoCompleto || (codigoEscaneado[producto.id] || 0) <= 1}
                                className={styles.secondaryButton}
                              >
                                Devolución
                              </button>
                              <button 
                                onClick={() => abrirModalBorrado(producto)}
                                className={styles.dangerButton}
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
            </div>

            <div className={styles.scanSection}>
              {!verificarEscaneoCompleto() ? (
                <>
                  <div className={styles.scanInstructions}>
                    <p>Escanea el código de barras del producto actual</p>
                  </div>
                  <input
                    ref={inputProductoRef}
                    type="text"
                    placeholder={`Ingresa ${productoActual?.codigo || 'el código'}`}
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
                <div className={styles.confirmacionSection}>
                  <h4>Confirmar Recepción Completa</h4>
                  <div className={styles.formGroup}>
                    <label>Usuario autorizado:</label>
                    <input
                      ref={inputUsuarioRef}
                      type="text"
                      value={usuario}
                      onChange={(e) => setUsuario(e.target.value)}
                      placeholder="Tu correo electrónico"
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
                    className={styles.primaryButton}
                    disabled={loading}
                  >
                    {loading ? 'Procesando...' : 'Confirmar Traspaso'}
                  </button>
                </div>
              )}
            </div>

            {mostrarModalDevolucion && (
              <div className={styles.modalOverlay}>
                <div className={styles.modal}>
                  <h4>Registrar Devolución</h4>
                  <div className={styles.modalBody}>
                    <div className={styles.modalInfo}>
                      <p><strong>Producto:</strong> {productoSeleccionado?.nombreCompleto}</p>
                      <p><strong>Código:</strong> {productoSeleccionado?.codigo}</p>
                      <p><strong>Recibido:</strong> {codigoEscaneado[productoSeleccionado?.id] || 0} / {productoSeleccionado?.cantidad}</p>
                    </div>

                    <div className={styles.formGroup}>
                      <label>Cantidad a devolver (1-{Math.max(0, (codigoEscaneado[productoSeleccionado?.id] || 0) - 1)}):</label>
                      <input 
                        type="number"
                        min="1"
                        max={Math.max(0, (codigoEscaneado[productoSeleccionado?.id] || 0) - 1)}
                        value={cantidadDevolucion}
                        onChange={(e) => {
                          const max = Math.max(0, (codigoEscaneado[productoSeleccionado?.id] || 0) - 1);
                          const value = Math.max(1, Math.min(max, Number(e.target.value) || 1));
                          setCantidadDevolucion(value);
                        }}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Motivo: ({200 - motivoDevolucion.length} caracteres restantes)</label>
                      <textarea
                        value={motivoDevolucion}
                        onChange={(e) => {
                          const motivo = e.target.value.substring(0, 200);
                          setMotivoDevolucion(motivo);
                        }}
                        placeholder="Describe el motivo de la devolución (máx. 200 caracteres)"
                        rows={3}
                        maxLength={200}
                      />
                      {motivoDevolucion.length >= 200 && (
                        <span className={styles.warningText}>Has alcanzado el límite máximo de caracteres</span>
                      )}
                    </div>

                    <div className={styles.formGroup}>
                      <label>Usuario autorizado (Admin/Supervisor):</label>
                      <input
                        type="email"
                        value={usuarioDevolucion}
                        onChange={(e) => setUsuarioDevolucion(e.target.value)}
                        placeholder="Ingrese su correo electrónico"
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
                        className={styles.primaryButton}
                      >
                        Registrar Devolución
                      </button>
                      <button 
                        onClick={() => setMostrarModalDevolucion(false)}
                        className={styles.secondaryButton}
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

                    <div className={styles.modalInfo}>
                      <p><strong>Producto:</strong> {productoSeleccionado?.nombreCompleto}</p>
                      <p><strong>Código:</strong> {productoSeleccionado?.codigo}</p>
                      <p><strong>Cantidad:</strong> {productoSeleccionado?.cantidad} unidades</p>
                    </div>

                    <div className={styles.formGroup}>
                      <label>Usuario autorizado (Admin/Supervisor):</label>
                      <input
                        type="email"
                        value={usuarioDevolucion}
                        onChange={(e) => setUsuarioDevolucion(e.target.value)}
                        placeholder="Ingrese su correo electrónico"
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
                        className={styles.dangerButton}
                      >
                        {loadingBorrado ? 'Procesando...' : 'Confirmar Borrado'}
                      </button>
                      <button 
                        onClick={() => setMostrarModalBorrado(false)}
                        disabled={loadingBorrado}
                        className={styles.secondaryButton}
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
                <div className={styles.modal} style={{ maxWidth: '800px' }}>
                  <h4>Resumen de Producto Borrado</h4>
                  <div className={styles.modalBody}>
                    <div className={styles.successAlert}>
                      <h5>✅ Producto eliminado correctamente</h5>
                      <p>Se ha generado un registro PDF de esta operación.</p>
                    </div>

                    <div className={styles.modalInfo}>
                      <p><strong>Producto:</strong> {resumenBorrado.producto}</p>
                      <p><strong>Código:</strong> {resumenBorrado.codigo}</p>
                      <p><strong>Cantidad eliminada:</strong> {resumenBorrado.cantidad} unidades</p>
                      <p><strong>Usuario que realizó la acción:</strong> {resumenBorrado.usuario}</p>
                      <p><strong>Fecha y hora:</strong> {resumenBorrado.fecha}</p>
                      <p><strong>Estado:</strong> {resumenBorrado.traspasoCompleto ? 
                        'Traspaso completo eliminado' : 'Producto eliminado (traspaso permanece)'}</p>
                    </div>

                    <div className={styles.modalFooter}>
                      <button 
                        onClick={() => {
                          if (resumenBorrado.pdfBase64) {
                            const pdfWindow = window.open();
                            pdfWindow.document.write(`
                              <iframe 
                                width='100%' 
                                height='100%' 
                                src='data:application/pdf;base64,${resumenBorrado.pdfBase64}'
                                style="border: none;"
                              ></iframe>
                            `);
                          }
                        }}
                        className={styles.secondaryButton}
                      >
                        Ver PDF nuevamente
                      </button>
                      <button 
                        onClick={() => setResumenBorrado(null)}
                        className={styles.primaryButton}
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