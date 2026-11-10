const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, run, get, initDb, isProduction } = require('./db');

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

// Inicializar base de datos y arrancar servidor
initDb().then(() => {
  if (require.main === module) {
    app.listen(PORT, () => {
      console.log(`Backend escuchando en http://localhost:${PORT} (${isProduction ? 'PostgreSQL' : 'SQLite'})`);
    });
  }
}).catch((err) => {
  console.error('Error inicializando base de datos:', err);
  process.exit(1);
});

module.exports = app;

// ---------- AUTENTICACIÓN ----------

app.post('/api/auth/register', async (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await run(
      'INSERT INTO usuarios (nombre, email, password_hash) VALUES (?, ?, ?)',
      [nombre, email, hash]
    );
    const token = jwt.sign({ id: result.lastID, email, nombre }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, usuario: { id: result.lastID, nombre, email } });
  } catch (err) {
    const esDuplicado = err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      (err.message && err.message.includes('UNIQUE constraint failed')) ||
      (err.code === '23505'); // PostgreSQL unique_violation
    if (esDuplicado) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    return res.status(500).json({ error: 'Error al registrar usuario: ' + err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }
  try {
    const user = await get('SELECT * FROM usuarios WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
    const token = jwt.sign({ id: user.id, email: user.email, nombre: user.nombre }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, usuario: { id: user.id, nombre: user.nombre, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- ITEMS ----------

app.get('/api/items', auth, async (req, res) => {
  const { search } = req.query;
  try {
    let sql = `SELECT i.*, u.nombre as usuario_nombre FROM items i
               LEFT JOIN usuarios u ON i.usuario_id = u.id`;
    const params = [];
    if (search) {
      sql += ' WHERE i.titulo LIKE ? OR i.descripcion LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY i.creado_en DESC';
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', auth, upload.single('imagen'), async (req, res) => {
  const { titulo, descripcion } = req.body;
  if (!titulo) return res.status(400).json({ error: 'El título es requerido' });
  const imagen = req.file ? `/uploads/${req.file.filename}` : null;
  try {
    const result = await run(
      'INSERT INTO items (titulo, descripcion, imagen, usuario_id) VALUES (?, ?, ?, ?)',
      [titulo, descripcion || '', imagen, req.user.id]
    );
    res.status(201).json({ id: result.lastID, titulo, descripcion, imagen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id', auth, upload.single('imagen'), async (req, res) => {
  const { id } = req.params;
  const { titulo, descripcion } = req.body;
  try {
    let sql = 'UPDATE items SET titulo = ?, descripcion = ?';
    const params = [titulo, descripcion || ''];
    if (req.file) {
      sql += ', imagen = ?';
      params.push(`/uploads/${req.file.filename}`);
    }
    sql += ' WHERE id = ?';
    params.push(id);
    const result = await run(sql, params);
    if (result.changes === 0) return res.status(404).json({ error: 'Item no encontrado' });
    res.json({ mensaje: 'Item actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', auth, async (req, res) => {
  try {
    const result = await run('DELETE FROM items WHERE id = ?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Item no encontrado' });
    res.json({ mensaje: 'Item eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- EXPORTAR CSV ----------

app.get('/api/items/export', auth, async (req, res) => {
  const { search } = req.query;
  try {
    let sql = `SELECT i.titulo, i.descripcion, i.imagen, i.creado_en, u.nombre as usuario_nombre
               FROM items i LEFT JOIN usuarios u ON i.usuario_id = u.id`;
    const params = [];
    if (search) {
      sql += ' WHERE i.titulo LIKE ? OR i.descripcion LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY i.creado_en DESC';
    const rows = await query(sql, params);
    const lineas = ['Título,Descripción,Imagen,Fecha,Usuario'];
    rows.forEach((r) => {
      const esc = (v) => `"${(v || '').replace(/"/g, '""')}"`;
      lineas.push([esc(r.titulo), esc(r.descripcion), esc(r.imagen), esc(r.creado_en), esc(r.usuario_nombre)].join(','));
    });
    res.setHeader('Content-Disposition', 'attachment; filename=items.csv');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(lineas.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- USUARIOS ----------

app.get('/api/usuarios', auth, async (req, res) => {
  try {
    const rows = await query('SELECT id, nombre, email, creado_en FROM usuarios ORDER BY creado_en DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
