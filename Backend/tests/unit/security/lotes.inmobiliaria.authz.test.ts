// Visibilidad de lotes para INMOBILIARIA (LOT-03, CCLF-30): app real + services reales, Prisma mockeado.
//
// INMOBILIARIA lee lotes, pero el backend no debe entregarle lo que la UI ya le oculta:
// lotes NO_DISPONIBLE, la deuda, documentos de propietario/inquilino, datos de ventas/reservas ni el
// titular de prioridades ajenas. ADMINISTRADOR, GESTOR y TECNICO quedan exactamente como estaban.
jest.mock('../../../src/config/prisma', () => {
    const { lotePrismaMock } = require('../../support/mocks/prisma');
    // GET /lotes/:id/promociones/activa usa promocion.findFirst (fuera del spec de Lote).
    return Object.assign(lotePrismaMock, { promocion: { findFirst: jest.fn() } });
});

import request from 'supertest';
import app from '../../../src/app';
import { getAllLotes } from '../../../src/services/lote.service';
import { lotePrismaMock, resetPrismaMock } from '../../support/mocks/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';

const prismaMock = lotePrismaMock as typeof lotePrismaMock & { promocion: { findFirst: jest.Mock } };

useTestWebEnv();

const TENANT = 5;
const OTRA_INMOBILIARIA = 6;

const persona = (id: number, nombre: string) => ({
    id, nombre, apellido: 'QA', razonSocial: null, identificadorTipo: 'DNI', identificadorValor: `9000000${id}`,
});

// Filas como las devuelve Prisma con el include del service (nuevas en cada llamada).
const lote = (id: number, estado: string, extra: Record<string, unknown> = {}) => ({
    id, numero: id, mapId: `Lote${id}-4`, tipo: 'LOTE_VENTA', estado, subestado: 'NO_CONSTRUIDO',
    precio: '30000', deuda: true, propietarioId: 1, inquilinoId: 2,
    propietario: persona(1, 'Propietario'),
    inquilino: persona(2, 'InquilinoLegacy'),
    alquileres: [{ id: 50 + id, estado: 'ACTIVO', inquilinoId: 3, fechaInicio: new Date('2026-01-01'), inquilino: persona(3, 'Inquilino') }],
    promociones: [],
    prioridad: [],
    ubicacion: { calle: 'MILANO', numero: 400 + id },
    fraccion: { numero: 4 },
    ...extra,
});

const prioridadDe = (id: number, inmobiliariaId: number | null) => ({
    id,
    inmobiliariaId,
    ownerType: inmobiliariaId == null ? 'CCLF' : 'INMOBILIARIA',
    inmobiliaria: inmobiliariaId == null ? null : { id: inmobiliariaId, nombre: `Inmobiliaria ${inmobiliariaId}` },
});

const filasListado = () => [
    lote(1, 'DISPONIBLE'),
    lote(2, 'CON_PRIORIDAD', { prioridad: [prioridadDe(70, OTRA_INMOBILIARIA)] }),
    lote(3, 'CON_PRIORIDAD', { prioridad: [prioridadDe(71, TENANT)] }),
    lote(4, 'CON_PRIORIDAD', { prioridad: [prioridadDe(72, null)] }),
];

const headerDe = (role: string) => authHeader(role, role === 'INMOBILIARIA' ? TENANT : undefined);
const getLotes = (role: string, qs = '') => request(app).get(`/api/lotes${qs}`).set(headerDe(role));
const getLote = (role: string, id: number) => request(app).get(`/api/lotes/${id}`).set(headerDe(role));
const whereListado = () => prismaMock.lote.findMany.mock.calls[0][0].where;

// La exclusión de NO_DISPONIBLE puede expresarse como NOT, not o notIn: se valida la intención.
const excluyeNoDisponible = (where: unknown) =>
    /"NOT":\{"estado":"NO_DISPONIBLE"\}|"not":"NO_DISPONIBLE"|"notIn":\[[^\]]*"NO_DISPONIBLE"/.test(JSON.stringify(where));

const documentosExpuestos = (l: any) =>
    [l.propietario, l.inquilino, l.alquilerActivo?.inquilino, ...(l.alquileres ?? []).map((a: any) => a.inquilino)]
        .filter(Boolean)
        .some((p: any) => 'identificadorTipo' in p || 'identificadorValor' in p);

beforeEach(() => {
    prismaMock.lote.findMany.mockImplementation(async () => filasListado());
    prismaMock.lote.count.mockResolvedValue(4);
});

afterEach(() => {
    resetPrismaMock(prismaMock);
    prismaMock.promocion.findFirst.mockReset();
});

describe('INMOBILIARIA · lotes NO_DISPONIBLE', () => {
    test('GET /api/lotes excluye NO_DISPONIBLE en la consulta', async () => {
        const res = await getLotes('INMOBILIARIA');
        expect(res.status).toBe(200);
        expect(excluyeNoDisponible(whereListado())).toBe(true);
    });

    test('GET /api/lotes?estado=No Disponible tampoco los trae', async () => {
        const res = await getLotes('INMOBILIARIA', `?estado=${encodeURIComponent('No Disponible')}`);
        expect(res.status).toBe(200);
        expect(excluyeNoDisponible(whereListado())).toBe(true);
    });

    test('GET /api/lotes/:id de un lote NO_DISPONIBLE → 404, igual que un lote inexistente', async () => {
        prismaMock.lote.findUnique.mockResolvedValueOnce(lote(9, 'NO_DISPONIBLE'));
        const noDisponible = await getLote('INMOBILIARIA', 9);
        prismaMock.lote.findUnique.mockResolvedValueOnce(null);
        const inexistente = await getLote('INMOBILIARIA', 999);

        expect(noDisponible.status).toBe(404);
        expect(noDisponible.body).toEqual(inexistente.body);
    });

    test('GET /api/lotes/:id/promociones/activa de un lote NO_DISPONIBLE → data null (sin revelar el lote)', async () => {
        prismaMock.promocion.findFirst.mockResolvedValueOnce({ id: 1, loteId: 9, activa: true, lote: { id: 9, estado: 'NO_DISPONIBLE', precio: '30000' } });
        const res = await request(app).get('/api/lotes/9/promociones/activa').set(headerDe('INMOBILIARIA'));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: null });
    });
});

describe('INMOBILIARIA · campos sensibles', () => {
    test('GET /api/lotes omite deuda, documentos de personas y datos de ventas/reservas', async () => {
        const res = await getLotes('INMOBILIARIA');
        const lotes = res.body.data.lotes;
        expect(lotes).toHaveLength(4);
        for (const l of lotes) {
            expect(l).not.toHaveProperty('deuda');
            expect(documentosExpuestos(l)).toBe(false);
            for (const campo of ['Venta', 'venta', 'ventas', 'reserva', 'reservas']) expect(l).not.toHaveProperty(campo);
        }
    });

    test('se mantiene el nombre del propietario y del inquilino', async () => {
        const [l] = (await getLotes('INMOBILIARIA')).body.data.lotes;
        expect(l.propietario).toEqual(expect.objectContaining({ id: 1, nombre: 'Propietario' }));
        expect(l.alquilerActivo.inquilino).toEqual(expect.objectContaining({ id: 3, nombre: 'Inquilino' }));
    });

    test('GET /api/lotes/:id omite deuda, documentos y datos de ventas/reservas', async () => {
        prismaMock.lote.findUnique.mockResolvedValueOnce(lote(1, 'DISPONIBLE', { Venta: [{ id: 1 }], reserva: [{ id: 2 }] }));
        const res = await getLote('INMOBILIARIA', 1);
        expect(res.status).toBe(200);
        expect(res.body.data).not.toHaveProperty('deuda');
        expect(res.body.data).not.toHaveProperty('Venta');
        expect(res.body.data).not.toHaveProperty('reserva');
        expect(documentosExpuestos(res.body.data)).toBe(false);
        expect(res.body.data.propietario).toEqual(expect.objectContaining({ nombre: 'Propietario' }));
    });
});

describe('INMOBILIARIA · prioridades', () => {
    test('prioridad de OTRA inmobiliaria: el lote sigue CON_PRIORIDAD, sin titular ni nombre', async () => {
        const l = (await getLotes('INMOBILIARIA')).body.data.lotes.find((x: any) => x.id === 2);
        expect(l.estado).toBe('CON_PRIORIDAD');
        expect(l.prioridad).toHaveLength(1);
        expect(l.prioridad[0]).not.toHaveProperty('inmobiliariaId');
        expect(l.prioridad[0]).not.toHaveProperty('ownerType');
        expect(l.prioridad[0]).not.toHaveProperty('inmobiliaria');
    });

    test('prioridad del Club (CCLF): tampoco expone el titular', async () => {
        const l = (await getLotes('INMOBILIARIA')).body.data.lotes.find((x: any) => x.id === 4);
        expect(l.estado).toBe('CON_PRIORIDAD');
        expect(l.prioridad[0]).not.toHaveProperty('ownerType');
        expect(l.prioridad[0]).not.toHaveProperty('inmobiliariaId');
    });

    test('prioridad PROPIA: se devuelve completa', async () => {
        const l = (await getLotes('INMOBILIARIA')).body.data.lotes.find((x: any) => x.id === 3);
        expect(l.prioridad).toEqual([prioridadDe(71, TENANT)]);
    });
});

describe('INMOBILIARIA · filtro deudor', () => {
    test.each(['true', 'false'])('deudor=%s → 400 y Prisma no se consulta', async (valor) => {
        const res = await getLotes('INMOBILIARIA', `?deudor=${valor}`);
        expect(res.status).toBe(400);
        expect(res.body).toEqual(expect.objectContaining({ success: false }));
        expect(prismaMock.lote.findMany).not.toHaveBeenCalled();
    });

    test('un caller directo con rol INMOBILIARIA y deudor es rechazado (400)', async () => {
        await expect(getAllLotes({ deudor: true }, 'INMOBILIARIA')).rejects.toHaveProperty('statusCode', 400);
        expect(prismaMock.lote.findMany).not.toHaveBeenCalled();
    });
});

describe('Controles: ADMINISTRADOR, GESTOR y TECNICO sin cambios', () => {
    test.each(['ADMINISTRADOR', 'GESTOR'])('%s · GET /api/lotes devuelve todo, sin excluir NO_DISPONIBLE', async (role) => {
        const res = await getLotes(role);
        expect(res.status).toBe(200);
        expect(excluyeNoDisponible(whereListado())).toBe(false);
        const lotes = res.body.data.lotes;
        expect(lotes.every((l: any) => l.deuda === true)).toBe(true);
        expect(lotes.every((l: any) => documentosExpuestos(l))).toBe(true);
        expect(lotes.find((l: any) => l.id === 2).prioridad).toEqual([prioridadDe(70, OTRA_INMOBILIARIA)]);
    });

    test('TECNICO · GET /api/lotes: sin deuda (como antes), con documentos y prioridades completas', async () => {
        const res = await getLotes('TECNICO');
        expect(res.status).toBe(200);
        expect(excluyeNoDisponible(whereListado())).toBe(false);
        const lotes = res.body.data.lotes;
        expect(lotes.some((l: any) => 'deuda' in l)).toBe(false);
        expect(lotes.every((l: any) => documentosExpuestos(l))).toBe(true);
        expect(lotes.find((l: any) => l.id === 4).prioridad).toEqual([prioridadDe(72, null)]);
    });

    test.each(['ADMINISTRADOR', 'GESTOR', 'TECNICO'])('%s · GET /api/lotes/:id de un lote NO_DISPONIBLE → 200', async (role) => {
        prismaMock.lote.findUnique.mockResolvedValueOnce(lote(9, 'NO_DISPONIBLE'));
        const res = await getLote(role, 9);
        expect(res.status).toBe(200);
        expect(res.body.data.estado).toBe('NO_DISPONIBLE');
    });

    test('ADMINISTRADOR · promociones/activa de un lote NO_DISPONIBLE devuelve la promoción', async () => {
        const promo = { id: 1, loteId: 9, activa: true, lote: { id: 9, estado: 'NO_DISPONIBLE', precio: '30000' } };
        prismaMock.promocion.findFirst.mockResolvedValueOnce(promo);
        const res = await request(app).get('/api/lotes/9/promociones/activa').set(headerDe('ADMINISTRADOR'));
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual(promo);
    });

    test('ADMINISTRADOR · deudor sigue disponible', async () => {
        const res = await getLotes('ADMINISTRADOR', '?deudor=true');
        expect(res.status).toBe(200);
        expect(whereListado()).toEqual(expect.objectContaining({ deuda: true }));
    });
});
