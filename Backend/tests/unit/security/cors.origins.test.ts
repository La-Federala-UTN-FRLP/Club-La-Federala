import request from 'supertest';
import app from '../../../src/app';
import { LOCAL_DEV_ORIGIN, resolveCorsOrigin } from '../../../src/config/cors.origins';
import { useTestWebEnv } from '../../support/http';

useTestWebEnv();

describe('resolveCorsOrigin', () => {
    describe('contratos actuales', () => {
        test('origin exacto configurado se permite', () => {
            expect(
                resolveCorsOrigin('https://app.example.com', 'https://app.example.com', 'production'),
            ).toBe(true);
        });

        test('sin Origin se permite', () => {
            expect(resolveCorsOrigin(undefined, 'https://app.example.com', 'production')).toBe(true);
        });

        test('localhost se permite en development sin FRONTEND_URL', () => {
            expect(
                resolveCorsOrigin('http://localhost:5173', undefined, 'development'),
            ).toBe(true);
        });

        test('sin Origin se permite en production aunque falte FRONTEND_URL', () => {
            expect(resolveCorsOrigin(undefined, undefined, 'production')).toBe(true);
        });
    });

    describe('regressions fail-closed', () => {
        test('origin desconocido se deniega', () => {
            expect(
                resolveCorsOrigin('https://evil.example', 'https://app.example.com', 'production'),
            ).toBe(false);
        });

        test('substring/prefix del FRONTEND_URL se deniega', () => {
            expect(
                resolveCorsOrigin(
                    'https://federala.example',
                    'https://federala.example.com',
                    'production',
                ),
            ).toBe(false);
        });

        test('suffix malicioso se deniega', () => {
            expect(
                resolveCorsOrigin(
                    'https://federala.example.evil.com',
                    'https://federala.example',
                    'production',
                ),
            ).toBe(false);
        });

        test('localhost no se agrega automáticamente en production', () => {
            expect(
                resolveCorsOrigin(
                    'http://localhost:5173',
                    'https://app.example.com',
                    'production',
                ),
            ).toBe(false);
        });

        test('production sin FRONTEND_URL deniega origins de browser', () => {
            expect(
                resolveCorsOrigin('https://app.example.com', undefined, 'production'),
            ).toBe(false);
        });

        test('CSV accidental no autoriza cada origin por separado', () => {
            expect(
                resolveCorsOrigin(
                    'https://a.example',
                    'https://a.example,https://b.example',
                    'production',
                ),
            ).toBe(false);
        });
    });

    describe('normalización de FRONTEND_URL', () => {
        test('FRONTEND_URL con espacios representa el origin recortado', () => {
            expect(
                resolveCorsOrigin(
                    'https://app.example.com',
                    '  https://app.example.com  ',
                    'production',
                ),
            ).toBe(true);
        });
    });
});

// ─── Contrato HTTP de CORS (app real) ─────────────────────────────────────────
// CORS es política del navegador: decide qué origins pueden leer respuestas desde JS. No protege
// el API frente a clientes no-browser (curl, Postman, server-to-server): eso lo hacen JWT + RBAC.
// La auth es Bearer en Authorization, sin cookies, así que el API no anuncia
// Access-Control-Allow-Credentials.
describe('CORS por HTTP (Bearer-only, sin credentials)', () => {
    const FRONT = 'https://app.example.com';
    const ENV_ORIGINAL = process.env.FRONTEND_URL;

    beforeAll(() => {
        process.env.FRONTEND_URL = FRONT;
    });

    afterAll(() => {
        if (ENV_ORIGINAL === undefined) delete process.env.FRONTEND_URL;
        else process.env.FRONTEND_URL = ENV_ORIGINAL;
    });

    test.each([
        ['FRONTEND_URL', FRONT],
        ['localhost de desarrollo (NODE_ENV != production)', LOCAL_DEV_ORIGIN],
    ])('origin permitido (%s) → ACAO = origin, sin Access-Control-Allow-Credentials', async (_caso, origin) => {
        const res = await request(app).get('/health').set('Origin', origin);
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe(origin);
        expect(res.headers).not.toHaveProperty('access-control-allow-credentials');
    });

    test('origin no permitido → sin ACAO ni ACAC (la respuesta no se rechaza: lo bloquea el navegador)', async () => {
        const res = await request(app).get('/health').set('Origin', 'https://evil.example');
        expect(res.status).toBe(200);
        expect(res.headers).not.toHaveProperty('access-control-allow-origin');
        expect(res.headers).not.toHaveProperty('access-control-allow-credentials');
    });

    test('sin Origin (curl, Postman, server-to-server) → se atiende igual, sin ACAC', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok' });
        expect(res.headers).not.toHaveProperty('access-control-allow-credentials');
    });

    test('preflight de origin permitido → 204 con Authorization y Content-Type permitidos, sin ACAC', async () => {
        const res = await request(app)
            .options('/api/lotes')
            .set('Origin', FRONT)
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'authorization,content-type');
        expect(res.status).toBe(204);
        expect(res.headers['access-control-allow-origin']).toBe(FRONT);
        const allowHeaders = String(res.headers['access-control-allow-headers']).toLowerCase().split(/\s*,\s*/);
        expect(allowHeaders).toEqual(expect.arrayContaining(['authorization', 'content-type']));
        const allowMethods = String(res.headers['access-control-allow-methods']).split(',');
        expect(allowMethods).toEqual(expect.arrayContaining(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']));
        expect(res.headers).not.toHaveProperty('access-control-allow-credentials');
    });

    test('preflight de origin no permitido → sin ACAO', async () => {
        const res = await request(app)
            .options('/api/lotes')
            .set('Origin', 'https://evil.example')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'authorization');
        expect(res.headers).not.toHaveProperty('access-control-allow-origin');
        expect(res.headers).not.toHaveProperty('access-control-allow-credentials');
    });

    test('request autenticada cross-origin: el Bearer llega y la respuesta lleva ACAO sin ACAC', async () => {
        const res = await request(app).get('/api/lotes').set('Origin', FRONT).set('Authorization', 'Bearer token-invalido');
        // 401 propio de authenticate: el header Authorization se procesó (CORS no lo filtra).
        expect(res.status).toBe(401);
        expect(res.headers['access-control-allow-origin']).toBe(FRONT);
        expect(res.headers).not.toHaveProperty('access-control-allow-credentials');
    });
});
