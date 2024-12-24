import { useEffect, useState } from 'react';
import { useRouter } from 'next/router'; // Importar useRouter
import Navbar from './navbar'; // Navbar común
import styles from './dashboard.module.css'; // Tus estilos
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  LineElement,
  PointElement,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import Footer from './footer';

// Registrar componentes de Chart.js
ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, LineElement, PointElement);

export default function Dashboard() {
  const router = useRouter(); // Inicializar useRouter

  const [metrics, setMetrics] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    inProgressOrders: 0,
    completedOrders: 0,
    criticalStock: 0,
  });

  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [],
  });

  const [inventoryChart, setInventoryChart] = useState({
    labels: [],
    datasets: [],
  });

  useEffect(() => {
    // Datos locales para la demostración
    const demoMetrics = {
      totalOrders: 120,
      pendingOrders: 25,
      inProgressOrders: 15,
      completedOrders: 80,
      criticalStock: 5,
    };

    const ordersByStatus = {
      labels: ['Pendientes', 'En Proceso', 'Completados'],
      datasets: [
        {
          label: 'Órdenes',
          data: [25, 15, 80], // Datos locales
          backgroundColor: ['#FF6384', '#36A2EB', '#4BC0C0'],
        },
      ],
    };

    const inventoryData = {
      labels: ['Producto A', 'Producto B', 'Producto C', 'Producto D', 'Producto E'],
      datasets: [
        {
          label: 'Stock Actual',
          data: [10, 3, 50, 7, 15],
          backgroundColor: ['#FF9F40', '#FF6384', '#36A2EB', '#4BC0C0', '#9966FF'],
        },
      ],
    };

    setMetrics(demoMetrics);
    setChartData(ordersByStatus);
    setInventoryChart(inventoryData);
  }, []);

  // Funciones para manejar las redirecciones
  const handleNewOrder = () => {
    router.push('/PedidoNuevo'); // Redirigir a la página de Nuevo Pedido
  };

  const handleReceiveOrder = () => {
    router.push('/RecibirPedido'); // Redirigir a la página de Recibir Pedido
  };

  const handleHomeDelivery = () => {
    router.push('/EntregaDomicilio'); // Redirigir a la página de Entrega a Domicilio
  };
  const handleTakeAction = () => {
    router.push('/SurtirPedido'); // Redirigir a la página de Tomar Acciones
  };
  return (
    <div>
      <Navbar />
      <h1 className={styles.title}>Dashboard - Pedidos de Almacén</h1>

      {/* Métricas clave en botones horizontales */}
      <div className={styles.metricButtons}>
        <button className={styles.metricButton}>
          <h2>Pedidos Totales</h2>
          <p>{metrics.totalOrders}</p>
        </button>
        <button className={styles.metricButton}>
          <h2>Pedidos Pendientes</h2>
          <p>{metrics.pendingOrders}</p>
        </button>
        <button className={styles.metricButton}>
          <h2>Pedidos en Proceso</h2>
          <p>{metrics.inProgressOrders}</p>
        </button>
        <button className={styles.metricButton}>
          <h2>Pedidos Completados</h2>
          <p>{metrics.completedOrders}</p>
        </button>
        <button className={styles.metricButton}>
          <h2>Stock Crítico</h2>
          <p>{metrics.criticalStock}</p>
        </button>
      </div>

      {/* Botones de acción */}
      <div className={styles.actionButtons}>
        <button className={styles.actionButton} onClick={handleNewOrder}>
          Nuevo Pedido
        </button>
        <button className={styles.actionButton} onClick={handleReceiveOrder}>
          Recibir Pedido
        </button>
        <button className={styles.actionButton} onClick={handleHomeDelivery}>
          Hacer Entrega a Domicilio
        </button>
        <button className={styles.actionButton} onClick={handleTakeAction}>
          Surtir Pedido
        </button>
      </div>

      {/* Boxes con gráficas */}
      <div className={styles.chartBoxes}>
        <div className={styles.box}>
          <h2>Órdenes por Estado</h2>
          {chartData.labels.length > 0 && <Bar data={chartData} />}
        </div>
        <div className={styles.box}>
          <h2>Inventario por Producto</h2>
          {inventoryChart.labels.length > 0 && <Bar data={inventoryChart} />}
        </div>
        <div className={styles.box}>
          <h2>Pedidos por Día</h2>
          <Line
            data={{
              labels: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
              datasets: [
                {
                  label: 'Pedidos',
                  data: [20, 35, 40, 25, 50, 60, 45],
                  borderColor: '#36A2EB',
                  backgroundColor: 'rgba(54, 162, 235, 0.2)',
                  tension: 0.3,
                  fill: true,
                },
              ],
            }}
          />
        </div>
      </div>
      <Footer />
    </div>
  );
}
