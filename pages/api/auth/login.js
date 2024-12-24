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
        .input('username', sql.VarChar, username)
        .query('SELECT * FROM dbo.UsuariosLocal WHERE Nombre = @username');

      if (result.recordset.length === 0) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }

      const user = result.recordset[0];

      const passwordIsValid = user.Clave === password;

      if (!passwordIsValid) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }

      const token = jwt.sign(
        { id: user.Id, name: user.Nombre, area: user.Area, puesto: user.Puesto },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const userData = {
        token,
        name: user.Nombre,
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
        .input('username', sql.VarChar, username)
        .query('SELECT Nombre FROM dbo.Usuarios WHERE NumeroEmpleado = @username');

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
