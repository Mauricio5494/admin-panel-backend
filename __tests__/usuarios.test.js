const request = require('supertest');
const app = require('../server');

let token = null;

describe('Usuarios', () => {
  beforeAll(async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ nombre: 'Usuarios User', email: 'usuarios@test.com', password: '123456' });
    token = reg.body.token;
  });

  test('Obtener lista de usuarios (requiere auth)', async () => {
    const res = await request(app)
      .get('/api/usuarios')
      .set({ Authorization: `Bearer ${token}` });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('Rechaza acceso a usuarios sin token', async () => {
    const res = await request(app).get('/api/usuarios');

    expect(res.status).toBe(401);
  });
});
