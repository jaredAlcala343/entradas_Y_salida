import { useState } from 'react';
import Image from "next/image";
import { useRouter } from 'next/navigation';
import styles from './signin.module.css';

export default function SignIn() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (response.ok && data.redirectUrl) {
      localStorage.setItem('username', username); // Guardar username en localStorage
      localStorage.setItem('name', data.userData.name); // Guardar nombre del usuario en localStorage
      router.push(data.redirectUrl);
    } else {
      alert(data.message || 'Login failed');
    }
  };

  return (
    <div className={styles.loginContainer}>
      <form onSubmit={handleSubmit} className={styles.loginForm}>
        <h1>BIENVENIDO A CONTROL DE INVENTARIOS</h1>
        <h4>POR FAVOR INGRESE SUS CREDENCIALES</h4>

        <label>
          Numero de Empleado:
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Contraseña:
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit">Login</button>
      </form>
      <div className={styles.loginImage}>
      <Image
        className={styles.loginImage}
        src="/inicio.jpg"
        alt="Imagen de inicio"
        width={650}
        height={400}
      />
      </div>
    </div>
  );
}
