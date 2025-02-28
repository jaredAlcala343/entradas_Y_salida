import React, { useState, useEffect } from "react";

const PedidoNuevo = () => {
  const [almacenes, setAlmacenes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [ultimoPedidoID, setUltimoPedidoID] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [almRes, prodRes] = await Promise.all([
          fetch("/api/almacenes"),
          fetch("/api/Productos"),
        ]);

        if (!almRes.ok || !prodRes.ok) throw new Error("Error al cargar datos iniciales");

        const almData = await almRes.json();
        const prodData = await prodRes.json();

        setAlmacenes(almData);
        setProductos(prodData);
      } catch (error) {
        console.error("❌ Error al cargar los datos iniciales:", error);
        alert("Error al cargar los datos iniciales.");
      }
    };

    fetchData();

    const intervalId = setInterval(() => {
      obtenerPedidos();
    }, 1800000);

    return () => clearInterval(intervalId);
  }, []);

  const obtenerPedidos = async () => {
    try {
      const res = await fetch("/api/obtener-pedidos", { method: "GET" });

      if (!res.ok) throw new Error("Error al obtener los pedidos");

      const pedidos = await res.json();
      if (!pedidos.length) return;

      for (const pedido of pedidos) {
        if (ultimoPedidoID !== null && pedido.CFOLIO <= ultimoPedidoID) {
          continue;
        }

        const nuevoPedido = {
          TipoMovimiento: pedido.CNOMBRECONCEPTO || "Desconocido",
          NumeroPedido: pedido.CFOLIO || "00000",
          Producto: pedido.CIDPRODUCTO
            ? [
                {
                  ProductoID: pedido.CIDPRODUCTO,
                  Unidades: pedido.CUNIDADES || 1,
                  NombreProducto: pedido.CNOMBREPRODUCTO || "Sin Nombre",
                  CodigoProducto: pedido.CCODIGOPRODUCTO || "Sin Código",
                },
              ]
            : [],
          Origen: pedido.OrigenCodigo || "Almacén Desconocido",
          Destino: pedido.DestinoCodigo || "Destino Desconocido",
          Fecha_Creacion: pedido.CFECHA || new Date().toISOString().split("T")[0],
          Fecha_Compromiso: new Date(new Date().setDate(new Date().getDate() + 15))
            .toISOString()
            .split("T")[0],
        };

        await registrarPedido(nuevoPedido);
        setUltimoPedidoID(pedido.CFOLIO);
      }
    } catch (error) {
      console.error("❌ Error al obtener los pedidos:", error);
    }
  };

  const registrarPedido = async (pedido) => {
    console.log("📦 Datos enviados al backend:", JSON.stringify(pedido, null, 2));

    try {
      // 1️⃣ Insertar el pedido en la base de datos
      const resInsert = await fetch("/api/insertar-movimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedido),
      });

      const responseInsertText = await resInsert.text();
      console.log("🔍 Respuesta de insertar movimiento:", responseInsertText);

      if (!resInsert.ok) {
        throw new Error(`Error en insertar-movimiento - Status: ${resInsert.status} - Mensaje: ${responseInsertText}`);
      }

      console.log(`✅ Pedido registrado: ${pedido.NumeroPedido}`);

      // 2️⃣ Enviar el correo
      const resCorreo = await fetch("/api/enviar-correo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedido),
      });

      const responseCorreoText = await resCorreo.text();
      console.log("📧 Respuesta de enviar-correo:", responseCorreoText);

      if (!resCorreo.ok) {
        throw new Error(`Error en enviar-correo - Status: ${resCorreo.status} - Mensaje: ${responseCorreoText}`);
      }

      console.log(`📨 Correo enviado con éxito para el pedido ${pedido.NumeroPedido}`);

    } catch (error) {
      console.error("❌ Error en el proceso de registrar pedido:", error);
    }
  };

  return null; // Si este componente no tiene UI, mantenerlo así
};

export default PedidoNuevo;
