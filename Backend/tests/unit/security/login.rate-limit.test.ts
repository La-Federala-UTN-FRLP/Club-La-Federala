// Rate limiting de POST /api/auth/login (app real, login mockeado).
//
// Política: 10 intentos FALLIDOS por cliente cada 15 minutos; el 11.º recibe 429. Los logins
// exitosos no consumen cupo. El limiter corre antes del login y no mira JWT, req.user ni email.
// Cada test usa su propio cliente (IP) para no compartir bucket: sin sleeps ni timers falsos.
jest.mock('../../../src/services/auth.service', () => ({
    login: jest.fn(),
}));

jest.mock('../../../src/services/lote.service', () => ({
    getAllLotes: jest.fn(),
}));

import request from 'supertest';
import app from '../../../src/app';
import { login } from '../../../src/services/auth.service';
import { getAllLotes } from '../../../src/services/lote.service';
import { authHeader, useTestWebEnv } from '../../support/http';

const loginMock = login as jest.Mock;
const getAllLotesMock = getAllLotes as jest.Mock;

useTestWebEnv();

const LIMITE = 10;
const PASSWORD_OK = 'clave-correcta';
const RENDER_ORIGINAL = process.env.RENDER;

beforeEach(() => {
    // Login simulado: solo PASSWORD_OK es válida.
    loginMock.mockImplementation(async ({ password }: { password: string }) => {
        if (password === PASSWORD_OK) return { user: { id: 1 }, token: 'jwt' };
        throw Object.assign(new Error('Credenciales inválidas'), { statusCode: 401 });
    });
    getAllLotesMock.mockResolvedValue({ lotes: [], total: 0 });
});

afterEach(() => {
    if (RENDER_ORIGINAL === undefined) delete process.env.RENDER;
    else process.env.RENDER = RENDER_ORIGINAL;
});

// skipSuccessfulRequests descuenta al terminar la respuesta: un tick extra deja asentado el contador.
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function intentar(headers: Record<string, string>, password = 'incorrecta') {
    const res = await request(app).post('/api/auth/login').set(headers).send({ email: 'alguien@mail.com', password });
    await flush();
    return res;
}

async function agotarCupo(headers: Record<string, string>) {
    for (let i = 0; i < LIMITE; i++) {
        const res = await intentar(headers);
        expect(res.status).toBe(401);
    }
}

describe('POST /api/auth/login en Render (cliente = CF-Connecting-IP)', () => {
    beforeEach(() => {
        process.env.RENDER = 'true';
    });

    test(`${LIMITE} intentos fallidos se procesan; el siguiente → 429 sin llegar al login`, async () => {
        const cliente = { 'CF-Connecting-IP': '203.0.113.10' };
        await agotarCupo(cliente);
        loginMock.mockClear();

        const res = await intentar(cliente);

        expect(res.status).toBe(429);
        expect(res.body).toEqual({
            success: false,
            code: 'TOO_MANY_REQUESTS',
            message: expect.any(String),
        });
        expect(loginMock).not.toHaveBeenCalled();
    });

    test('el bloqueo también alcanza a la password correcta (no hay bypass al acertar)', async () => {
        const cliente = { 'CF-Connecting-IP': '203.0.113.11' };
        await agotarCupo(cliente);
        expect((await intentar(cliente, PASSWORD_OK)).status).toBe(429);
    });

    test('headers estándar RateLimit, sin los legacy X-RateLimit-*', async () => {
        const res = await intentar({ 'CF-Connecting-IP': '203.0.113.12' });
        const nombres = Object.keys(res.headers);
        expect(nombres.some((h) => h === 'ratelimit' || h.startsWith('ratelimit-'))).toBe(true);
        expect(nombres.some((h) => h.startsWith('x-ratelimit'))).toBe(false);
    });

    test('los logins exitosos no consumen cupo', async () => {
        const cliente = { 'CF-Connecting-IP': '203.0.113.13' };
        for (let i = 0; i < LIMITE + 5; i++) {
            expect((await intentar(cliente, PASSWORD_OK)).status).toBe(200);
        }
        // El cupo de fallidos sigue entero.
        await agotarCupo(cliente);
        expect((await intentar(cliente)).status).toBe(429);
    });

    test('cliente A agota su cupo; cliente B sigue pudiendo intentar', async () => {
        const a = { 'CF-Connecting-IP': '203.0.113.14' };
        const b = { 'CF-Connecting-IP': '198.51.100.7' };
        await agotarCupo(a);

        expect((await intentar(a)).status).toBe(429);
        expect((await intentar(b)).status).toBe(401);
        expect((await intentar(b, PASSWORD_OK)).status).toBe(200);
    });

    test('rotar X-Forwarded-For no abre buckets nuevos: la key no sale de XFF', async () => {
        const cf = '203.0.113.15';
        for (let i = 0; i < LIMITE; i++) {
            expect((await intentar({ 'CF-Connecting-IP': cf, 'X-Forwarded-For': `10.0.0.${i}, 172.16.0.1` })).status).toBe(401);
        }
        expect((await intentar({ 'CF-Connecting-IP': cf, 'X-Forwarded-For': '192.0.2.99' })).status).toBe(429);
    });

    test('otra ruta de la API no queda afectada aunque el cliente esté bloqueado en login', async () => {
        const cliente = { 'CF-Connecting-IP': '203.0.113.16' };
        await agotarCupo(cliente);
        expect((await intentar(cliente)).status).toBe(429);

        const res = await request(app).get('/api/lotes').set({ ...cliente, ...authHeader('ADMINISTRADOR') });
        expect(res.status).toBe(200);
        expect(res.headers).not.toHaveProperty('ratelimit');
        expect(res.headers).not.toHaveProperty('ratelimit-policy');
    });
});

describe('POST /api/auth/login fuera de Render (cliente = req.ip)', () => {
    test('CF-Connecting-IP no se considera: rotarlo no evita el 429', async () => {
        delete process.env.RENDER;
        for (let i = 0; i < LIMITE; i++) {
            expect((await intentar({ 'CF-Connecting-IP': `198.51.100.${i + 1}` })).status).toBe(401);
        }
        expect((await intentar({ 'CF-Connecting-IP': '198.51.100.200' })).status).toBe(429);
    });
});
