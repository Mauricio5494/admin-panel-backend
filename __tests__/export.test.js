const request = require('supertest');
const app = require('../server');

let token = null;

describe('Exportación CSV', () => {
  beforeAll(async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ nombre: 'Export User', email: 'export@test.com', password: '123456' });
    token = reg.body.token;

    // Crear un item para tener algo que exportar
    await request(app)
      .post('/api/items')
      .set({ Authorization: `Bearer ${token}` })
      .send({ titulo: 'Item para exportar', descripcion: 'Contenido de exportación' });
  });

  test('Exporta items a CSV', async () => {
    const res = await request(app)
      .get('/api/items/export')
      .set({ Authorization: `Bearer ${token}` });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Título');
    expect(res.text).toContain('Item para exportar');
  });

  test('Rechaza exportación sin token', async () => {
    const res = await request(app).get('/api/items/export');

    expect(res.status).toBe(401);
  });
});
