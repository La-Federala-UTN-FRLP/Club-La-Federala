// 404 global de la API (app real).
//
// Defecto caracterizado (Block 0, final hardening): sin catch-all, Express responde a una ruta
// inexistente (o a un método no soportado sobre una ruta existente) con su página HTML por defecto
// ("Cannot GET …", text/html), fuera del contrato JSON del API.
//
// Contrato: 404 JSON { success: false, code: 'NOT_FOUND', message: 'Ruta no encontrada' }.
// No se distingue públicamente ruta inexistente de método no soportado (sin 405).
import request from 'supertest';
import app from '../../../src/app';
import { useTestWebEnv } from '../../support/http';

useTestWebEnv();

function expectNotFoundJson(res: request.Response) {
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ success: false, code: 'NOT_FOUND', message: 'Ruta no encontrada' });
    expect(res.text).not.toMatch(/<!DOCTYPE html>|<html/i);
}

describe('ruta inexistente bajo /api', () => {
    test('GET /api/ruta-inexistente → 404 JSON', async () => {
        expectNotFoundJson(await request(app).get('/api/ruta-inexistente'));
    });

    test('POST /api/ruta-inexistente → 404 JSON', async () => {
        expectNotFoundJson(await request(app).post('/api/ruta-inexistente').send({ a: 1 }));
    });
});

describe('método no soportado sobre una ruta existente', () => {
    test('PUT /api/auth/login → 404 JSON', async () => {
        expectNotFoundJson(await request(app).put('/api/auth/login').send({}));
    });
});
