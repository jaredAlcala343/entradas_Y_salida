// dbconfig.js
// next.config.js o dbConfig.js
require('dotenv').config();
const sql = require('mssql');

const config = {
    user: process.env.DB_USER,  // Usando la variable de entorno
    password: process.env.DB_PASSWORD,  // Usando la variable de entorno
    server: process.env.DB_SERVER,  // Usando la variable de entorno
    port: parseInt(process.env.DB_PORT),  // Usando la variable de entorno
    database: process.env.DB_DATABASE,  // Usando la variable de entorno
    options: {
        encrypt: false,  // Cambia a true si usas una conexión cifrada
        trustServerCertificate: true,  // Cambia según tus necesidades de seguridad
        connectTimeout: 3000,  // El tiempo máximo para conectar
    }
};

async function connectToDatabase() {
    try {
        const pool = await sql.connect(config);
        console.log('Connected to SQL Server');
        return pool;
    } catch (err) {
        console.error('Database Connection Failed! Bad Config: ', err);
        throw err;
    }
}

module.exports = { sql, connectToDatabase };
