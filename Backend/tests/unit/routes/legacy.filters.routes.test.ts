// Los 17 filtros legacy de listados (lotes, reservas, ventas) estaban declarados en los schemas pero
// ningún service los implementaba. Regresión: validaban formato y respondían 400 por un filtro que no
// filtraba (/reservas?clienteId=abc, /ventas?montoMin=abc, /lotes?superficieMin=abc).
// Contrato actual: son claves desconocidas. Zod las descarta (strip), no producen 400 y no llegan al
// service. Los filtros que sí funcionan conservan su validación.
jest.mock('../../../src/services/lote.service', () => ({ getAllLotes: jest.fn() }));
jest.mock('../../../src/services/reserva.service', () => ({ getAllReservas: jest.fn() }));
jest.mock('../../../src/services/venta.service', () => ({
    getAllVentas: jest.fn(),
    getVentasByInmobiliaria: jest.fn(),
}));

import request from 'supertest';
import app from '../../../src/app';
import { getAllLotes } from '../../../src/services/lote.service';
import { getAllReservas } from '../../../src/services/reserva.service';
import { getAllVentas, getVentasByInmobiliaria } from '../../../src/services/venta.service';
import { authHeader, useTestWebEnv } from '../../support/http';

const getAllLotesMock = getAllLotes as jest.Mock;
const getAllReservasMock = getAllReservas as jest.Mock;
const getAllVentasMock = getAllVentas as jest.Mock;
const getVentasByInmobiliariaMock = getVentasByInmobiliaria as jest.Mock;

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');

beforeEach(() => {
    getAllLotesMock.mockReset().mockResolvedValue({ lotes: [], total: 0 });
    getAllReservasMock.mockReset().mockResolvedValue({ reservas: [], total: 0 });
    getAllVentasMock.mockReset().mockResolvedValue([]);
    getVentasByInmobiliariaMock.mockReset().mockResolvedValue([]);
});

// Cada filtro con un valor que su schema anterior rechazaba (formato inválido).
const FILTROS_LEGACY: { url: string; mock: () => jest.Mock; filtros: [string, string][] }[] = [
    {
        url: '/api/lotes',
        mock: () => getAllLotesMock,
        filtros: [
            ['superficieMin', 'abc'],
            ['superficieMax', 'abc'],
            ['fechaCreacionFrom', 'no-es-fecha'],
            ['fechaCreacionTo', 'no-es-fecha'],
        ],
    },
    {
        url: '/api/reservas',
        mock: () => getAllReservasMock,
        filtros: [
            ['desde', 'no-es-fecha'],
            ['hasta', 'no-es-fecha'],
            ['clienteId', 'abc'],
            ['inmobiliariaId', 'abc'],
            ['sena', 'abc'],
            ['fechaFinReservaDesde', 'no-es-fecha'],
            ['fechaFinReservaHasta', 'no-es-fecha'],
        ],
    },
    {
        url: '/api/ventas',
        mock: () => getAllVentasMock,
        filtros: [
            ['compradorId', 'abc'],
            ['vendedorId', 'abc'],
            ['fechaVentaFrom', 'no-es-fecha'],
            ['fechaVentaTo', 'no-es-fecha'],
            ['montoMin', 'abc'],
            ['montoMax', 'abc'],
        ],
    },
];

const CASOS = FILTROS_LEGACY.flatMap((r) => r.filtros.map(([filtro, invalido]) => ({ url: r.url, mock: r.mock, filtro, invalido })));

describe('filtros legacy eliminados: claves desconocidas descartadas', () => {
    test('son exactamente los 17 filtros', () => {
        expect(CASOS).toHaveLength(17);
    });

    test.each(CASOS)('GET $url?$filtro=$invalido responde 200 y el service no recibe $filtro', async ({ url, mock, filtro, invalido }) => {
        const res = await request(app).get(`${url}?${filtro}=${invalido}`).set(ADMIN);
        expect(res.status).toBe(200);
        expect(mock()).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(mock().mock.calls[0][0])).not.toContain(filtro);
    });

    test.each(CASOS)('GET $url?$filtro=<valor válido> tampoco llega al service', async ({ url, mock, filtro }) => {
        const valido = /Id$/.test(filtro) ? '4' : /(sena|monto|superficie)/i.test(filtro) ? '100' : '2026-01-01';
        const res = await request(app).get(`${url}?${filtro}=${valido}`).set(ADMIN);
        expect(res.status).toBe(200);
        expect(mock().mock.calls[0][0]).toEqual({});
    });
});

describe('GET /api/reservas: sin los filtros muertos solo quedan los reales', () => {
    test('clienteId=abc responde 200 y el service recibe el DTO sin clienteId', async () => {
        const res = await request(app).get('/api/reservas?clienteId=abc&loteId=25').set(ADMIN);
        expect(res.status).toBe(200);
        expect(getAllReservasMock.mock.calls[0][0]).toEqual({ loteId: 25 });
    });

    test('desde > hasta ya no es un error (el rango no se aplicaba)', async () => {
        const res = await request(app).get('/api/reservas?desde=2025-12-31&hasta=2025-01-01').set(ADMIN);
        expect(res.status).toBe(200);
        expect(getAllReservasMock.mock.calls[0][0]).toEqual({});
    });

    test.each([['loteId=abc'], ['estado=FOO'], ['estadoOperativo=TODOS'], ['loteId=1e2']])('el filtro real inválido (%s) sigue respondiendo 400', async (qs) => {
        const res = await request(app).get(`/api/reservas?${qs}`).set(ADMIN);
        expect(res.status).toBe(400);
        expect(getAllReservasMock).not.toHaveBeenCalled();
    });
});

describe('GET /api/ventas: sin los filtros muertos solo quedan los reales', () => {
    test('montoMin=abc responde 200 y el service recibe el DTO sin montoMin', async () => {
        const res = await request(app).get('/api/ventas?montoMin=abc&estado=INICIADA').set(ADMIN);
        expect(res.status).toBe(200);
        expect(getAllVentasMock.mock.calls[0][0]).toEqual({ estado: 'INICIADA' });
    });

    test.each([['loteId=abc'], ['estado=FOO'], ['estadoOperativo=TODOS'], ['loteId=1e2']])('el filtro real inválido (%s) sigue respondiendo 400', async (qs) => {
        const res = await request(app).get(`/api/ventas?${qs}`).set(ADMIN);
        expect(res.status).toBe(400);
        expect(getAllVentasMock).not.toHaveBeenCalled();
    });
});

describe('GET /api/ventas/inmobiliaria/:id: schema propio con solo estadoOperativo', () => {
    // El endpoint solo filtra por estadoOperativo: el resto (incluidos loteId y estado, que sí son
    // filtros de GET /ventas) son claves desconocidas y no se validan.
    test.each([['loteId=1e2'], ['loteId=abc'], ['estado=FOO'], ['compradorId=007'], ['montoMin=abc']])(
        '%s se descarta: responde 200 con la query vacía',
        async (qs) => {
            const res = await request(app).get(`/api/ventas/inmobiliaria/5?${qs}`).set(ADMIN);
            expect(res.status).toBe(200);
            expect(getVentasByInmobiliariaMock.mock.calls[0][1]).toEqual({});
        },
    );

    test('estadoOperativo sigue validándose', async () => {
        const res = await request(app).get('/api/ventas/inmobiliaria/5?estadoOperativo=FOO').set(ADMIN);
        expect(res.status).toBe(400);
        expect(getVentasByInmobiliariaMock).not.toHaveBeenCalled();
    });
});

describe('GET /api/lotes: sin los filtros muertos solo quedan los reales', () => {
    test('superficieMin=abc responde 200 y el service recibe el DTO sin superficieMin', async () => {
        const res = await request(app).get('/api/lotes?superficieMin=abc&estado=Disponible&deudor=true').set(ADMIN);
        expect(res.status).toBe(200);
        expect(getAllLotesMock.mock.calls[0][0]).toEqual({ estado: 'Disponible', deudor: true });
    });
});
