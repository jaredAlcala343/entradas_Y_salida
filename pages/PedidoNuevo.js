import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import Navbar from './navbar';
import styles from './PedidoNuevo.module.css';

const PedidoNuevo = () => {
  const [paso, setPaso] = useState(1);
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [productos, setProductos] = useState([{ producto: '', cantidad: 1 }]);
  const [almacenes, setAlmacenes] = useState([]);
  const [productosDisponibles, setProductosDisponibles] = useState([]);
  const [filtroProductos, setFiltroProductos] = useState('');
  const [mostrarCredenciales, setMostrarCredenciales] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [usuarioValido, setUsuarioValido] = useState(false);

  useEffect(() => {
    const fetchData = async (type, setter) => {
      try {
        const res = await fetch(`/api/data?type=${type}`);
        if (!res.ok) throw new Error(`Error fetching ${type}`);
        setter(await res.json());
      } catch (err) {
        console.error(err);
      }
    };

    if (paso === 1) fetchData('almacenes', setAlmacenes);
    if (paso === 2) fetchData('productos', setProductosDisponibles);
  }, [paso]);

  const validarUsuario = async () => {
    try {
      const res = await fetch(
        `/api/data?type=validarUsuario&usuario=${usuario}&contrasena=${contrasena}`
      );
      const data = await res.json();
      setUsuarioValido(data.valid);
      return data.valid;
    } catch (err) {
      console.error('Error validando usuario:', err);
      return false;
    }
  };

  const generarCodigoDeBarras = (producto) => {
    const codigoProducto = `${producto.producto}-${producto.cantidad}`;
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, codigoProducto, {
      format: 'CODE128',
      width: 1,
      height: 2,
      displayValue: false,
      margin: 5,
    });
    return canvas.toDataURL('image/png');
  };

  const imprimirPedido = () => {
    const pedidoData = { usuario, origen, destino, productos };
    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.text('Referencia de Pedido', 10, 10);
    doc.text(`Usuario: ${usuario}`, 10, 20);
    doc.text(`Origen: ${origen}`, 10, 30);
    doc.text(`Destino: ${destino}`, 10, 40);
    productos.forEach((prod, i) => doc.text(`${i + 1}. ${prod.producto} - Cantidad: ${prod.cantidad}`, 10, 50 + i * 10));
    const barcode = generarCodigoDeBarras(pedidoData);
    doc.addImage(barcode, 'PNG', 10, 150, 180, 30);
    doc.save('Referencia_Pedido.pdf');
  };

  const confirmarPedido = async () => {
    if (await validarUsuario()) {
      imprimirPedido();
      alert('Pedido confirmado exitosamente.');
      setPaso(1);
      setOrigen('');
      setDestino('');
      setProductos([{ producto: '', cantidad: 1 }]);
      setMostrarCredenciales(false);
    } else {
      alert('Usuario o contraseña incorrectos.');
    }
  };

  const handleOrigenChange = (e) => {
    setOrigen(e.target.value);
    setDestino('');
  };

  const getDestinos = () => {
    return almacenes.filter((almacen) => almacen.CCODIGOALMACEN !== origen);
  };

  const handleProductoChange = (index, value) => {
    const nuevosProductos = [...productos];
    nuevosProductos[index].producto = value;
    setProductos(nuevosProductos);
  };

  const agregarProducto = () => {
    setProductos([...productos, { producto: '', cantidad: 1 }]);
  };

  const eliminarProducto = (index) => {
    const nuevosProductos = productos.filter((_, i) => i !== index);
    setProductos(nuevosProductos);
  };

  const productosFiltrados = productosDisponibles.filter((producto) =>
    producto.CNOMBREPRODUCTO.toLowerCase().includes(filtroProductos.toLowerCase())
  );

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
                {almacenes.map((almacen) => (
                  <option key={almacen.CIDALMACEN} value={almacen.CCODIGOALMACEN}>
                    {almacen.CNOMBREALMACEN}
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
                {getDestinos().map((almacen) => (
                  <option key={almacen.CIDALMACEN} value={almacen.CCODIGOALMACEN}>
                    {almacen.CNOMBREALMACEN}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.button}>
              <button type="button" onClick={() => setPaso(2)} disabled={!origen || !destino}>
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
                <select
                  className={styles.select}
                  value={producto.producto}
                  onChange={(e) => handleProductoChange(index, e.target.value)}
                >
                  <option value="">Seleccione un producto</option>
                  {productosFiltrados.map((prod) => (
                    <option key={prod.CIDPRODUCTO} value={prod.CNOMBREPRODUCTO}>
                      {prod.CNOMBREPRODUCTO}
                    </option>
                  ))}
                </select>
                <input
                  className={styles.input}
                  type="number"
                  placeholder="Cantidad"
                  value={producto.cantidad}
                  onChange={(e) =>
                    setProductos((prev) =>
                      prev.map((p, i) =>
                        i === index ? { ...p, cantidad: e.target.value } : p
                      )
                    )
                  }
                  min="1"
                />
                <button type="button" onClick={() => eliminarProducto(index)}>
                  Eliminar
                </button>
              </div>
            ))}
            <div className={styles.button}>
              <button type="button" onClick={agregarProducto}>
                Agregar Producto
              </button>
              <button type="button" onClick={() => setPaso(1)}>
                Anterior
              </button>
              <button type="button" onClick={() => setPaso(3)}>
                Siguiente
              </button>
            </div>
          </form>
        )}
        {paso === 3 && (
          <div className={styles.formulario}>
            <h3 className={styles.tituloH3}>Paso 3: Confirmación del Pedido</h3>
            <p><strong>Origen:</strong> {origen}</p>
            <p><strong>Destino:</strong> {destino}</p>
            <h4>Productos seleccionados:</h4>
            <ul>
              {productos.map((prod, index) => (
                <li key={index}>
                  {prod.producto} - Cantidad: {prod.cantidad}
                </li>
              ))}
            </ul>
            {mostrarCredenciales ? (
              <div>
                <label>Usuario:</label>
                <input
                  type="text"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  className={styles.input}
                />
                <label>Contraseña:</label>
                <input
                  type="password"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  className={styles.input}
                />
                <div className={styles.button}>
                  <button type="button" onClick={confirmarPedido}>
                    Confirmar Pedido
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.button}>
                <button type="button" onClick={() => setPaso(2)}>
                  Anterior
                </button>
                <button type="button" onClick={() => setMostrarCredenciales(true)}>
                  Continuar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PedidoNuevo;
