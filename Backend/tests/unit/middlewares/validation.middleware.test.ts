// Contrato de validateParams/validatedParams y validateQuery/validatedQuery sobre una app
// Express mínima. Cada middleware guarda el resultado de Zod en req.validated (req.params y
// req.query quedan crudos) y el controller lo lee con el accessor, pasando el mismo schema
// que la ruta.
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { z } from 'zod';
import {
    validateParams,
    validatedParams,
    validateQuery,
    validatedQuery,
} from '../../../src/middlewares/validation.middleware';
import { idParamsSchema, positiveIntString } from '../../../src/validations/params.validation';

const miembroParamsSchema = z.object({ id: positiveIntString, miembroId: positiveIntString });
const codigoParamsSchema = z.object({ codigo: z.string().trim().toUpperCase() });
const lentoParamsSchema = z.object({ id: positiveIntString, demoraMs: positiveIntString });
const explotaParamsSchema = z.object({ id: z.string() }).transform(() => {
    throw new Error('fallo inesperado');
});

const loteQuerySchema = z.object({ loteId: positiveIntString.optional() });
// Mismo shape que loteQuerySchema pero otro objeto: el accessor compara identidad, no forma.
const otroQuerySchema = z.object({ loteId: positiveIntString.optional() });
const codigoQuerySchema = z.object({ codigo: z.string().trim().toUpperCase() });
const lentoQuerySchema = z.object({ id: positiveIntString, demoraMs: positiveIntString });
const explotaQuerySchema = z.object({ x: z.string().optional() }).transform(() => {
    throw new Error('fallo inesperado');
});

const handler = jest.fn();

function buildApp() {
    const app = express();

    app.get('/items/:id', validateParams(idParamsSchema), (req: Request, res: Response) => {
        handler();
        res.json({ validated: validatedParams(req, idParamsSchema), raw: req.params });
    });

    app.get('/codigos/:codigo', validateParams(codigoParamsSchema), (req: Request, res: Response) => {
        res.json(validatedParams(req, codigoParamsSchema));
    });

    app.get('/personas/:id/miembros/:miembroId', validateParams(miembroParamsSchema), (req: Request, res: Response) => {
        handler();
        res.json(validatedParams(req, miembroParamsSchema));
    });

    // Lee el resultado después de una espera, para que otra request se procese en el medio.
    app.get('/lento/:id/:demoraMs', validateParams(lentoParamsSchema), async (req: Request, res: Response) => {
        const { demoraMs } = validatedParams(req, lentoParamsSchema);
        await new Promise((resolve) => setTimeout(resolve, demoraMs));
        res.json(validatedParams(req, lentoParamsSchema));
    });

    app.get('/sin-validar/:id', (req: Request, res: Response) => {
        res.json(validatedParams(req, idParamsSchema));
    });

    // Mismo shape que idParamsSchema pero otro objeto: el accessor compara identidad, no forma.
    app.get('/otro-schema/:id', validateParams(idParamsSchema), (req: Request, res: Response) => {
        res.json(validatedParams(req, z.object({ id: positiveIntString })));
    });

    app.get('/explota/:id', validateParams(explotaParamsSchema), (_req: Request, res: Response) => {
        handler();
        res.json({});
    });

    // ----- query -----
    app.get('/query/items', validateQuery(loteQuerySchema), (req: Request, res: Response) => {
        handler();
        res.json({ validated: validatedQuery(req, loteQuerySchema), raw: req.query });
    });

    app.get('/query/codigos', validateQuery(codigoQuerySchema), (req: Request, res: Response) => {
        res.json(validatedQuery(req, codigoQuerySchema));
    });

    // params + query en el mismo request, en los dos órdenes posibles de middleware.
    const ambos = (req: Request, res: Response) => {
        res.json({
            params: validatedParams(req, idParamsSchema),
            query: validatedQuery(req, loteQuerySchema),
            partes: Object.keys(req.validated ?? {}).sort(),
            rawParams: req.params,
            rawQuery: req.query,
        });
    };
    app.get('/query/ambos/:id', validateParams(idParamsSchema), validateQuery(loteQuerySchema), ambos);
    app.get('/query/ambos-inverso/:id', validateQuery(loteQuerySchema), validateParams(idParamsSchema), ambos);

    app.get('/query/lento', validateQuery(lentoQuerySchema), async (req: Request, res: Response) => {
        const { demoraMs } = validatedQuery(req, lentoQuerySchema);
        await new Promise((resolve) => setTimeout(resolve, demoraMs));
        res.json(validatedQuery(req, lentoQuerySchema));
    });

    app.get('/query/sin-validar', (req: Request, res: Response) => {
        res.json(validatedQuery(req, loteQuerySchema));
    });

    // La ruta validó params pero no query: validatedQuery no debe encontrar nada.
    app.get('/query/solo-params/:id', validateParams(idParamsSchema), (req: Request, res: Response) => {
        res.json(validatedQuery(req, loteQuerySchema));
    });

    app.get('/query/otro-schema', validateQuery(loteQuerySchema), (req: Request, res: Response) => {
        res.json(validatedQuery(req, otroQuerySchema));
    });

    app.get('/query/explota', validateQuery(explotaQuerySchema), (_req: Request, res: Response) => {
        handler();
        res.json({});
    });

    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
        res.status(500).json({ error: err.message });
    });

    return app;
}

beforeEach(() => {
    handler.mockReset();
});

describe('validateParams + validatedParams', () => {
    test('el handler recibe el resultado transformado por Zod; req.params queda crudo', async () => {
        const res = await request(buildApp()).get('/items/12');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ validated: { id: 12 }, raw: { id: '12' } });
    });

    test('conserva cualquier transformación del schema, no solo la conversión a number', async () => {
        const res = await request(buildApp()).get(`/codigos/${encodeURIComponent('  ab-1 ')}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ codigo: 'AB-1' });
    });

    test('múltiples params: todos los declarados quedan disponibles y convertidos', async () => {
        const res = await request(buildApp()).get('/personas/5/miembros/9');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ id: 5, miembroId: 9 });
    });

    test('aislamiento: requests concurrentes no comparten el resultado validado', async () => {
        const app = buildApp();
        const [lenta, rapida] = await Promise.all([
            request(app).get('/lento/1/60'),
            request(app).get('/lento/2/1'),
        ]);
        expect(lenta.body).toEqual({ id: 1, demoraMs: 60 });
        expect(rapida.body).toEqual({ id: 2, demoraMs: 1 });
    });

    test('aislamiento: una request sin validateParams no ve el resultado de una anterior', async () => {
        const app = buildApp();
        await request(app).get('/items/12');
        const res = await request(app).get('/sin-validar/12');
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/no ejecutó su middleware de validación/);
    });

    test('accessor sin haber ejecutado validateParams lanza', async () => {
        const res = await request(buildApp()).get('/sin-validar/7');
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/No hay params validados/);
    });

    test('accessor con un schema distinto al de la ruta lanza, aunque tenga el mismo shape', async () => {
        const res = await request(buildApp()).get('/otro-schema/7');
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/se validaron con otro schema/);
    });
});

describe('errores', () => {
    test('formato estándar de error Zod: 400 sin llegar al handler', async () => {
        const res = await request(buildApp()).get('/items/abc');
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            success: false,
            message: 'Datos inválidos',
            errors: [{ field: 'id', message: 'Debe ser un entero positivo' }],
        });
        expect(handler).not.toHaveBeenCalled();
    });

    test('con múltiples params informa cada param inválido', async () => {
        const res = await request(buildApp()).get('/personas/0/miembros/1e2');
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([
            { field: 'id', message: 'Debe ser un entero positivo' },
            { field: 'miembroId', message: 'Debe ser un entero positivo' },
        ]);
        expect(handler).not.toHaveBeenCalled();
    });

    test('un error que no es de Zod sigue por next(error)', async () => {
        const res = await request(buildApp()).get('/explota/1');
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'fallo inesperado' });
        expect(handler).not.toHaveBeenCalled();
    });
});

// En Express 5 req.query es un getter que re-parsea la URL en cada acceso: mutarlo no persiste.
// Por eso el resultado de Zod vive en req.validated.query y req.query queda crudo.
describe('validateQuery + validatedQuery', () => {
    test('el handler recibe el resultado transformado por Zod (loteId number); req.query queda crudo', async () => {
        const res = await request(buildApp()).get('/query/items?loteId=12');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ validated: { loteId: 12 }, raw: { loteId: '12' } });
        expect(typeof res.body.validated.loteId).toBe('number');
    });

    test('claves desconocidas: validatedQuery devuelve solo lo declarado; req.query conserva lo crudo', async () => {
        const res = await request(buildApp()).get('/query/items?loteId=12&foo=bar');
        expect(res.status).toBe(200);
        expect(res.body.validated).toEqual({ loteId: 12 });
        expect(res.body.validated).not.toHaveProperty('foo');
        expect(res.body.raw).toEqual({ loteId: '12', foo: 'bar' });
    });

    test('query vacía: el resultado es un objeto vacío', async () => {
        const res = await request(buildApp()).get('/query/items');
        expect(res.status).toBe(200);
        expect(res.body.validated).toEqual({});
    });

    test('conserva cualquier transformación del schema, no solo la conversión a number', async () => {
        const res = await request(buildApp()).get(`/query/codigos?codigo=${encodeURIComponent('  ab-1 ')}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ codigo: 'AB-1' });
    });

    test.each([['/query/ambos/5?loteId=12'], ['/query/ambos-inverso/5?loteId=12']])(
        'params y query coexisten en req.validated sin sobrescribirse (%s)',
        async (url) => {
            const res = await request(buildApp()).get(url);
            expect(res.status).toBe(200);
            expect(res.body.params).toEqual({ id: 5 });
            expect(res.body.query).toEqual({ loteId: 12 });
            expect(res.body.partes).toEqual(['params', 'query']);
            expect(res.body.rawParams).toEqual({ id: '5' });
            expect(res.body.rawQuery).toEqual({ loteId: '12' });
        },
    );

    test('aislamiento: requests concurrentes no comparten el resultado validado', async () => {
        const app = buildApp();
        const [lenta, rapida] = await Promise.all([
            request(app).get('/query/lento?id=1&demoraMs=60'),
            request(app).get('/query/lento?id=2&demoraMs=1'),
        ]);
        expect(lenta.body).toEqual({ id: 1, demoraMs: 60 });
        expect(rapida.body).toEqual({ id: 2, demoraMs: 1 });
    });

    test('aislamiento: una request sin validateQuery no ve el resultado de una anterior', async () => {
        const app = buildApp();
        await request(app).get('/query/items?loteId=12');
        const res = await request(app).get('/query/sin-validar?loteId=12');
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/no ejecutó su middleware de validación/);
    });

    test('accessor sin haber ejecutado validateQuery lanza (error de programación)', async () => {
        const res = await request(buildApp()).get('/query/sin-validar?loteId=12');
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/No hay query validados/);
    });

    test('validar solo params no habilita validatedQuery', async () => {
        const res = await request(buildApp()).get('/query/solo-params/5?loteId=12');
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/No hay query validados/);
    });

    test('accessor con un schema distinto al de la ruta lanza, aunque tenga el mismo shape', async () => {
        const res = await request(buildApp()).get('/query/otro-schema?loteId=12');
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/se validaron con otro schema/);
    });

    test('formato estándar de error Zod: 400 sin llegar al handler', async () => {
        const res = await request(buildApp()).get('/query/items?loteId=abc');
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            success: false,
            message: 'Datos inválidos',
            errors: [{ field: 'loteId', message: 'Debe ser un entero positivo' }],
        });
        expect(handler).not.toHaveBeenCalled();
    });

    test.each([['loteId=1&loteId=2'], ['loteId=1e2'], ['loteId=007'], ['loteId=']])(
        'query repetida o no canónica (%s) responde 400 sin llegar al handler',
        async (qs) => {
            const res = await request(buildApp()).get(`/query/items?${qs}`);
            expect(res.status).toBe(400);
            expect(handler).not.toHaveBeenCalled();
        },
    );

    test('un error que no es de Zod sigue por next(error)', async () => {
        const res = await request(buildApp()).get('/query/explota?x=1');
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'fallo inesperado' });
        expect(handler).not.toHaveBeenCalled();
    });
});
