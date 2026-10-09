// Contrato ruta → controller → service de los listados filtrados por lote.
// En Express 5 validateQuery no reemplaza req.query: estos tests verifican que el
// controller entregue al service una query tipada (loteId numérico, sin claves extra)
// y que una query inválida corte con 400 antes de llegar al service.
jest.mock('../../../src/services/reserva.service', () => ({
    getAllReservas: jest.fn(),
}));

jest.mock('../../../src/services/venta.service', () => ({
    getAllVentas: jest.fn(),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../src/app';
import { initWebEnv, resetWebEnvForTests } from '../../../src/config/env';
import { getAllReservas } from '../../../src/services/reserva.service';
import { getAllVentas } from '../../../src/services/venta.service';

const JWT_SECRET = 'unit-test-jwt-secret';

const getAllReservasMock = getAllReservas as jest.Mock;
const getAllVentasMock = getAllVentas as jest.Mock;

function tokenFor(role: string, inmobiliariaId?: number) {
    return jwt.sign(
        { sub: 1, email: 'test@example.com', role, ...(inmobiliariaId != null && { inmobiliariaId }) },
        JWT_SECRET,
    );
}

function auth(role: string, inmobiliariaId?: number) {
    return { Authorization: `Bearer ${tokenFor(role, inmobiliariaId)}` };
}

beforeAll(() => {
    initWebEnv({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/federala',
        JWT_SECRET,
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_KEY: 'unit-test-service-key',
    });
});

afterAll(() => {
    resetWebEnvForTests();
});

beforeEach(() => {
    getAllReservasMock.mockReset().mockResolvedValue({ reservas: [], total: 0 });
    getAllVentasMock.mockReset().mockResolvedValue([]);
});

describe('GET /api/reservas — query del listado', () => {
    test('loteId + estado + estadoOperativo llegan tipados al service', async () => {
        const res = await request(app)
            .get('/api/reservas?loteId=25&estado=ACTIVA&estadoOperativo=OPERATIVO')
            .set(auth('ADMINISTRADOR'));

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: { reservas: [], total: 0 } });
        expect(getAllReservasMock).toHaveBeenCalledTimes(1);
        const [query, user] = getAllReservasMock.mock.calls[0];
        expect(query).toEqual({ loteId: 25, estado: 'ACTIVA', estadoOperativo: 'OPERATIVO' });
        expect(typeof query.loteId).toBe('number');
        expect(user).toEqual(expect.objectContaining({ role: 'ADMINISTRADOR' }));
    });

    test('sin query: el service recibe una query vacía (compatibilidad)', async () => {
        const res = await request(app).get('/api/reservas').set(auth('GESTOR'));
        expect(res.status).toBe(200);
        expect(getAllReservasMock.mock.calls[0][0]).toEqual({});
    });

    test('parámetros fuera de los soportados no llegan al service', async () => {
        const res = await request(app)
            .get('/api/reservas?loteId=25&inmobiliariaId=9&clienteId=3&foo=bar')
            .set(auth('INMOBILIARIA', 5));
        expect(res.status).toBe(200);
        expect(getAllReservasMock.mock.calls[0][0]).toEqual({ loteId: 25 });
        expect(getAllReservasMock.mock.calls[0][1]).toEqual(
            expect.objectContaining({ role: 'INMOBILIARIA', inmobiliariaId: 5 }),
        );
    });

    test.each([
        ['loteId=abc'],
        ['loteId=0'],
        ['loteId=25.5'],
        ['estado=FOO'],
        ['estadoOperativo=TODOS'],
    ])('query inválida (%s) responde 400 sin llamar al service', async (qs) => {
        const res = await request(app).get(`/api/reservas?${qs}`).set(auth('ADMINISTRADOR'));
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(getAllReservasMock).not.toHaveBeenCalled();
    });

    test('RBAC sin cambios: sin token 401, TECNICO 403', async () => {
        expect((await request(app).get('/api/reservas?loteId=25')).status).toBe(401);
        const res = await request(app).get('/api/reservas?loteId=25').set(auth('TECNICO'));
        expect(res.status).toBe(403);
        expect(getAllReservasMock).not.toHaveBeenCalled();
    });
});

describe('GET /api/ventas — query del listado', () => {
    test('loteId + estadoOperativo llegan tipados al service', async () => {
        const res = await request(app)
            .get('/api/ventas?loteId=25&estadoOperativo=OPERATIVO')
            .set(auth('ADMINISTRADOR'));

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: [] });
        const [query] = getAllVentasMock.mock.calls[0];
        expect(query).toEqual({ loteId: 25, estadoOperativo: 'OPERATIVO' });
        expect(typeof query.loteId).toBe('number');
    });

    test('estado se pasa al service; otros parámetros se ignoran', async () => {
        await request(app)
            .get('/api/ventas?loteId=25&estado=INICIADA&compradorId=4&page=2')
            .set(auth('GESTOR'));
        expect(getAllVentasMock.mock.calls[0][0]).toEqual({ loteId: 25, estado: 'INICIADA' });
    });

    test.each([['loteId=abc'], ['loteId=0'], ['estado=FOO']])(
        'query inválida (%s) responde 400 sin llamar al service',
        async (qs) => {
            const res = await request(app).get(`/api/ventas?${qs}`).set(auth('ADMINISTRADOR'));
            expect(res.status).toBe(400);
            expect(getAllVentasMock).not.toHaveBeenCalled();
        },
    );

    test('RBAC sin cambios: INMOBILIARIA y TECNICO reciben 403', async () => {
        for (const role of ['INMOBILIARIA', 'TECNICO']) {
            const res = await request(app).get('/api/ventas?loteId=25').set(auth(role, 5));
            expect(res.status).toBe(403);
        }
        expect(getAllVentasMock).not.toHaveBeenCalled();
    });
});
