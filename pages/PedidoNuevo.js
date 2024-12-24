import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import Navbar from './navbar';
import styles from './PedidoNuevo.module.css';

const PedidoNuevo = () => {
  const [paso, setPaso] = useState(1);
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [productos, setProductos] = useState([{ producto: '', cantidad: 1 }]);

  const opciones = ['chihuahua', 'cantera', 'sendero', 'flores magon', 'pumas', 'rosalio'];

  const handleOrigenChange = (e) => {
    setOrigen(e.target.value);
    setDestino('');
  };

  const getDestinos = () => {
    if (['chihuahua', 'cantera', 'sendero', 'flores magon'].includes(origen)) {
      return ['pumas'];
    } else if (origen === 'pumas') {
      return ['chihuahua', 'rosalio', 'compras'];
    } else if (origen === 'rosalio') {
      return [ 'compras'];
    }
    return [];
  };

  const handleProductoChange = (index, field, value) => {
    const nuevosProductos = [...productos];
    nuevosProductos[index][field] = value;
    setProductos(nuevosProductos);
  };

  const agregarProducto = () => {
    setProductos([...productos, { producto: '', cantidad: 1 }]);
  };

  const eliminarProducto = (index) => {
    const nuevosProductos = productos.filter((_, i) => i !== index);
    setProductos(nuevosProductos);
  };

  const avanzarPaso = () => {
    setPaso((prevPaso) => prevPaso + 1);
  };

  const regresarPaso = () => {
    setPaso((prevPaso) => prevPaso - 1);
  };

  const generarCodigoBarras = (data) => {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, data, { format: 'CODE128' });
    return canvas.toDataURL('image/png');
  };

  const generarPDF = () => {
    const doc = new jsPDF();

    // Encabezado del pedido
    doc.setFont('helvetica', 'bold');
    doc.text('Orden de Entrega', 20, 20);
    doc.setFont('helvetica', 'normal');
    doc.text(`Origen: ${origen}`, 20, 40);
    doc.text(`Destino: ${destino}`, 20, 50);

    // Agregar código de barras del pedido
    const pedidoCodigoBarras = generarCodigoBarras('PEDIDO12345');
    doc.addImage(pedidoCodigoBarras, 'PNG', 150, 20, 40, 20);

    // Listado de productos
    doc.text('Productos:', 20, 70);
    productos.forEach((p, index) => {
      doc.text(`${index + 1}. ${p.producto} - Cantidad: ${p.cantidad}`, 20, 80 + index * 10);
      const productoCodigoBarras = generarCodigoBarras(p.producto);
      doc.addImage(productoCodigoBarras, 'PNG', 150, 80 + index * 10, 40, 20);
    });

    // Guardar PDF
    doc.save('Orden_de_Entrega.pdf');
  };

  const finalizarPedido = () => {
    generarPDF();
    setPaso(1);
    setOrigen('');
    setDestino('');
    setProductos([{ producto: '', cantidad: 1 }]);
  };

  return (
    <div>
      <Navbar />

      <div className={styles.formContainer}>
        <div className={styles.navbarSpacing}></div>
        {paso === 1 && (
          <form className={styles.formulario}>
            <h3 className={styles.tituloH3}>Paso 1: Selección de Origen y Destino</h3>
            <div>
              <label className={styles.label}>Origen:</label>
              <select className={styles.select} value={origen} onChange={handleOrigenChange}>
                <option value="">Seleccione un origen</option>
                {opciones.map((opc) => (
                  <option key={opc} value={opc}>
                    {opc}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={styles.label}>Destino:</label>
              <select
                className={styles.select}
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                disabled={!origen}
              >
                <option value="">Seleccione un destino</option>
                {getDestinos().map((dst) => (
                  <option key={dst} value={dst}>
                    {dst}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.button}>
              <button type="button" onClick={avanzarPaso} disabled={!origen || !destino}>
                Siguiente
              </button>
            </div>
          </form>
        )}
        {paso === 2 && (
          <form className={styles.formulario}>
            <h3 className={styles.tituloH3}>Paso 2: Agregar Productos</h3>
            {productos.map((producto, index) => (
              <div key={index} className={styles.productRow}>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Nombre del producto"
                  value={producto.producto}
                  onChange={(e) => handleProductoChange(index, 'producto', e.target.value)}
                  required
                />
                <input
                  className={styles.input}
                  type="number"
                  placeholder="Cantidad"
                  value={producto.cantidad}
                  onChange={(e) => handleProductoChange(index, 'cantidad', e.target.value)}
                  min="1"
                  required
                />
                <button
                  type="button"
                  onClick={() => eliminarProducto(index)}
                  disabled={productos.length === 1}
                >
                  Eliminar
                </button>
              </div>
            ))}
            <div className={styles.button}>
              <button type="button" onClick={agregarProducto}>
                Agregar Producto
              </button>
              <button type="button" onClick={regresarPaso}>
                Anterior
              </button>
              <button type="button" onClick={avanzarPaso} disabled={productos.length === 0}>
                Siguiente
              </button>
            </div>
          </form>
        )}
        {paso === 3 && (
          <div>
            <h3 className={styles.tituloH3}>Paso 3: Finalizar Pedido</h3>
            <p>Origen: {origen}</p>
            <p>Destino: {destino}</p>
            <h4 className={styles.tituloH4}>Productos:</h4>
            <ul className={styles.listaProductos}>
              {productos.map((producto, index) => (
                <li key={index} className={styles.itemProducto}>
                  {`${producto.producto} - Cantidad: ${producto.cantidad}`}
                </li>
              ))}
            </ul>
            <div className={styles.button}>
              <button type="button" onClick={finalizarPedido}>
                Finalizar Pedido
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PedidoNuevo;
