import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHomeLg, faShoppingCart, faSignOut, faBars } from '@fortawesome/free-solid-svg-icons'; // Icono de menú hamburguesa
import styles from './navbar.module.css';

const Navbar = () => {
  const [name, setName] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Estado para controlar la visibilidad del menú

  // Leer el nombre del usuario desde el localStorage
  useEffect(() => {
    const storedName = localStorage.getItem('name');
    if (storedName) {
      setName(storedName);
    }
  }, []);

  // Función para cerrar sesión
  const handleLogout = () => {
    localStorage.removeItem('username');
    localStorage.removeItem('name');
    window.location.href = '/'; // Redirigir al login
  };

  // Función para alternar el menú
  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <nav className={styles.navbar}>
      <span className={styles.navbarBrand}>CUBYLAM & CHALET</span>

      {/* Botón de menú en pantallas pequeñas */}
      <button className={styles.menuButton} onClick={toggleMenu}>
        <FontAwesomeIcon icon={faBars} />
      </button>

      {/* Menú de navegación */}
      <div className={`${styles.navbarNav} ${isMenuOpen ? styles.showMenu : ''}`}>
        {name ? (
          <>
            <span className={styles.navLink}>Hola, {name}</span>
            <Link href="/dashboard">
              <p className={styles.cartLink}>
                <FontAwesomeIcon icon={faHomeLg} />
              </p>
            </Link>
            <Link href="/">
              <p className={styles.cartLink} onClick={handleLogout}>
                <FontAwesomeIcon icon={faSignOut} />
              </p>
            </Link>
          </>
        ) : (
          <Link href="/signin">
            <button className={`${styles.button} ${styles.loginButton}`}>Iniciar sesión</button>
          </Link>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
