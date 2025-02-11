import React, { useState } from "react";
import styles from "./EntregaDomicilio.module.css";
import Navbar from "./navbar";

const Inventario = () => {
  const [nombreInventario, setNombreInventario] = useState("");
  const [usuarioID, setUsuarioID] = useState("");
  const [almacenID, setAlmacenID] = useState("");
  const [inventarioID, setInventarioID] = useState("");
  const [productoID, setProductoID] = useState("");
  const [unidades, setUnidades] = useState("");
  const [conteoProductos, setConteoProductos] = useState([]);

  // Crear un nuevo inventario
  const crearInventario = async () => {
    try {
      const res = await fetch("/api/crear-inventario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          NombreInventario: nombreInventario,
          UsuarioID: usuarioID,
          AlmacenID: almacenID,
        }),
      });

      if (!res.ok) {
        alert("Error al crear el inventario");
        return;
      }

      const data = await res.json();
      alert("Inventario creado exitosamente");
      setInventarioID(data.IDInventario); // Guardar el ID del inventario creado
    } catch (error) {
      console.error("Error al crear el inventario:", error);
      alert("Hubo un error al crear el inventario");
    }
  };

  // Escanear un producto
  const escanearProducto = async () => {
    try {
      const res = await fetch("/api/escanear-producto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          InventarioID: inventarioID,
          ProductoID: productoID,
          Unidades: unidades,
          AlmacenID: almacenID,
        }),
      });

      if (!res.ok) {
        alert("Error al escanear el producto");
        return;
      }

      alert("Producto escaneado exitosamente");
      setProductoID("");
      setUnidades("");
    } catch (error) {
      console.error("Error al escanear el producto:", error);
      alert("Hubo un error al escanear el producto");
    }
  };

  // Obtener el conteo de productos
  const obtenerConteoProductos = async () => {
    try {
      const res = await fetch(`/api/conteo-productos?InventarioID=${inventarioID}`);
      if (!res.ok) {
        alert("Error al obtener el conteo de productos");
        return;
      }

      const data = await res.json();
      setConteoProductos(data);
    } catch (error) {
      console.error("Error al obtener el conteo de productos:", error);
      alert("Hubo un error al obtener el conteo de productos");
    }
  };

  return (
    <div>
      <Navbar />
      <div className={styles.container}>
        <h1 className={styles.title}>Gestión de Inventarios</h1>

        {/* Crear un nuevo inventario */}
        <div className={styles.panelContainer}>
          <h2>Crear Nuevo Inventario</h2>
          <input
            type="text"
            placeholder="Nombre del Inventario"
            value={nombreInventario}
            onChange={(e) => setNombreInventario(e.target.value)}
          />
          <input
            type="text"
            placeholder="ID Usuario"
            value={usuarioID}
            onChange={(e) => setUsuarioID(e.target.value)}
          />
          <input
            type="text"
            placeholder="ID Almacén"
            value={almacenID}
            onChange={(e) => setAlmacenID(e.target.value)}
          />
          <button onClick={crearInventario}>Crear Inventario</button>
        </div>

        {/* Revisar discrepancias de inventarios */}
        <div className={styles.panelContainer}>
          <h2>Revisar Discrepancias de Inventarios</h2>
          <button onClick={obtenerConteoProductos}>Obtener Conteo</button>
          <table>
            <thead>
              <tr>
                <th>ID Producto</th>
                <th>Nombre</th>
                <th>Unidades</th>
              </tr>
            </thead>
            <tbody>
              {conteoProductos.map((producto, index) => (
                <tr key={index}>
                  <td>{producto.CIDPRODUCTO}</td>
                  <td>{producto.CNOMBRE_PRODUCTO}</td>
                  <td>{producto.TotalUnidades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Agendar nuevos inventarios */}
        <div className={styles.panelContainer}>
          <h2>Agendar Nuevos Inventarios</h2>
          <input
            type="text"
            placeholder="Nombre del Inventario"
            value={nombreInventario}
            onChange={(e) => setNombreInventario(e.target.value)}
          />
          <input
            type="text"
            placeholder="ID Usuario"
            value={usuarioID}
            onChange={(e) => setUsuarioID(e.target.value)}
          />
          <input
            type="text"
            placeholder="ID Almacén"
            value={almacenID}
            onChange={(e) => setAlmacenID(e.target.value)}
          />
          <button onClick={crearInventario}>Agendar Inventario</button>
        </div>
      </div>
    </div>
  );
};

export default Inventario;
