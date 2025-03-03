const crypto = require('crypto');

const password = 'inventariosPass'; // Asegúrate de que sea exactamente la misma usada en SQL Server
const hashedPassword = crypto.createHash('sha256').update(password).digest('hex').toUpperCase();

console.log('🔑 Hash en Node.js:', hashedPassword);
