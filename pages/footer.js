
import React from 'react';

const Footer = () => {
  return (
    <footer style={styles.footer}>
      <p>&copy; {new Date().getFullYear()} Inventarios. Todos los derechos reservados.</p>
    </footer>
  );
};

const styles = {
  footer: {
    backgroundColor: '#053160', // Fondo oscuro
    color: '#fff', // Texto blanco
    textAlign: 'center', // Centrar el texto
    padding: '20px 0', // Espaciado alrededor del texto
    position: 'relative', // Mantener el footer en su lugar al final del contenido
    width: '100%', // Ancho completo
    bottom: '-10px', // Alineación al fondo
  },
};

export default Footer;
