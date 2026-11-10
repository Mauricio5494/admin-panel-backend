const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'cambia_esta_clave_en_produccion';

app.use(cors());
app.use(express.json());

// Servir imágenes subidas
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Carpeta de subidas
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '-' + file.originalname);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Middleware de autenticación JWT
function auth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = header.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido o expirado' });
    req.user = user;
    next();
  });
}

// Inicializar base de datos
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS items (
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
    db.run(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`, (err) => {
      if (err && err.message.includes('duplicate column')) {
        // La columna ya existe, ignorar
      }
    });
  }

  asegurarColumna('usuarios', 'password_hash', 'TEXT');
  asegurarColumna('items', 'imagen', 'TEXT');
  asegurarColumna('items', 'descripcion', 'TEXT');
  asegurarColumna('items', 'usuario_id', 'INTEGER');
});

// ---------- AUTENTICACIÓN ----------

app.post('/api/auth/register', async (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO usuarios (nombre, email, password_hash) VALUES (?, ?, ?)',
      [nombre, email, hash],
      function (err) {
        if (err) {
          const esDuplicado = err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
            (err.message && err.message.includes('UNIQUE constraint failed'));
          if (esDuplicado) {
            return res.status(409).json({ error: 'El email ya está registrado' });
          }
          return res.status(500).json({ error: 'Error al registrar usuario: ' + err.message });
        }
        const token = jwt.sign({ id: this.lastID, email, nombre }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, usuario: { id: this.lastID, nombre, email } });
      }
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }
  db.get('SELECT * FROM usuarios WHERE email = ?', [email], async (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Credenciales inválidas' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
    const token = jwt.sign({ id: user.id, email: user.email, nombre: user.nombre }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, usuario: { id: user.id, nombre: user.nombre, email: user.email } });
  });
});

// ---------- ITEMS ----------

app.get('/api/items', auth, (req, res) => {
  const { search } = req.query;
  let sql = `SELECT i.*, u.nombre as usuario_nombre FROM items i
             LEFT JOIN usuarios u ON i.usuario_id = u.id`;
  const params = [];
  if (search) {
    sql += ' WHERE i.titulo LIKE ? OR i.descripcion LIKE ?';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY i.creado_en DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/items', auth, upload.single('imagen'), (req, res) => {
  const { titulo, descripcion } = req.body;
  if (!titulo) return res.status(400).json({ error: 'El título es requerido' });
  const imagen = req.file ? `/uploads/${req.file.filename}` : null;
  db.run(
    'INSERT INTO items (titulo, descripcion, imagen, usuario_id) VALUES (?, ?, ?, ?)',
    [titulo, descripcion || '', imagen, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, titulo, descripcion, imagen });
    }
  );
});

app.put('/api/items/:id', auth, upload.single('imagen'), (req, res) => {
  const { id } = req.params;
  const { titulo, descripcion } = req.body;
  let sql = 'UPDATE items SET titulo = ?, descripcion = ?';
  const params = [titulo, descripcion || ''];
  if (req.file) {
    sql += ', imagen = ?';
    params.push(`/uploads/${req.file.filename}`);
  }
  sql += ' WHERE id = ?';
  params.push(id);
  db.run(sql, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Item no encontrado' });
    res.json({ mensaje: 'Item actualizado' });
  });
});

app.delete('/api/items/:id', auth, (req, res) => {
  db.run('DELETE FROM items WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Item no encontrado' });
    res.json({ mensaje: 'Item eliminado' });
  });
});

// ---------- EXPORTAR CSV ----------

app.get('/api/items/export', auth, (req, res) => {
  const { search } = req.query;
  let sql = `SELECT i.titulo, i.descripcion, i.imagen, i.creado_en, u.nombre as usuario_nombre
             FROM items i LEFT JOIN usuarios u ON i.usuario_id = u.id`;
  const params = [];
  if (search) {
    sql += ' WHERE i.titulo LIKE ? OR i.descripcion LIKE ?';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY i.creado_en DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const lineas = ['Título,Descripción,Imagen,Fecha,Usuario'];
    rows.forEach((r) => {
      const esc = (v) => `"${(v || '').replace(/"/g, '""')}"`;
      lineas.push([esc(r.titulo), esc(r.descripcion), esc(r.imagen), esc(r.creado_en), esc(r.usuario_nombre)].join(','));
    });
    res.setHeader('Content-Disposition', 'attachment; filename=items.csv');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(lineas.join('\n'));
  });
});

// ---------- USUARIOS ----------

app.get('/api/usuarios', auth, (req, res) => {
  db.all('SELECT id, nombre, email, creado_en FROM usuarios ORDER BY creado_en DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend escuchando en http://localhost:${PORT}`);
  });
}

module.exports = app;
