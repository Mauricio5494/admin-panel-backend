const request = require('supertest');
const app = require('../server');

let token = null;
let usuarioId = null;

describe('Autenticación', () => {
  test('Registro de usuario nuevo', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        nombre: 'Usuario Prueba',
        email: 'prueba@test.com',
        password: '123456',
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.usuario.email).toBe('prueba@test.com');
    expect(res.body.usuario.nombre).toBe('Usuario Prueba');

    token = res.body.token;
    usuarioId = res.body.usuario.id;
  });

  test('No permite registrar email duplicado', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        nombre: 'Otro',
        email: 'prueba@test.com',
        password: '123456',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('ya está registrado');
  });

  test('Login con credenciales correctas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'prueba@test.com', password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.usuario.email).toBe('prueba@test.com');
  });

  test('Rechaza credenciales incorrectas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'prueba@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });
});

module.exports = { token, usuarioId };
