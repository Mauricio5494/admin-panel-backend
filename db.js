const { Pool } = require('pg');
const Database = require('sqlite3').Database;
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
const isProduction = Boolean(DATABASE_URL && DATABASE_URL.startsWith('postgres://'));

let pool;
let sqliteDb;

if (isProduction) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.db');
  sqliteDb = new Database(dbPath);
}

/**
 * Convierte placeholders de SQLite (?) a PostgreSQL ($1, $2, ...)
 */
function toPostgresSql(sql) {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

/**
 * Ejecuta una consulta que devuelve filas (SELECT)
 */
async function query(sql, params = []) {
  if (isProduction) {
    const pgSql = toPostgresSql(sql);
    const result = await pool.query(pgSql, params);
    return result.rows;
  }
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Ejecuta una consulta que no devuelve filas (INSERT, UPDATE, DELETE, CREATE)
 */
async function run(sql, params = []) {
  if (isProduction) {
    const pgSql = toPostgresSql(sql);
    const result = await pool.query(pgSql, params);
    return {
      changes: result.rowCount,
      lastID: result.rows[0]?.id
    };
  }
  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

/**
 * Ejecuta una consulta que devuelve una sola fila
 */
async function get(sql, params = []) {
  if (isProduction) {
    const pgSql = toPostgresSql(sql);
    const result = await pool.query(pgSql, params);
    return result.rows[0] || null;
  }
  return new Promise((resolve, reject) => {
    sqliteDb.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Inicializa las tablas en la base de datos
 */
async function initDb() {
  if (isProduction) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL,
        descripcion TEXT,
        imagen TEXT,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        usuario_id INTEGER REFERENCES usuarios(id)
      );
    `);
  } else {
    await new Promise((resolve, reject) => {
      sqliteDb.serialize(() => {
        sqliteDb.run(`CREATE TABLE IF NOT EXISTS usuarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        sqliteDb.run(`CREATE TABLE IF NOT EXISTS items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          titulo TEXT NOT NULL,
          descripcion TEXT,
          imagen TEXT,
          creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
          usuario_id INTEGER,
          FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
        )`);
        // Migración: agregar columnas que falten en bases de datos preexistentes
        function asegurarColumna(tabla, columna, definicion) {
          sqliteDb.run(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`, (err) => {
            if (err && err.message && err.message.includes('duplicate column')) {
              // La columna ya existe, ignorar
            }
          });
        }
        asegurarColumna('usuarios', 'password_hash', 'TEXT');
        asegurarColumna('items', 'imagen', 'TEXT');
        asegurarColumna('items', 'descripcion', 'TEXT');
        asegurarColumna('items', 'usuario_id', 'INTEGER');
        resolve();
      });
    });
  }
}

module.exports = { query, run, get, initDb, isProduction };
