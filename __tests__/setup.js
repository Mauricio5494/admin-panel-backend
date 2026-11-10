const path = require('path');
const fs = require('fs');

// Usar base de datos en memoria para las pruebas
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test_secret_clave_de_pruebas';

// Limpiar base de datos de prueba anterior si existe
const dbFile = path.join(__dirname, '..', 'test-database.db');
if (fs.existsSync(dbFile)) {
  fs.unlinkSync(dbFile);
}
