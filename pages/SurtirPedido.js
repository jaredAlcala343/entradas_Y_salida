import React, { useState } from 'react';
import BarcodeReader from 'react-barcode-reader';
import styles from './SurtirPedido.module.css';
import Navbar from './navbar';

const PanelSurtir = () => {
  const [codigoPedido, setCodigoPedido] = useState('');
  const [pedidoInfo, setPedidoInfo] = useState(null);
  const [productoIndex, setProductoIndex] = useState(0);
  const [productosEscaneados, setProductosEscaneados] = useState([]);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [pedidoSurtido, setPedidoSurtido] = useState(false);

  // Simulando base de datos de pedidos
  const pedidos = [
    {
      codigo: 'PED12345',
      productos: [
        { nombre: 'Producto A', cantidad: 3, codigo: 'A123' },
        { nombre: 'Producto B', cantidad: 5, codigo: 'B123' },
      ],
    },
    {
      codigo: 'PED67890',
      productos: [
        { nombre: 'Producto C', cantidad: 2, codigo: 'C123' },
        { nombre: 'Producto D', cantidad: 7, codigo: 'D123' },
      ],
    },
  ];

  const buscarPedido = () => {
    const pedido = pedidos.find((p) => p.codigo === codigoPedido);
    if (pedido) {
      setPedidoInfo(pedido);
      setProductosEscaneados([]); // Reiniciar los productos escaneados
    } else {
      alert('Pedido no encontrado');
    }
  };

  const handleCodigoEscaneado = (data) => {
    if (data) {
      const currentProducto = pedidoInfo.productos[productoIndex];
      if (data === currentProducto.codigo) {
        const nuevoEscaneo = productosEscaneados.concat(data);
        setProductosEscaneados(nuevoEscaneo);

        // Verificar si todos los productos han sido escaneados
        const totalProductosEscaneados = nuevoEscaneo.filter(
          (codigo) => codigo === currentProducto.codigo
        ).length;

        if (totalProductosEscaneados === currentProducto.cantidad) {
          if (productoIndex + 1 < pedidoInfo.productos.length) {
            setProductoIndex(productoIndex + 1); // Pasar al siguiente producto
          } else {
            alert('Todos los productos han sido escaneados correctamente.');
          }
        }
      }
    }
  };

  const surtirPedido = () => {
    if (usuario && password) {
      // Aquí puedes integrar un sistema real de autenticación
      alert('Pedido surtido correctamente');
      setPedidoSurtido(true);

      // Reiniciar el estado del formulario
      setCodigoPedido('');
      setPedidoInfo(null);
      setProductoIndex(0);
      setProductosEscaneados([]);
      setUsuario('');
      setPassword('');
    } else {
      alert('Por favor ingresa usuario y contraseña');
    }
  };

  return (
    <div>
      <Navbar />
      <div className={styles.panelContainer}>
        <h3>Panel de Surtir Pedidos</h3>

        {/* Paso 1: Ingreso o Escaneo del Código del Pedido */}
        {!pedidoInfo ? (
          <div>
            <h4>Ingresa o Escanea el Código del Pedido</h4>
            <input
              type="text"
              placeholder="Código de Pedido"
              value={codigoPedido}
              onChange={(e) => setCodigoPedido(e.target.value)}
            />
            <button onClick={buscarPedido}>Buscar Pedido</button>
          </div>
        ) : (
          // Paso 2: Mostrar Información del Pedido
          <div>
            <h4>Pedido: {pedidoInfo.codigo}</h4>
            <h5>Productos:</h5>
            <ul>
              {pedidoInfo.productos.map((producto, index) => (
                <li key={index}>
                  {producto.nombre} - Cantidad: {producto.cantidad}
                </li>
              ))}
            </ul>

            {/* Paso 3: Escaneo de Productos */}
            {productoIndex < pedidoInfo.productos.length && !pedidoSurtido && (
              <div>
                <h5>Escanea el Código de Barras para {pedidoInfo.productos[productoIndex].nombre}</h5>
                <BarcodeReader onScan={handleCodigoEscaneado} />
                <p>
                  Escaneados:{" "}
                  {
                    productosEscaneados.filter(
                      (codigo) =>
                        codigo === pedidoInfo.productos[productoIndex].codigo
                    ).length
                  }{" "}
                  de {pedidoInfo.productos[productoIndex].cantidad}
                </p>
              </div>
            )}

            {/* Paso 4: Confirmación de Surtido */}
            {productoIndex === pedidoInfo.productos.length && (
              <div>
                <h4>Confirmar Surtido del Pedido</h4>
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
                <button onClick={surtirPedido}>Surtir Pedido</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PanelSurtir;
