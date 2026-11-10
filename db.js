const Database = require('sqlite3').Database;
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.db');
const db = new Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

module.exports = db;
