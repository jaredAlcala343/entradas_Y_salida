import React, { useState } from 'react';
import styles from './Entrega.module.css';
import Navbar from './navbar';

const PanelEntregas = () => {
  const [factura, setFactura] = useState('');
  const [datosCliente, setDatosCliente] = useState(null);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [entregaConfirmada, setEntregaConfirmada] = useState(false);

  // Simulando base de datos de facturas y clientes
  const facturas = [
    {
      facturaId: 'FAC12345',
      cliente: 'Juan Pérez',
      direccion: 'Calle Falsa 123, Ciudad Ejemplo',
      telefono: '555-1234',
    },
    {
      facturaId: 'FAC67890',
      cliente: 'María López',
      direccion: 'Avenida Siempre Viva 742, Springfield',
      telefono: '555-5678',
    },
  ];

  const buscarFactura = () => {
    const facturaEncontrada = facturas.find((f) => f.facturaId === factura);
    if (facturaEncontrada) {
      setDatosCliente(facturaEncontrada);
    } else {
      alert('Factura no encontrada');
      setDatosCliente(null);
    }
  };

  const confirmarEnvio = () => {
    if (usuario && password) {
      // Aquí puedes integrar un sistema real de autenticación
      alert('Envío confirmado');
      setEntregaConfirmada(true);

      // Reiniciar el formulario después de confirmar
      setFactura('');
      setDatosCliente(null);
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
        <h3>Panel de Entregas</h3>

        {/* Paso 1: Solicitar Factura */}
        {!datosCliente ? (
          <div>
            <h4>Ingresa el Número de Factura</h4>
            <input
              type="text"
              placeholder="Número de Factura"
              value={factura}
              onChange={(e) => setFactura(e.target.value)}
            />
            <button onClick={buscarFactura}>Buscar Factura</button>
          </div>
        ) : (
          // Paso 2: Mostrar Datos del Cliente
          <div>
            <h4>Factura: {datosCliente.facturaId}</h4>
            <p><strong>Cliente:</strong> {datosCliente.cliente}</p>
            <p><strong>Dirección:</strong> {datosCliente.direccion}</p>
            <p><strong>Teléfono:</strong> {datosCliente.telefono}</p>

            {/* Paso 3: Confirmar Envío */}
            {!entregaConfirmada && (
              <div>
                <h4>Confirmar Envío</h4>
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
                <button onClick={confirmarEnvio}>Confirmar Envío</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PanelEntregas;
