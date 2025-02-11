"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Navbar from "./navbar";
import styles from "./dashboard.module.css";
import { Bar } from "react-chartjs-2";
import Footer from "./footer";
import "chart.js/auto";

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    inProgressOrders: 0,
    completedOrders: 0,
    overdueOrders: 0,
  });

  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [],
  });

  const [topProductsData, setTopProductsData] = useState({
    labels: [],
    datasets: [],
  });

  const [productCodes, setProductCodes] = useState([]); // Nuevo estado para almacenar los códigos de producto

  useEffect(() => {
    fetch("/api/metrics")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Error en la API");
        }
        return response.json();
      })
      .then((data) => {
        console.log("Métricas recibidas:", data);
        setMetrics(data);
        setChartData({
          labels: ["Pendientes", "En Proceso", "Completados", "Atrasados"],
          datasets: [
            {
              label: "Pedidos",
              data: [
                data.pendingOrders,
                data.inProgressOrders,
                data.completedOrders,
                data.overdueOrders,
              ],
              backgroundColor: ["#FF6384", "#36A2EB", "#4BC0C0", "#FF9F40"],
            },
          ],
        });
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error al cargar las métricas:", error);
        setError(error.message);
        setLoading(false);
      });

    // Obtener los productos más pedidos con sus códigos
    fetch("/api/top-products")
      .then((response) => response.json())
      .then((data) => {
        console.log("Productos más pedidos:", data);
        setTopProductsData({
          labels: data.map((item) => item.CCODIGOPRODUCTO),
          datasets: [
            {
              label: "Unidades Pedidas",
              data: data.map((item) => item.totalUnidades),
              backgroundColor: "#4BC0C0",
            },
          ],
        });
      })
      .catch((error) => {
        console.error("Error al cargar productos más pedidos:", error);
      });
  }, []);

  const handleActionRedirect = (route) => {
    router.push(route);
  };

  if (loading) {
    return <p className={styles.loading}>Cargando métricas...</p>;
  }

  if (error) {
    return <p className={styles.error}>Error al cargar datos: {error}</p>;
  }

  return (
    <div>
      <Navbar />
      <h1 className={styles.title}>Dashboard - Pedidos de Almacén</h1>

      <div className={styles.metricButtons}>
        <button className={styles.metricButton}>
          <h2>Total de Pedidos</h2>
          <p>{metrics.totalOrders}</p>
        </button>
        <button className={styles.metricButton}>
          <h2>Pendientes</h2>
          <p>{metrics.pendingOrders}</p>
        </button>
        <button className={styles.metricButton}>
          <h2>En Proceso</h2>
          <p>{metrics.inProgressOrders}</p>
        </button>
        <button className={styles.metricButton}>
          <h2>Completados</h2>
          <p>{metrics.completedOrders}</p>
        </button>
        <button className={styles.metricButton}>
          <h2>Atrasados</h2>
          <p>{metrics.overdueOrders}</p>
        </button>
      </div>

      <div className={styles.actionButtons}>
        <button onClick={() => handleActionRedirect("/PedidoNuevo")} className={styles.actionButton}>
          Nuevo Pedido
        </button>
        <button onClick={() => handleActionRedirect("/SurtirPedido")} className={styles.actionButton}>
          Surtir Pedido
        </button>
        <button onClick={() => handleActionRedirect("/EntregaDomicilio")} className={styles.actionButton}>
          Inventarios
        </button>
        <button onClick={() => handleActionRedirect("/RecibirPedido")} className={styles.actionButton}>
         Recibir Pedido
        </button>
      </div>

      <div className={styles.chartBoxes}>
        <div className={styles.box}>
          <h2>Órdenes por Estado</h2>
          <Bar data={chartData} />
        </div>
        
        <div className={styles.box}>
          <h2>Productos Más Pedidos</h2>
          <Bar data={topProductsData} />
        </div>
      </div>

      <Footer />
    </div>
  );
}
