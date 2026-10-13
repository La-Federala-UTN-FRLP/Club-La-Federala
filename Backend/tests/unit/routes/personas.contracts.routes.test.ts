// Contratos HTTP de Personas cubiertos por middleware de validación:
// - PUT /:id: la ruta aplicaba el schema del body a req.params (no-op); el controller
//   seguía validando, así que el body ya estaba protegido.
// - POST /:id/grupo-familiar/miembros: solo había un chequeo manual de presencia.
// - DELETE /:id/grupo-familiar/miembros/:miembroId: miembroId solo pasaba por Number()+isNaN.
// - GET /: la query llegaba sin validar hasta Prisma (estado=FOO → 500).
import request from 'supertest';
import app from '../../../src/app';
import { PersonaService } from '../../../src/services/persona.service';
import { authHeader, useTestWebEnv } from '../../support/http';

const updateSpy = jest.spyOn(PersonaService.prototype, 'update');
const crearMiembroSpy = jest.spyOn(PersonaService.prototype, 'crearMiembroFamiliar');
const eliminarMiembroSpy = jest.spyOn(PersonaService.prototype, 'eliminarMiembroFamiliar');
const findAllSpy = jest.spyOn(PersonaService.prototype, 'findAll');

useTestWebEnv();

beforeEach(() => {
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

    test('body inválido responde 400 sin llamar al service', async () => {
        const res = await request(app).put('/api/personas/5').set(ADMIN).send({ email: 'malo', telefono: 'abc' });
        expect(res.status).toBe(400);
        expect(updateSpy).not.toHaveBeenCalled();
    });

    test('body válido llega al service sin campos fuera del contrato', async () => {
        const res = await request(app).put('/api/personas/5').set(ADMIN).send({ nombre: 'Ana', estadoOperativo: 'ELIMINADO' });
        expect(res.status).toBe(200);
        expect(updateSpy).toHaveBeenCalledWith(5, { nombre: 'Ana' });
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
        ['limit=abc'],
        ['limit=0'],
        ['limit=1.5'],
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
