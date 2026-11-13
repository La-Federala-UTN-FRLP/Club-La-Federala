// API freeze: la OpenAPI (documents/documentacionApi.yaml) describe exactamente la API real.
//
// Fuente de verdad: los routers montados (app.apiRouters + rutas propias de la app, como /health),
// inspeccionados en runtime. Cada ruta real debe tener exactamente una operación en la OpenAPI y
// cada operación debe corresponder a una ruta real. Además se verifica que la seguridad y los roles
// documentados coincidan con authenticate/authorize de la ruta.
//
// Criterio de métodos: se comparan los métodos declarados en las rutas (route.methods). HEAD y
// OPTIONS implícitos de Express (HEAD de un GET, preflight CORS) no son operaciones contractuales.
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import app, { apiRouters } from '../../../src/app';
import { authenticate } from '../../../src/middlewares/auth.middleware';

const SPEC_PATH = path.resolve(__dirname, '../../../documents/documentacionApi.yaml');
const spec = YAML.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const ROLES = ['ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA', 'TECNICO'];

type RealRoute = { key: string; auth: boolean; roles: string[] | null };
type SpecOperation = { key: string; op: any };

const toOpenApiPath = (p: string) => (p.replace(/:(\w+)/g, '{$1}').replace(/\/$/, '') || '/');
const serverPath = (servers: any[] | undefined) => (servers?.[0]?.url ?? '').replace(/^https?:\/\/[^/]+/, '');

function realRoutes(): RealRoute[] {
    const routesOf = (router: any) => (router.stack ?? router.router?.stack ?? []).filter((l: any) => l.route);
    const out: RealRoute[] = [];
    const add = (prefix: string, layer: any) => {
        const handlers = layer.route.stack;
        const auth = handlers.some((h: any) => h.handle === authenticate);
        const roles = handlers.map((h: any) => h.handle.allowedRoles).find(Boolean) ?? null;
        for (const m of Object.keys(layer.route.methods)) {
            out.push({ key: `${m.toUpperCase()} ${toOpenApiPath(prefix + layer.route.path)}`, auth, roles: roles ? [...roles] : null });
        }
    };
    for (const layer of routesOf((app as any).router)) add('', layer);
    for (const [prefix, router] of apiRouters) for (const layer of routesOf(router)) add(prefix, layer);
    return out;
}

function specOperations(): SpecOperation[] {
    const base = serverPath(spec.servers);
    const out: SpecOperation[] = [];
    for (const [p, item] of Object.entries<any>(spec.paths)) {
        const prefix = item.servers ? serverPath(item.servers) : base;
        for (const m of METHODS) {
            if (item[m]) out.push({ key: `${m.toUpperCase()} ${toOpenApiPath(prefix + p)}`, op: item[m] });
        }
    }
    return out;
}

const REAL = realRoutes();
const OPS = specOperations();
const opByKey = new Map(OPS.map((o) => [o.key, o.op]));

describe('OpenAPI — estructura', () => {
    test('versión 3.0.x, info y servers', () => {
        expect(spec.openapi).toMatch(/^3\.0\.\d+$/);
        expect(spec.info.title).toEqual(expect.any(String));
        expect(spec.info.version).toEqual(expect.any(String));
        expect(spec.servers.length).toBeGreaterThan(0);
    });

    test('esquema de seguridad Bearer JWT (sin cookies)', () => {
        expect(spec.components.securitySchemes).toEqual({
            bearerAuth: expect.objectContaining({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }),
        });
        expect(spec).not.toHaveProperty('security'); // la seguridad se declara por operación
    });

    test('cada operación tiene operationId único, tag declarado, summary y respuestas', () => {
        const declaredTags = new Set(spec.tags.map((t: { name: string }) => t.name));
        const ids = OPS.map((o) => o.op.operationId);
        expect(new Set(ids).size).toBe(ids.length);
        for (const { key, op } of OPS) {
            expect({ key, operationId: op.operationId }).toEqual({ key, operationId: expect.any(String) });
            expect({ key, tags: op.tags }).toEqual({ key, tags: [expect.any(String)] });
            expect(declaredTags.has(op.tags[0])).toBe(true);
            expect({ key, summary: op.summary }).toEqual({ key, summary: expect.any(String) });
            expect(Object.keys(op.responses ?? {}).length).toBeGreaterThan(0);
        }
    });

    test('todos los $ref resuelven', () => {
        const unresolved: string[] = [];
        const resolve = (ref: string) => ref.replace(/^#\//, '').split('/').reduce((acc: any, k) => acc?.[k], spec);
        const walk = (node: any) => {
            if (Array.isArray(node)) return node.forEach(walk);
            if (node && typeof node === 'object') {
                if (typeof node.$ref === 'string' && resolve(node.$ref) === undefined) unresolved.push(node.$ref);
                Object.values(node).forEach(walk);
            }
        };
        walk(spec);
        expect(unresolved).toEqual([]);
    });

    test('no hay schemas, responses ni parameters sin referencias', () => {
        const text = JSON.stringify(spec);
        const orphans: string[] = [];
        for (const section of ['schemas', 'responses', 'parameters'] as const) {
            for (const name of Object.keys(spec.components[section] ?? {})) {
                if (!text.includes(`"#/components/${section}/${name}"`)) orphans.push(`${section}/${name}`);
            }
        }
        expect(orphans).toEqual([]);
    });

    test('sin placeholders ni contratos retirados', () => {
        const text = fs.readFileSync(SPEC_PATH, 'utf8');
        for (const prohibido of [/\bTODO\b/, /\bTBD\b/, /same as above/i, /\/auth\/refresh/, /\/auth\/me\b/, /refresh[_ ]?token/i, /DeleteVentaResponse/, /registrar-boleto/, /registrar-escritura/]) {
            expect(text).not.toMatch(prohibido);
        }
    });
});

describe('OpenAPI — inventario vs rutas reales', () => {
    test('cada ruta real está documentada y cada operación documentada existe', () => {
        const real = REAL.map((r) => r.key).sort();
        const documented = OPS.map((o) => o.key).sort();
        const missing = real.filter((k) => !documented.includes(k));
        const stale = documented.filter((k) => !real.includes(k));

        expect({ missing, stale }).toEqual({ missing: [], stale: [] });
        expect(documented).toEqual(real);
    });

    test('el freeze cubre 78 operaciones /api más GET /health', () => {
        expect(REAL.filter((r) => r.key.includes(' /api/'))).toHaveLength(78);
        expect(REAL.map((r) => r.key)).toContain('GET /health');
    });

    test('rutas retiradas no existen ni están documentadas', () => {
        for (const key of [
            'DELETE /api/ventas/{id}', 'DELETE /api/reservas/{id}', 'DELETE /api/inmobiliarias/{id}',
            'POST /api/ubicaciones', 'PUT /api/ubicaciones/{id}', 'DELETE /api/ubicaciones/{id}',
            'POST /api/auth/refresh', 'GET /api/auth/me',
        ]) {
            expect(REAL.map((r) => r.key)).not.toContain(key);
            expect(opByKey.has(key)).toBe(false);
        }
    });
});

describe('OpenAPI — seguridad y roles por operación', () => {
    test.each(REAL.map((r) => [r.key, r] as const))('%s', (key, route) => {
        const op = opByKey.get(key);
        expect(op).toBeDefined();

        if (route.auth) {
            expect(op.security).toEqual([{ bearerAuth: [] }]);
            expect(op.responses).toHaveProperty('401');
        } else {
            // Pública: sin Bearer. (Puede documentar 401 propio, como el login con credenciales inválidas.)
            expect(op.security).toEqual([]);
        }

        if (route.roles) {
            expect([...op['x-roles']].sort()).toEqual([...route.roles].sort());
            expect(op['x-roles'].every((r: string) => ROLES.includes(r))).toBe(true);
            expect(op.responses).toHaveProperty('403');
        } else {
            expect(op).not.toHaveProperty('x-roles');
        }
    });

    test('públicas: solo POST /api/auth/login y GET /health', () => {
        expect(REAL.filter((r) => !r.auth).map((r) => r.key).sort()).toEqual(['GET /health', 'POST /api/auth/login']);
    });
});

describe('OpenAPI — respuestas por tipo de operación', () => {
    test('operaciones con body JSON documentan 413; multipart no lo usa como JSON', () => {
        for (const { key, op } of OPS) {
            const content = op.requestBody?.content ?? {};
            if (content['application/json']) expect({ key, has413: '413' in op.responses }).toEqual({ key, has413: true });
            if (content['multipart/form-data']) expect({ key, json: 'application/json' in content }).toEqual({ key, json: false });
        }
    });

    test('las rutas de la API documentan 500; /health no', () => {
        for (const { key, op } of OPS) {
            const esperado = key !== 'GET /health';
            expect({ key, has500: '500' in op.responses }).toEqual({ key, has500: esperado });
        }
    });

    test('login documenta 401 genérico y 429 del rate limit', () => {
        const login = opByKey.get('POST /api/auth/login');
        expect(login.responses).toHaveProperty('401');
        expect(login.responses).toHaveProperty('429');
        expect(login.security).toEqual([]);
    });

    test('el campo legacy `error` de auth está marcado deprecated', () => {
        const auth = spec.components.schemas.AuthErrorResponse.allOf[1].properties.error;
        expect(auth.deprecated).toBe(true);
    });
});
