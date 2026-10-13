// Contrato de GET /api/inmobiliarias: el listado solo filtra por estadoOperativo.
// Regresión: no había validateQuery y el controller pasaba req.query completo al service,
// así que estadoOperativo=FOO llegaba hasta Prisma (500).
jest.mock('../../../src/services/inmobiliaria.service', () => ({
    getAllInmobiliarias: jest.fn(),
}));

import request from 'supertest';
import app from '../../../src/app';
import { getAllInmobiliarias } from '../../../src/services/inmobiliaria.service';
import { authHeader, useTestWebEnv } from '../../support/http';

const getAllInmobiliariasMock = getAllInmobiliarias as jest.Mock;

useTestWebEnv();

beforeEach(() => {
    getAllInmobiliariasMock.mockReset().mockResolvedValue({ inmobiliarias: [], total: 0 });
});

describe('GET /api/inmobiliarias — query', () => {
    test.each([['ELIMINADO'], ['OPERATIVO']])('estadoOperativo=%s llega al service', async (estadoOperativo) => {
        const res = await request(app).get(`/api/inmobiliarias?estadoOperativo=${estadoOperativo}`).set(authHeader('GESTOR'));
        expect(res.status).toBe(200);
        expect(getAllInmobiliariasMock).toHaveBeenCalledWith({ estadoOperativo });
    });

    test('sin query el service recibe filtros vacíos (default OPERATIVO en el service)', async () => {
        await request(app).get('/api/inmobiliarias').set(authHeader('ADMINISTRADOR'));
        expect(getAllInmobiliariasMock).toHaveBeenCalledWith({});
    });

    test('parámetros que el listado no soporta se ignoran (los envía el frontend actual)', async () => {
        const res = await request(app)
            .get('/api/inmobiliarias?estado=OPERATIVO&pageSize=1000')
            .set(authHeader('ADMINISTRADOR'));
        expect(res.status).toBe(200);
        expect(getAllInmobiliariasMock).toHaveBeenCalledWith({});
    });

    test.each([['estadoOperativo=FOO'], ['estadoOperativo=operativo'], ['estadoOperativo=OPERATIVO&estadoOperativo=ELIMINADO']])(
        'query inválida (%s) responde 400 sin llamar al service',
        async (qs) => {
            const res = await request(app).get(`/api/inmobiliarias?${qs}`).set(authHeader('ADMINISTRADOR'));
            expect(res.status).toBe(400);
            expect(getAllInmobiliariasMock).not.toHaveBeenCalled();
        },
    );

    test('RBAC sin cambios: INMOBILIARIA y TECNICO 403', async () => {
        for (const role of ['INMOBILIARIA', 'TECNICO']) {
            const res = await request(app).get('/api/inmobiliarias').set(authHeader(role, 5));
            expect(res.status).toBe(403);
        }
        expect(getAllInmobiliariasMock).not.toHaveBeenCalled();
    });
});
