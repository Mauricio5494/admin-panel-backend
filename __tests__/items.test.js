const request = require('supertest');
const app = require('../server');

let token = null;
let itemId = null;

function authHeader() {
  return { Authorization: `Bearer ${token}` };
}

describe('Items (requiere autenticación)', () => {
  beforeAll(async () => {
    // Registrar y obtener token para las pruebas de items
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ nombre: 'Items User', email: 'items@test.com', password: '123456' });
    token = reg.body.token;
  });

  test('Obtener items (lista vacía inicialmente)', async () => {
    const res = await request(app)
      .get('/api/items')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('Crear un nuevo item', async () => {
    const res = await request(app)
      .post('/api/items')
      .set(authHeader())
      .send({ titulo: 'Item de prueba', descripcion: 'Descripción de prueba' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.titulo).toBe('Item de prueba');

    itemId = res.body.id;
  });

  test('Obtener lista con el item creado', async () => {
    const res = await request(app)
      .get('/api/items')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.some((i) => i.id === itemId)).toBe(true);
  });

  test('Buscar item por título', async () => {
    const res = await request(app)
      .get('/api/items?search=prueba')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].titulo).toContain('prueba');
  });

  test('Actualizar item existente', async () => {
    const res = await request(app)
      .put(`/api/items/${itemId}`)
      .set(authHeader())
      .send({ titulo: 'Item actualizado', descripcion: 'Descripción modificada' });

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBe('Item actualizado');
  });

  test('No permite crear item sin título', async () => {
    const res = await request(app)
      .post('/api/items')
      .set(authHeader())
      .send({ descripcion: 'Sin título' });

    expect(res.status).toBe(400);
  });

  test('Rechaza acceso sin token', async () => {
    const res = await request(app).get('/api/items');

    expect(res.status).toBe(401);
  });

  test('Eliminar item', async () => {
    const res = await request(app)
      .delete(`/api/items/${itemId}`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBe('Item eliminado');
  });
});
