import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Navbar from './navbar';
import styles from './dashboard.module.css';
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
  const router = useRouter();

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

  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

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
          data: [25, 15, 80],
          backgroundColor: ['#FF6384', '#36A2EB', '#4BC0C0'],
        },
      ],
    };

    setMetrics(demoMetrics);
    setChartData(ordersByStatus);

    // Cargar datos reales de inventario desde el backend
    fetch('/api/data?type=inventario')
      .then((response) => response.json())
      .then((data) => {
        setProducts(data); // Guardar todos los productos

        // Si hay productos en la base de datos, seleccionar todos por defecto
        const allProductCodes = data.map((item) => item.CodigoProducto);
        setSelectedProducts(allProductCodes);

        // Filtrar los productos seleccionados
        const filteredProducts = data.filter((item) => allProductCodes.includes(item.CodigoProducto));
        const labels = filteredProducts.map((item) => item.CodigoProducto);
        const stockData = filteredProducts.map((item) => item.Stock);

        setInventoryChart({
          labels,
          datasets: [
            {
              label: 'Stock Actual',
              data: stockData,
              backgroundColor: '#36A2EB',
            },
          ],
        });
      })
      .catch((error) => {
        console.error('Error al cargar el inventario:', error);
      });
  }, []);

  useEffect(() => {
    if (selectedProducts.length > 0) {
      // Filtrar los productos seleccionados
      const selectedProductData = products.filter((item) => selectedProducts.includes(item.CodigoProducto));

      const labels = selectedProductData.map((item) => item.CodigoProducto);
      const stockData = selectedProductData.map((item) => item.Stock);

      setInventoryChart({
        labels,
        datasets: [
          {
            label: 'Stock Actual',
            data: stockData,
            backgroundColor: '#36A2EB',
          },
        ],
      });
    }
  }, [selectedProducts, products]); // Actualizar la gráfica cuando se seleccionan productos



  // Funciones para manejar las redirecciones
  const handleNewOrder = () => {
    router.push('/PedidoNuevo');
  };

  const handleReceiveOrder = () => {
    router.push('/RecibirPedido');
  };

  const handleHomeDelivery = () => {
    router.push('/EntregaDomicilio');
  };

  const handleTakeAction = () => {
    router.push('/SurtirPedido');
  };



  const handleSearch = (event) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  const handleProductSelection = (e) => {
    const selected = Array.from(e.target.selectedOptions, (option) => option.value);
    setSelectedProducts(selected);
  };

  const filteredProducts = products.filter((product) =>
    product.CodigoProducto.toLowerCase().includes(searchQuery) || product.CNombreProducto.toLowerCase().includes(searchQuery)
  );

  // Función para manejar los clics en los botones de acción
 

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

        {/* Inventario por Producto - Box con Buscador */}
        <div className={styles.box}>
          <h2>Inventario por Producto</h2>

          {/* Buscador dentro del box */}
          <div className={styles.searchContainer}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Buscar por Código o Nombre de Producto..."
              value={searchQuery}
              onChange={handleSearch}
            />
          </div>

          {/* Gráfica de Inventario */}
          {filteredProducts.length > 0 && (
            <>
              <select
                id="productSelect"
                multiple
                value={selectedProducts}
                onChange={handleProductSelection}
                className={styles.productSelect}
              >
                {filteredProducts.map((product) => (
                  <option key={product.CodigoProducto} value={product.CodigoProducto}>
                    {product.CodigoProducto} - {product.CNombreProducto}
                  </option>
                ))}
              </select>
              <Bar
                data={{
                  labels: filteredProducts.map((item) => item.CodigoProducto),
                  datasets: [
                    {
                      label: 'Stock Actual',
                      data: filteredProducts.map((item) => item.Stock),
                      backgroundColor: '#36A2EB',
                    },
                  ],
                }}
              />
            </>
          )}
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
