import request from 'supertest';
import app, { apiRouters } from '../../../src/app';
import { authenticate } from '../../../src/middlewares/auth.middleware';
import { useTestWebEnv } from '../../support/http';

useTestWebEnv();

const routes = apiRouters.flatMap(([prefix, router]) =>
    ((router as any).stack ?? (router as any).router?.stack ?? []).filter((layer: any) => layer.route).flatMap(({ route }: any) =>
        Object.keys(route.methods).map((method) => ({
            method,
            path: prefix + route.path,
            handlers: route.stack.map((layer: any) => layer.handle),
        })),
    ),
);
const protectedRoutes = routes.filter(({ path }) => path !== '/api/auth/login');

describe('mounted API authentication boundaries', () => {
    test('inventory covers all 84 API operations and only login is public', () => {
        expect(routes).toHaveLength(84);
        expect(routes.filter(({ handlers }) => !handlers.includes(authenticate)).map(({ method, path }) => `${method} ${path}`))
            .toEqual(['post /api/auth/login']);
    });
    test.each(protectedRoutes)('$method $path authenticates before authorization, input and controller', ({ handlers }) => {
        expect(handlers[0]).toBe(authenticate);
        expect(handlers[1].allowedRoles?.length).toBeGreaterThan(0);
    });

    test.each(protectedRoutes)('$method $path rejects anonymous requests', async ({ method, path }) => {
        const url = path.replace(/:[A-Za-z0-9_]+/g, '1');
        const res = await (request(app) as any)[method](url);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('UNAUTHORIZED');
    });

    test.each(protectedRoutes.filter(({ method }) => method === 'get'))('HEAD $path inherits GET authentication', async ({ path }) => {
        const res = await request(app).head(path.replace(/:[A-Za-z0-9_]+/g, '1'));
        expect(res.status).toBe(401);
        expect(res.text).toBeUndefined();
    });

    test('HEAD health is public with no body; HEAD login has no GET handler', async () => {
        expect((await request(app).head('/health')).status).toBe(200);
        expect((await request(app).head('/api/auth/login')).status).toBe(404);
    });

    test('allowed CORS preflight exposes no resource; disallowed origin gets no CORS grant', async () => {
        const allowed = await request(app).options('/api/files/1/url')
            .set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'Authorization');
        expect(allowed.status).toBe(204);
        expect(allowed.text).toBe('');
        expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
        expect(allowed.headers['access-control-allow-credentials']).toBeUndefined();
        const denied = await request(app).options('/api/files/1/url')
            .set('Origin', 'https://untrusted.example').set('Access-Control-Request-Method', 'POST');
        // Express conserva OPTIONS automático (Allow), sin conceder acceso CORS ni ejecutar el POST.
        expect(denied.status).toBe(200);
        expect(denied.headers.allow).toContain('POST');
        expect(denied.headers['access-control-allow-origin']).toBeUndefined();
        expect(app.get('trust proxy')).toBe(false);
    });

    test('production permits localhost only when it is the explicitly configured origin', async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        const originalFrontendUrl = process.env.FRONTEND_URL;
        try {
            process.env.NODE_ENV = 'production';
            delete process.env.FRONTEND_URL;
            const preflight = () => request(app).options('/api/files/1/url')
                .set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
            const automatic = await preflight();
            expect(automatic.headers['access-control-allow-origin']).toBeUndefined();

            process.env.FRONTEND_URL = 'http://localhost:5173';
            const explicit = await preflight();
            expect(explicit.status).toBe(204);
            expect(explicit.headers['access-control-allow-origin']).toBe('http://localhost:5173');
        } finally {
            if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = originalNodeEnv;
            if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
            else process.env.FRONTEND_URL = originalFrontendUrl;
        }
    });
});
