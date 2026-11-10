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

// ---------- VALIDACIÓN DE CONTENIDO (tarjetas de crédito e insultos) ----------

// Regex para detectar números de tarjeta de crédito (13 a 19 dígitos, con o sin separadores)
const CC_REGEX = /(?:\d[ -]?){13,19}/;

// Listas de palabras ofensivas por idioma (no exhaustivas, cubren lo más común)
const INSULTOS = {
  es: [
    'idiota', 'estupido', 'estúpido', 'imbecil', 'imbécil', 'menso', 'tarado', 'cretino',
    'puta', 'puto', 'cabron', 'cabrón', 'joder', 'jodido', 'jodida', 'coño', 'culo',
    'mierda', 'pendejo', 'pendeja', 'gilipollas', 'capullo', 'maricon', 'maricón',
    'basura', 'inutil', 'inútil', 'miserable', 'cagado', 'cagada', 'hostia', 'hostias',
    'mariconazo', 'putanazo', 'cabrónazo', 'jodido', 'jodida', 'joderse', 'pene',
    'pene', 'vagina', 'cojones', 'cojuda', 'cojudo', 'concha', 'conchudo', 'conchuda',
    'verga', 'verga', 'vergon', 'verga', 'chingar', 'chingada', 'chingado', 'chingao'
  ],
  en: [
    'idiot', 'stupid', 'imbecile', 'moron', 'dumbass', 'asshole', 'bastard', 'bitch',
    'cunt', 'fuck', 'fucking', 'fucked', 'shit', 'piss', 'prick', 'dick', 'pussy',
    'twat', 'crap', 'damn', 'hell', 'bollocks', 'wanker', 'tosser', 'bugger',
    'bloody', 'crap', 'suck', 'sucks', 'screwed', 'jerk', 'ass', 'retard',
    'retarded', 'slut', 'whore', 'faggot', 'dyke', 'nigger', 'nigga', 'tranny',
    'chink', 'gook', 'spic', 'kike', 'redneck', 'cracker', 'honky', 'white trash'
  ],
  ru: [
    'идиот', 'тупой', 'дебил', 'придурок', 'курва', 'сука', 'блядь', 'бля',
    'ебать', 'ебал', 'ебала', 'ебу', 'ебаный', 'ебаная', 'ебанный', 'пиздец',
    'пизда', 'пидор', 'пидорас', 'мудак', 'мразь', 'черт', 'чертов', 'чертова',
    'блин', 'дерьмо', 'говно', 'говна', 'говнюк', 'ублюдок', 'сукин сын',
    'сучка', 'пидар', 'пидарская', 'гандон', 'хер', 'хуй', 'хуйня', 'хуево',
    'хуевая', 'хуевый', 'хуя', 'ебаш', 'заебал', 'заебала', 'отъебись', 'пошёл на хуй',
    'пошла на хуй', 'иди на хуй', 'иди на хуй', 'соси', 'соси хуй', 'соси член',
    'отсоси', 'отсос', 'минет', 'член', 'писька', 'писька', 'попка', 'жопа', 'жопы'
  ],
  hi: [
    'बेवकूफ', 'मूर्ख', 'घटिया', 'नालायक', 'हरामी', 'बदचलन', 'चुदैल', 'चूतिया',
    'भोसड़ी', 'भोसड़ी के', 'मादरचोद', 'मादरचोदन', 'बहनचोद', 'बहन का लौड़ा',
    'लंड', 'चूत', 'गांड', 'गांडू', 'चूतिया', 'चुदक्कड़', 'चुदाई', 'चोद',
    'चोद दे', 'चोद दिया', 'चोद दी', 'घटिया इंसान', 'कमीना', 'कमीना इंसान',
    'डरपोक', 'बदमाश', 'गुंडा', 'दलाल', 'खोटा', 'धोखेबाज', 'घूसखोर', 'बेकार',
    'बकवास', 'बकवास इंसान', 'बेवजह', 'बकवास बात', 'बकवास करना'
  ]
};

function detectarTarjetaCredito(texto) {
  return CC_REGEX.test(texto);
}

function detectarInsultos(texto, idioma) {
  const palabras = INSULTOS[idioma] || [];
  const textoLower = texto.toLowerCase();
  for (const palabra of palabras) {
    if (textoLower.includes(palabra.toLowerCase())) {
      return palabra;
    }
  }
  // También revisar en inglés como respaldo universal
  for (const palabra of INSULTOS.en) {
    if (textoLower.includes(palabra.toLowerCase())) {
      return palabra;
    }
  }
  return null;
}

function validarContenido(titulo, descripcion, idioma = 'es') {
  const campos = [
    { nombre: 'título', valor: titulo || '' },
    { nombre: 'descripción', valor: descripcion || '' }
  ];

  for (const campo of campos) {
    if (detectarTarjetaCredito(campo.valor)) {
      return {
        valido: false,
        razon: 'No se permite ingresar números de tarjeta de crédito.'
      };
    }
    const insulto = detectarInsultos(campo.valor, idioma);
    if (insulto) {
      return {
        valido: false,
        razon: `El campo "${campo.nombre}" contiene lenguaje inapropiado.`
      };
    }
  }

  return { valido: true };
}

// ---------- MIDDLEWARE DE AUTENTICACIÓN JWT ----------

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

// ---------- INICIALIZAR BASE DE DATOS Y ARRANCAR SERVIDOR ----------

async function inicializarTablas() {
  if (isProduction) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        idioma TEXT DEFAULT 'es',
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
          idioma TEXT DEFAULT 'es',
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
        // Migraciones para bases de datos preexistentes
        function asegurarColumna(tabla, columna, definicion) {
          sqliteDb.run(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`, (err) => {
            if (err && err.message && err.message.includes('duplicate column')) {
              // La columna ya existe, ignorar
            }
          });
        }
        asegurarColumna('usuarios', 'password_hash', 'TEXT');
        asegurarColumna('usuarios', 'idioma', "TEXT DEFAULT 'es'");
        asegurarColumna('items', 'imagen', 'TEXT');
        asegurarColumna('items', 'descripcion', 'TEXT');
        asegurarColumna('items', 'usuario_id', 'INTEGER');
        resolve();
      });
    });
  }
}

inicializarTablas().then(() => {
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
  const { nombre, email, password, idioma } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }

  // Validar nombre: sin insultos ni tarjetas de crédito
  const validacion = validarContenido(nombre, '', idioma || 'es');
  if (!validacion.valido) {
    return res.status(400).json({ error: validacion.razon });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await run(
      'INSERT INTO usuarios (nombre, email, password_hash, idioma) VALUES (?, ?, ?, ?)',
      [nombre, email, hash, idioma || 'es']
    );
    const token = jwt.sign({ id: result.lastID, email, nombre, idioma: idioma || 'es' }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, usuario: { id: result.lastID, nombre, email, idioma: idioma || 'es' } });
  } catch (err) {
    const esDuplicado = err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      (err.message && err.message.includes('UNIQUE constraint failed')) ||
      (err.code === '23505');
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
    const token = jwt.sign({ id: user.id, email: user.email, nombre: user.nombre, idioma: user.idioma || 'es' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, usuario: { id: user.id, nombre: user.nombre, email: user.email, idioma: user.idioma || 'es' } });
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

  // Validar contenido: sin tarjetas de crédito ni insultos
  const idioma = req.user.idioma || 'es';
  const validacion = validarContenido(titulo, descripcion || '', idioma);
  if (!validacion.valido) {
    return res.status(400).json({ error: validacion.razon });
  }

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

  const idioma = req.user.idioma || 'es';
  const validacion = validarContenido(titulo, descripcion || '', idioma);
  if (!validacion.valido) {
    return res.status(400).json({ error: validacion.razon });
  }

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
    const rows = await query('SELECT id, nombre, email, idioma, creado_en FROM usuarios ORDER BY creado_en DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener idioma y datos del usuario autenticado
app.get('/api/usuarios/me', auth, async (req, res) => {
  try {
    const user = await get('SELECT id, nombre, email, idioma, creado_en FROM usuarios WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar idioma preferido del usuario
app.put('/api/usuarios/me/idioma', auth, async (req, res) => {
  const { idioma } = req.body;
  if (!idioma || !['es', 'en', 'ru', 'hi'].includes(idioma)) {
    return res.status(400).json({ error: 'Idioma no soportado. Usa: es, en, ru o hi' });
  }
  try {
    const result = await run('UPDATE usuarios SET idioma = ? WHERE id = ?', [idioma, req.user.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    // Actualir token con nuevo idioma
    const user = await get('SELECT nombre, email FROM usuarios WHERE id = ?', [req.user.id]);
    const token = jwt.sign({ id: req.user.id, email: user.email, nombre: user.nombre, idioma }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ mensaje: 'Idioma actualizado', idioma, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
