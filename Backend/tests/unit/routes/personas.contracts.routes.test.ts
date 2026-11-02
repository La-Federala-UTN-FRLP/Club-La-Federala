// Contratos HTTP de Personas cubiertos por middleware de validación:
// - PUT /:id: la ruta aplicaba el schema del body a req.params (no-op); el controller
//   seguía validando, así que el body ya estaba protegido.
// - POST /:id/grupo-familiar/miembros: solo había un chequeo manual de presencia.
// - DELETE /:id/grupo-familiar/miembros/:miembroId: miembroId solo pasaba por Number()+isNaN.
// - GET /: la query llegaba sin validar hasta Prisma (estado=FOO → 500).
import request from 'supertest';
import app from '../../../src/app';
import { PersonaService } from '../../../src/services/persona.service';
import { createPersonaSchema, updatePersonaSchema } from '../../../src/validations/persona.validation';
import { authHeader, useTestWebEnv } from '../../support/http';

const createSpy = jest.spyOn(PersonaService.prototype, 'create');
const findByCuilSpy = jest.spyOn(PersonaService.prototype, 'findByCuil');
// El body lo valida el middleware (parseAsync): si un controller llama a .parse, validó dos veces.
const createSchemaParseSpy = jest.spyOn(createPersonaSchema, 'parse');
const updateSchemaParseSpy = jest.spyOn(updatePersonaSchema, 'parse');
const updateSpy = jest.spyOn(PersonaService.prototype, 'update');
const crearMiembroSpy = jest.spyOn(PersonaService.prototype, 'crearMiembroFamiliar');
const eliminarMiembroSpy = jest.spyOn(PersonaService.prototype, 'eliminarMiembroFamiliar');
const findAllSpy = jest.spyOn(PersonaService.prototype, 'findAll');

useTestWebEnv();

beforeEach(() => {
    createSpy.mockReset().mockResolvedValue({ id: 1 } as any);
    findByCuilSpy.mockReset().mockResolvedValue({ id: 3 } as any);
    updateSpy.mockReset().mockResolvedValue({ persona: {} as any, message: 'ok' });
    crearMiembroSpy.mockReset().mockResolvedValue({ id: 30 } as any);
    eliminarMiembroSpy.mockReset().mockResolvedValue(undefined as any);
    findAllSpy.mockReset().mockResolvedValue({ personas: [], total: 0 });
});

afterAll(() => {
    jest.restoreAllMocks();
});

const ADMIN = authHeader('ADMINISTRADOR');

describe('PUT /api/personas/:id', () => {
    test('id inválido responde 400 con el contrato estándar de validación', async () => {
        const res = await request(app).put('/api/personas/abc').set(ADMIN).send({ nombre: 'Ana' });
        expect(res.status).toBe(400);
        expect(res.body).toEqual(expect.objectContaining({ success: false, message: 'Datos inválidos' }));
        expect(res.body.errors).toEqual([expect.objectContaining({ field: 'id' })]);
        expect(updateSpy).not.toHaveBeenCalled();
    });

    // Regresión: el body se validaba en el controller y su catch leía ZodError.errors, que en Zod 4
    // no existe: el 400 llevaba el JSON interno de Zod como string en `message` y sin `errors`.
    test('body inválido responde 400 con el contrato estándar (message fijo y errors[])', async () => {
        const res = await request(app).put('/api/personas/5').set(ADMIN).send({ email: 'malo', telefono: 'abc' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Datos inválidos');
        expect(Array.isArray(res.body.errors)).toBe(true);
        expect(res.body.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ field: 'email', message: expect.any(String) }),
                expect.objectContaining({ field: 'telefono', message: expect.any(String) }),
            ]),
        );
        expect(updateSpy).not.toHaveBeenCalled();
    });

    test('identificadorTipo sin identificadorValor: 400 estándar con el mensaje de la regla', async () => {
        const res = await request(app).put('/api/personas/5').set(ADMIN).send({ identificadorTipo: 'DNI' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Datos inválidos');
        expect(res.body.errors).toEqual([
            expect.objectContaining({ message: 'identificadorTipo e identificadorValor deben venir juntos' }),
        ]);
        expect(updateSpy).not.toHaveBeenCalled();
    });

    test('formato de identificador inválido apunta al campo identificadorValor', async () => {
        const res = await request(app).put('/api/personas/5').set(ADMIN).send({ identificadorTipo: 'DNI', identificadorValor: 'abc' });
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([expect.objectContaining({ field: 'identificadorValor' })]);
        expect(updateSpy).not.toHaveBeenCalled();
    });

    test('el body se valida una sola vez, en la ruta (el controller no vuelve a parsear)', async () => {
        const res = await request(app).put('/api/personas/5').set(ADMIN).send({ nombre: 'Ana' });
        expect(res.status).toBe(200);
        expect(updateSchemaParseSpy).not.toHaveBeenCalled();
    });

    test('body válido llega al service sin campos fuera del contrato', async () => {
        const res = await request(app).put('/api/personas/5').set(ADMIN).send({ nombre: 'Ana', estadoOperativo: 'ELIMINADO' });
        expect(res.status).toBe(200);
        expect(updateSpy).toHaveBeenCalledWith(5, { nombre: 'Ana' });
    });

    test('valores nulos permitidos por el contrato (telefono, email) llegan al service', async () => {
        await request(app).put('/api/personas/5').set(ADMIN).send({ telefono: null, email: null, inmobiliariaId: null });
        expect(updateSpy).toHaveBeenCalledWith(5, { telefono: null, email: null, inmobiliariaId: null });
    });

    // Política de body vacío (#257 bloque 3): un update sin ningún campo del contrato es 400.
    test.each([[{}], [{ campoInventado: 1 }], [{ estadoOperativo: 'ELIMINADO' }]])('%j responde 400 sin llamar al service', async (body) => {
        const res = await request(app).put('/api/personas/5').set(ADMIN).send(body);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Datos inválidos');
        expect(updateSpy).not.toHaveBeenCalled();
    });

    test('RBAC sin cambios: TECNICO 403 sin llegar al service', async () => {
        const res = await request(app).put('/api/personas/5').set(authHeader('TECNICO')).send({ nombre: 'Ana' });
        expect(res.status).toBe(403);
        expect(updateSpy).not.toHaveBeenCalled();
    });
});

// El controller revalidaba con createPersonaSchema.parse y releía jefeDeFamiliaId del body con
// Number(): el schema ya entrega el DTO tipado. Refactor sin cambio de contrato.
describe('POST /api/personas', () => {
    const base = { identificadorTipo: 'DNI', identificadorValor: '12345678', nombre: 'Ana', apellido: 'Paz' };
    const post = (body: Record<string, unknown>, auth = ADMIN) => request(app).post('/api/personas').set(auth).send(body);

    test('body válido llega al service como DTO (identificador normalizado, IDs number)', async () => {
        const res = await post({
            identificadorTipo: 'CUIL',
            identificadorValor: ' 20-12345678-3 ',
            nombre: 'Ana',
            apellido: 'Paz',
            telefono: 1155550000,
            email: 'ana@example.com',
            jefeDeFamiliaId: 9,
            inmobiliariaId: 4,
            categoria: 'PROPIETARIO',
        });
        expect(res.status).toBe(201);
        expect(res.body).toEqual(expect.objectContaining({ success: true, message: 'Persona creada exitosamente' }));
        expect(createSpy).toHaveBeenCalledTimes(1);
        expect(createSpy).toHaveBeenCalledWith(
            {
                identificadorTipo: 'CUIL',
                identificadorValor: '20123456783',
                nombre: 'Ana',
                apellido: 'Paz',
                razonSocial: undefined,
                telefono: 1155550000,
                email: 'ana@example.com',
                jefeDeFamiliaId: 9,
                inmobiliariaId: 4,
            },
            expect.objectContaining({ role: 'ADMINISTRADOR' }),
        );
    });

    test('sin jefeDeFamiliaId ni inmobiliariaId el DTO no incluye esas claves', async () => {
        await post(base);
        const dto = createSpy.mock.calls[0][0];
        expect(dto).not.toHaveProperty('jefeDeFamiliaId');
        expect(dto).not.toHaveProperty('inmobiliariaId');
    });

    test('el body se valida una sola vez, en la ruta (el controller no vuelve a parsear)', async () => {
        const res = await post(base);
        expect(res.status).toBe(201);
        expect(createSchemaParseSpy).not.toHaveBeenCalled();
    });

    test.each([
        ['falta nombre y apellido', { identificadorTipo: 'DNI', identificadorValor: '12345678' }],
        ['DNI inválido', { ...base, identificadorValor: 'abc' }],
        ['jefeDeFamiliaId no numérico', { ...base, jefeDeFamiliaId: 'abc' }],
        ['jefeDeFamiliaId nulo', { ...base, jefeDeFamiliaId: null }],
    ])('%s responde 400 estándar sin llamar al service', async (_label, body) => {
        const res = await post(body);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Datos inválidos');
        expect(Array.isArray(res.body.errors)).toBe(true);
        expect(createSpy).not.toHaveBeenCalled();
    });

    test('RBAC sin cambios: TECNICO 403', async () => {
        const res = await post(base, authHeader('TECNICO'));
        expect(res.status).toBe(403);
        expect(createSpy).not.toHaveBeenCalled();
    });
});

// GET /cuil/:cuil era la única ruta de Persona sin validateParams: el string llegaba crudo al
// service. El CUIL es un string de 11 dígitos (no un number: no es un ID de PK).
describe('GET /api/personas/cuil/:cuil', () => {
    const get = (cuil: string, auth = ADMIN) => request(app).get(`/api/personas/cuil/${encodeURIComponent(cuil)}`).set(auth);

    test.each([
        ['con guiones', '20-12345678-3'],
        ['con puntos', '20.12345678.3'],
        ['con espacios', '20 12345678 3'],
        ['con espacios externos', ' 20123456783 '],
        ['solo dígitos', '20123456783'],
    ])('CUIL %s llega al service normalizado y como string', async (_label, cuil) => {
        const res = await get(cuil);
        expect(res.status).toBe(200);
        expect(findByCuilSpy).toHaveBeenCalledTimes(1);
        expect(findByCuilSpy).toHaveBeenCalledWith('20123456783');
        expect(typeof findByCuilSpy.mock.calls[0][0]).toBe('string');
    });

    test('mantiene el 404 cuando el CUIL es válido pero no existe', async () => {
        findByCuilSpy.mockResolvedValue(null as any);
        const res = await get('20-12345678-3');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ success: false, message: 'Persona no encontrada' });
    });

    test.each([
        ['letras', 'abc'],
        ['10 dígitos', '1234567890'],
        ['12 dígitos', '123456789012'],
        ['solo espacios', '   '],
        ['un espacio', ' '],
        ['dígitos con letra', '2012345678a'],
        ['guiones sin dígitos', '--'],
        ['dígitos no ASCII', '٢٠١٢٣٤٥٦٧٨٣'],
        ['demasiado largo', '2'.repeat(300)],
    ])('CUIL inválido (%s) responde 400 estándar sin llamar al service', async (_label, cuil) => {
        const res = await get(cuil);
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Datos inválidos');
        expect(res.body.errors).toEqual([expect.objectContaining({ field: 'cuil' })]);
        expect(findByCuilSpy).not.toHaveBeenCalled();
    });

    test('RBAC sin cambios: INMOBILIARIA 403 sin llegar al service', async () => {
        const res = await get('20123456783', authHeader('INMOBILIARIA', 5));
        expect(res.status).toBe(403);
        expect(findByCuilSpy).not.toHaveBeenCalled();
    });

    test('RBAC sin cambios: TECNICO puede consultar', async () => {
        const res = await get('20123456783', authHeader('TECNICO'));
        expect(res.status).toBe(200);
    });
});

describe('POST /api/personas/:id/grupo-familiar/miembros', () => {
    const miembro = { nombre: 'Ana', apellido: 'Paz', identificadorTipo: 'DNI', identificadorValor: '12345678' };
    const post = (body: Record<string, unknown>, id = '5', auth = ADMIN) =>
        request(app).post(`/api/personas/${id}/grupo-familiar/miembros`).set(auth).send(body);

    test.each([
        ['DNI con letras', { ...miembro, identificadorValor: 'abc' }],
        ['DNI de 7 dígitos', { ...miembro, identificadorValor: '1234567' }],
        ['CUIT con formato inválido', { ...miembro, identificadorTipo: 'CUIT', identificadorValor: '20-123-9' }],
        ['tipo de identificador inexistente', { ...miembro, identificadorTipo: 'LIBRETA' }],
        ['nombre no textual', { ...miembro, nombre: 123 }],
        ['apellido vacío tras trim', { ...miembro, apellido: '   ' }],
        ['falta identificadorValor', { nombre: 'Ana', apellido: 'Paz', identificadorTipo: 'DNI' }],
    ])('%s responde 400 sin llamar al service', async (_label, body) => {
        const res = await post(body);
        expect(res.status).toBe(400);
        expect(crearMiembroSpy).not.toHaveBeenCalled();
    });

    test('identificador válido llega normalizado y sin campos extra', async () => {
        const res = await post({
            nombre: '  Ana ',
            apellido: ' Paz ',
            identificadorTipo: 'DNI',
            identificadorValor: ' 12345678 ',
            categoria: 'PROPIETARIO',
            jefeDeFamiliaId: 99,
        });
        expect(res.status).toBe(201);
        expect(crearMiembroSpy).toHaveBeenCalledWith(5, {
            nombre: 'Ana',
            apellido: 'Paz',
            identificadorTipo: 'DNI',
            identificadorValor: '12345678',
        });
    });

    test('CUIT con guiones se normaliza igual que en el alta de Persona', async () => {
        await post({ ...miembro, identificadorTipo: 'CUIT', identificadorValor: '20-12345678-9' });
        expect(crearMiembroSpy).toHaveBeenCalledWith(5, expect.objectContaining({ identificadorValor: '20123456789' }));
    });

    test('RBAC sin cambios: TECNICO 403', async () => {
        const res = await post(miembro, '5', authHeader('TECNICO'));
        expect(res.status).toBe(403);
        expect(crearMiembroSpy).not.toHaveBeenCalled();
    });
});

describe('DELETE /api/personas/:id/grupo-familiar/miembros/:miembroId', () => {
    const del = (id: string, miembroId: string) =>
        request(app).delete(`/api/personas/${id}/grupo-familiar/miembros/${miembroId}`).set(ADMIN);

    test.each([['1.5'], ['-1'], ['1e2'], ['0x10'], ['5abc'], ['0'], ['007'], ['99999999999']])(
        'miembroId inválido (%s) responde 400 sin llamar al service',
        async (miembroId) => {
            const res = await del('5', miembroId);
            expect(res.status).toBe(400);
            expect(eliminarMiembroSpy).not.toHaveBeenCalled();
        },
    );

    test.each([['1e2'], ['0'], ['abc']])('id de titular inválido (%s) responde 400', async (id) => {
        const res = await del(id, '9');
        expect(res.status).toBe(400);
        expect(eliminarMiembroSpy).not.toHaveBeenCalled();
    });

    test('ids válidos llegan como números', async () => {
        const res = await del('5', '9');
        expect(res.status).toBe(200);
        expect(eliminarMiembroSpy).toHaveBeenCalledWith(5, 9);
    });
});

describe('GET /api/personas — query', () => {
    test.each([
        ['estado=FOO'],
        ['view=XYZ'],
        ['includeInactive=yes'],
        ['includeInactive=1'],
        ['includeInactive=0'],
        ['includeInactive='],
        ['includeInactive=TRUE'],
        ['includeInactive=true&includeInactive=false'],
        ['limit=abc'],
        ['limit=0'],
        ['limit=1.5'],
        ['limit=1e2'],
        ['limit=010'],
        ['limit=2147483648'],
        ['limit=10&limit=20'],
        ['q=a&q=b'],
    ])('query inválida (%s) responde 400 sin llamar al service', async (qs) => {
        const res = await request(app).get(`/api/personas?${qs}`).set(ADMIN);
        expect(res.status).toBe(400);
        expect(findAllSpy).not.toHaveBeenCalled();
    });

    test('query válida llega convertida al service', async () => {
        const res = await request(app)
            .get('/api/personas?view=PROPIETARIOS&includeInactive=true&estado=ELIMINADO&q=juan&limit=20')
            .set(ADMIN);
        expect(res.status).toBe(200);
        expect(findAllSpy).toHaveBeenCalledWith(expect.objectContaining({ role: 'ADMINISTRADOR' }), {
            view: 'PROPIETARIOS',
            q: 'juan',
            includeInactive: true,
            estadoOperativo: 'ELIMINADO',
            limit: 20,
        });
    });

    test('includeInactive=false llega como boolean false y limit como number', async () => {
        const res = await request(app).get('/api/personas?includeInactive=false&limit=2147483647').set(ADMIN);
        expect(res.status).toBe(200);
        const query = findAllSpy.mock.calls[0][1] as { includeInactive: unknown; limit: unknown };
        expect(query.includeInactive).toBe(false);
        expect(query.limit).toBe(2147483647);
        expect(typeof query.limit).toBe('number');
    });

    test('claves desconocidas no llegan al service (el contrato del controller no cambia)', async () => {
        const res = await request(app).get('/api/personas?view=CLIENTES&page=2&pageSize=10&sortBy=nombre&foo[]=1').set(ADMIN);
        expect(res.status).toBe(200);
        expect(findAllSpy).toHaveBeenCalledWith(expect.anything(), {
            view: 'CLIENTES',
            q: undefined,
            includeInactive: false,
            estadoOperativo: undefined,
            limit: undefined,
        });
    });

    test('sin query mantiene los defaults del controller', async () => {
        await request(app).get('/api/personas').set(ADMIN);
        expect(findAllSpy).toHaveBeenCalledWith(expect.anything(), {
            view: 'ALL',
            q: undefined,
            includeInactive: false,
            estadoOperativo: undefined,
            limit: undefined,
        });
    });
});
