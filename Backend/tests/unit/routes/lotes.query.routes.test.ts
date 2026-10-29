// Contrato de GET /api/lotes: lo que Zod valida es lo que llega al service.
// Regresión: el controller pasaba req.query crudo. En Express 5 validateQuery no reemplaza
// req.query, así que los IDs llegaban como string ("007", "1e2") y las claves que el schema
// no declara (foo, estado[], y deudor, que el service sí lee) viajaban sin validar: deudor=yes
// respondía 200 con todos los lotes, sin filtrar.
jest.mock('../../../src/services/lote.service', () => ({
    getAllLotes: jest.fn(),
}));

import request from 'supertest';
import app from '../../../src/app';
import { getAllLotes } from '../../../src/services/lote.service';
import { authHeader, useTestWebEnv } from '../../support/http';

const getAllLotesMock = getAllLotes as jest.Mock;

useTestWebEnv();

beforeEach(() => {
    getAllLotesMock.mockReset().mockResolvedValue({ lotes: [], total: 0 });
});

const ADMIN = authHeader('ADMINISTRADOR');
const get = (qs: string) => request(app).get(`/api/lotes${qs}`).set(ADMIN);

describe('GET /api/lotes — query', () => {
    test('sin query el service recibe una query vacía y el rol del usuario', async () => {
        const res = await get('');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: { lotes: [], total: 0 } });
        expect(getAllLotesMock).toHaveBeenCalledWith({}, 'ADMINISTRADOR');
    });

    test('filtros enum llegan al service sin cambios', async () => {
        const res = await get('?estado=Disponible&subestado=Construido&tipo=Lote%20Venta&ocupacion=ALQUILADO');
        expect(res.status).toBe(200);
        expect(getAllLotesMock.mock.calls[0][0]).toEqual({
            estado: 'Disponible',
            subestado: 'Construido',
            tipo: 'Lote Venta',
            ocupacion: 'ALQUILADO',
        });
    });

    test.each(['ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA', 'TECNICO'])('el rol %s llega al service', async (role) => {
        await request(app).get('/api/lotes').set(authHeader(role, 5));
        expect(getAllLotesMock).toHaveBeenCalledWith({}, role);
    });
});

describe('GET /api/lotes — deudor', () => {
    test.each([
        ['true', true],
        ['false', false],
    ])('deudor=%s llega al service como boolean %s', async (valor, esperado) => {
        const res = await get(`?deudor=${valor}`);
        expect(res.status).toBe(200);
        const query = getAllLotesMock.mock.calls[0][0];
        expect(query).toEqual({ deudor: esperado });
        expect(typeof query.deudor).toBe('boolean');
    });

    test('deudor se combina con el resto de los filtros', async () => {
        await get('?estado=Disponible&deudor=true&propietarioId=7');
        expect(getAllLotesMock.mock.calls[0][0]).toEqual({ estado: 'Disponible', deudor: true, propietarioId: 7 });
    });

    test.each([['deudor=yes'], ['deudor=1'], ['deudor=0'], ['deudor='], ['deudor'], ['deudor=TRUE'], ['deudor=True'], ['deudor=true&deudor=false']])(
        'valor no booleano (%s) responde 400 sin llamar al service',
        async (qs) => {
            const res = await get(`?${qs}`);
            expect(res.status).toBe(400);
            expect(res.body).toEqual(expect.objectContaining({ success: false, message: 'Datos inválidos' }));
            expect(res.body.errors).toEqual([expect.objectContaining({ field: 'deudor' })]);
            expect(getAllLotesMock).not.toHaveBeenCalled();
        },
    );
});

describe('GET /api/lotes — IDs de query', () => {
    test.each([
        ['propietarioId', 7],
        ['ubicacionId', 5],
        ['propietarioId', 2147483647],
    ])('%s=%s llega al service como number', async (campo, valor) => {
        const res = await get(`?${campo}=${valor}`);
        expect(res.status).toBe(200);
        const query = getAllLotesMock.mock.calls[0][0];
        expect(query).toEqual({ [campo]: valor });
        expect(typeof query[campo]).toBe('number');
    });

    // Política común de IDs: decimal positivo canónico dentro de int4 (la misma de los IDs de path).
    test.each([
        ['1e2'], ['007'], ['0x10'], ['2147483648'], ['+5'], ['%2012'], ['0'], ['-1'], ['1.5'], ['abc'], [''],
    ])('propietarioId=%s responde 400 sin llamar al service', async (valor) => {
        const res = await get(`?propietarioId=${valor}`);
        expect(res.status).toBe(400);
        expect(getAllLotesMock).not.toHaveBeenCalled();
    });

    test('ubicacionId no canónico responde 400', async () => {
        const res = await get('?ubicacionId=007');
        expect(res.status).toBe(400);
        expect(getAllLotesMock).not.toHaveBeenCalled();
    });

    test('ID repetido responde 400 sin llamar al service', async () => {
        const res = await get('?propietarioId=1&propietarioId=2');
        expect(res.status).toBe(400);
        expect(getAllLotesMock).not.toHaveBeenCalled();
    });
});

describe('GET /api/lotes — claves desconocidas y valores inválidos', () => {
    test.each([['foo=bar'], ['foo[]=1'], ['foo[bar]=1'], ['estado[]=Disponible'], ['page=2&pageSize=10']])(
        'clave desconocida (%s): responde 200 y no llega al service',
        async (qs) => {
            const res = await get(`?${qs}`);
            expect(res.status).toBe(200);
            expect(getAllLotesMock.mock.calls[0][0]).toEqual({});
        },
    );

    test('las claves desconocidas se descartan sin afectar a las declaradas', async () => {
        await get('?foo=bar&estado=Vendido&x[]=1');
        expect(getAllLotesMock.mock.calls[0][0]).toEqual({ estado: 'Vendido' });
    });

    test.each([['estado=Alquilado'], ['estado=Disponible&estado=Vendido'], ['tipo=otro'], ['ocupacion=alquilado']])(
        'valor inválido (%s) responde 400 sin llamar al service',
        async (qs) => {
            const res = await get(`?${qs}`);
            expect(res.status).toBe(400);
            expect(getAllLotesMock).not.toHaveBeenCalled();
        },
    );
});

describe('GET /api/lotes — RBAC sin cambios', () => {
    test('sin token responde 401', async () => {
        const res = await request(app).get('/api/lotes?deudor=true');
        expect(res.status).toBe(401);
        expect(getAllLotesMock).not.toHaveBeenCalled();
    });
});
