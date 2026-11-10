Admin Panel Backend

API REST para panel de administración construida con Node.js, Express y SQLite. Incluye autenticación JWT, CRUD de ítems con búsqueda, exportación a CSV, subida de imágenes y pruebas automatizadas con Jest.

Stack tecnológico

- Node.js + Express
- SQLite (base de datos ligera, archivo local)
- JWT (autenticación stateless)
- bcrypt (hash de contraseñas)
- Multer (subida de archivos)
- Jest + Supertest (pruebas automatizadas)

Características

- Registro e inicio de sesión de usuarios con contraseñas encriptadas
- Protección de rutas mediante token JWT
- Crear, listar, editar y eliminar ítems (título, descripción, imagen opcional)
- Búsqueda de ítems por título o descripción
- Exportación de ítems a archivo CSV
- Listado de usuarios registrados
- Pruebas automatizadas que cubren auth, ítems, usuarios y exportación

Instalación y ejecución local

# Clonar el repositorio
```sh
git clone https://github.com/Mauricio5494/admin-panel-backend.git
cd admin-panel-backend
```
# Instalar dependencias
```bash
npm install
```
# Ejecutar en modo desarrollo
npm run dev

El servidor iniciará en http://localhost:3001.

Variables de entorno

Crea un archivo .env en la raíz (opcional):

PORT=3001
JWT_SECRET=tu_clave_secreta_cambiala_en_produccion
DB_PATH=./database.db

Endpoints principales

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Registrar usuario | No |
| POST | `/api/auth/login` | Iniciar sesión | No |
| GET | `/api/items` | Listar ítems (con `?search=`) | Sí |
| POST | `/api/items` | Crear ítem | Sí |
| PUT | `/api/items/:id` | Actualizar ítem | Sí |
| DELETE | `/api/items/:id` | Eliminar ítem | Sí |
| GET | `/api/items/export` | Exportar ítems a CSV | Sí |
| GET | `/api/usuarios` | Listar usuarios | Sí |

Pruebas automatizadas

npm test

Ejecutan 16 pruebas sobre autenticación, ítems, usuarios y exportación CSV.

Despliegue

Este backend está listo para desplegar en plataformas como Railway, Render o cualquier servicio que soporte Node.js. Ten en cuenta que SQLite usa un archivo local; para producción se recomienda migrar a PostgreSQL o una base de datos gestionada.

---

Licencia

MIT

---
