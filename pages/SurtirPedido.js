import React, { useState, useEffect } from "react";
import styles from "./SurtirPedido.module.css";
import Navbar from "./navbar";

const PanelSurtir = () => {
  const [codigoPedido, setCodigoPedido] = useState("");
  const [pedidoInfo, setPedidoInfo] = useState(null);
  const [productosEscaneados, setProductosEscaneados] = useState({});
  const [codigoManual, setCodigoManual] = useState("");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [pedidoSurtido, setPedidoSurtido] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autenticacionPendiente, setAutenticacionPendiente] = useState(false);
  const [mensajeError, setMensajeError] = useState("");

  // 🔹 Buscar pedido en la base de datos
  const buscarPedido = async () => {
    if (!codigoPedido.trim()) {
      alert("⚠️ Ingresa un código de pedido válido.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/sPedido?numeroPedido=${codigoPedido}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Error al buscar el pedido");

      setPedidoInfo({ codigo: codigoPedido, productos: data });

      // 🔹 Inicializar conteo de productos escaneados
      const conteoInicial = {};
      data.forEach((p) => (conteoInicial[p.CCODIGOPRODUCTO] = 0));
      setProductosEscaneados(conteoInicial);

      setAutenticacionPendiente(false);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Verificar producto en la base de datos y actualizar conteo
  const verificarProducto = async (codigoProducto) => {
    if (!pedidoInfo) return;

    try {
      const response = await fetch(`/api/verificarProducto?numeroPedido=${codigoPedido}&codigoProducto=${codigoProducto}`);
      const data = await response.json();

      if (!response.ok || !data.existe) {
        alert("⚠️ Código no pertenece al pedido.");
        return;
      }

      setProductosEscaneados((prev) => {
        const nuevosEscaneos = { ...prev };

        if (!nuevosEscaneos[codigoProducto]) nuevosEscaneos[codigoProducto] = 0;
        nuevosEscaneos[codigoProducto]++;

        // 🔹 Verificar si se completaron todas las unidades de este producto
        const producto = pedidoInfo.productos.find((p) => p.CCODIGOPRODUCTO === codigoProducto);
        if (nuevosEscaneos[codigoProducto] >= producto.Unidades) {
          alert(`✅ Se completaron todas las unidades de ${producto.CNOMBREPRODUCTO}`);
        }

        // 🔹 Verificar si se escanearon todos los productos
        const todosEscaneados = pedidoInfo.productos.every(
          (p) => nuevosEscaneos[p.CCODIGOPRODUCTO] >= p.Unidades
        );

        if (todosEscaneados) {
          alert("✅ Todos los productos han sido escaneados.");
          setAutenticacionPendiente(true);
        }

        return nuevosEscaneos;
      });
    } catch (error) {
      console.error("Error al verificar producto:", error);
    }
  };

  // 🔹 Escaneo con enter automático
  const handleCodigoEscaneado = (codigo) => {
    verificarProducto(codigo);
  };

  // 🔹 Ingreso manual con "Enter"
  const handleCodigoManual = (e) => {
    if (e.key === "Enter") {
      verificarProducto(codigoManual.trim());
      setCodigoManual("");
    }
  };

  return (
    <div>
      <Navbar />
      <div className={styles.panelContainer}>
        <h3>Panel de Surtir Pedidos</h3>

        {!pedidoInfo ? (
          <div>
            <h4>Ingresa o Escanea el Código del Pedido</h4>
            <input
              type="text"
              placeholder="Código de Pedido"
              value={codigoPedido}
              onChange={(e) => setCodigoPedido(e.target.value)}
            />
            <button onClick={buscarPedido} disabled={loading}>
              {loading ? "Buscando..." : "Buscar Pedido"}
            </button>
          </div>
        ) : (
          <div>
            <h4>Pedido: {pedidoInfo.codigo}</h4>
            <ul>
              {pedidoInfo.productos.map((producto, index) => (
                <li key={index}>
                  {producto.CNOMBREPRODUCTO} - Cantidad: {producto.Unidades} - Escaneados:{" "}
                  {productosEscaneados[producto.CCODIGOPRODUCTO] || 0}
                </li>
              ))}
            </ul>

            {!pedidoSurtido && (
              <div>
                <h5>Escanea un producto o ingrésalo manualmente:</h5>
                <input
                  type="text"
                  placeholder="Ingrese código"
                  value={codigoManual}
                  onChange={(e) => setCodigoManual(e.target.value)}
                  onKeyDown={handleCodigoManual}
                />
              </div>
            )}

            {autenticacionPendiente && (
              <div>
                <h4>Ingrese sus credenciales para confirmar el pedido</h4>
                <input type="text" placeholder="Usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
                <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
                {mensajeError && <p className={styles.error}>{mensajeError}</p>}
                <button onClick={() => alert("Aquí se validará el usuario")} disabled={loading}>
                  {loading ? "Validando..." : "Confirmar Surtido"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PanelSurtir;
