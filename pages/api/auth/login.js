import { connectToDatabase, sql } from '../../../dbconfig';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    // Manejo del login
    const { username, password } = req.body;

    try {
      const pool = await connectToDatabase();
      const result = await pool.request()
        .input('username', sql.VarChar, username.trim()) // Asegúrate de que el nombre del parámetro coincida y elimina espacios en blanco
        .query('SELECT * FROM Usuarios WHERE correo = @username');
    
      if (result.recordset.length === 0) {
        return res.status(401).json({ message: 'Invalid username' });
      }

      const user = result.recordset[0];

      // Verificar que user.contrasena no sea undefined
      if (!user.contraseña) {
        return res.status(401).json({ message: 'Invalid password' });
      }

      // Comparar la contraseña en texto plano (no recomendado para producción)
      const passwordIsValid = user.contraseña.trim() === password.trim();

      if (!passwordIsValid) {
        return res.status(401).json({ message: 'Invalid password' });
      }

      const token = jwt.sign(
        { id: user.id_usuario, name: user.nombre, area: user.rol, puesto: user.Puesto },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const userData = {
        token,
        name: user.nombre, // Asegúrate de que el campo coincida con el nombre exacto en la base de datos
        rol: user.rol, // Incluye el rol en la respuesta
      };
      console.log(userData);
      res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=3600`);
      return res.status(200).json({ message: 'Login successful', redirectUrl: '/dashboard', userData });
    } catch (error) {
      console.error('Login error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  } else if (req.method === 'GET') {
    // Manejo para obtener el nombre del usuario basado en username
    const { username } = req.query;

    try {
      const pool = await connectToDatabase();
      const result = await pool.request()
        .input('username', sql.VarChar, username.trim())
        .query('SELECT nombre FROM Usuarios WHERE correo = @username');

      if (result.recordset.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const user = result.recordset[0];

      console.log(user);
      return res.status(200).json({ userData: user });
    } catch (error) {
      console.error('Error fetching user:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}
