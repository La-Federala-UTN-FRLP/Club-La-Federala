// Oráculos de existencia de lotes NO_DISPONIBLE (seguimiento de LOT-03): app real + services reales,
// Prisma mockeado.
//
// Desde #340, INMOBILIARIA no ve los lotes NO_DISPONIBLE en /api/lotes (detalle → 404, igual que un
// inexistente). Los demás caminos que reciben un loteId tampoco deben distinguir "no existe" de
// "existe pero es NO_DISPONIBLE": misma respuesta (status y body) en ambos casos. Para ADMINISTRADOR
// y GESTOR se mantiene el 400 de la regla de estado.
jest.mock('../../../src/config/prisma', () => {
    const db: any = {
        lote: { findUnique: jest.fn() },
        archivos: { findMany: jest.fn(), findUnique: jest.fn() },
        venta: { findMany: jest.fn(), findUnique: jest.fn() },
    };
    db.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(db));
    return { __esModule: true, default: db };
});

import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/config/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';

const db = prisma as any;

useTestWebEnv();

const TENANT = 5;
const LOTE_NO_DISPONIBLE = 21;
const LOTE_DISPONIBLE = 19;
const LOTE_INEXISTENTE = 999;
// Archivos por ID: 1 (PLANO) y 2 (IMAGEN) son del lote NO_DISPONIBLE; 3 (PLANO) de un lote DISPONIBLE.
const ARCHIVO_DE_LOTE_DISPONIBLE = 3;
const ARCHIVO_INEXISTENTE = 999;

const INMO = authHeader('INMOBILIARIA', TENANT);
const ADMIN = authHeader('ADMINISTRADOR');
const GESTOR = authHeader('GESTOR');
const TECNICO = authHeader('TECNICO');

const loteNoDisponible = { id: LOTE_NO_DISPONIBLE, estado: 'NO_DISPONIBLE', precio: '30000' };

const archivo = (id: number, tipo: string, idLoteAsociado = LOTE_NO_DISPONIBLE) => ({
    id, nombreArchivo: `qa-${id}.pdf`, linkArchivo: `lote-${idLoteAsociado}/qa-${id}.pdf`, tipo,
    idLoteAsociado, ventaId: null, estadoOperativo: 'OPERATIVO', venta: null,
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), uploadedBy: null,
});

const ARCHIVOS: Record<number, ReturnType<typeof archivo>> = {
    1: archivo(1, 'PLANO'),
    2: archivo(2, 'IMAGEN'),
    [ARCHIVO_DE_LOTE_DISPONIBLE]: archivo(ARCHIVO_DE_LOTE_DISPONIBLE, 'PLANO', LOTE_DISPONIBLE),
};

// La "DB": el lote 21 existe y es NO_DISPONIBLE (con PLANO e IMAGEN), el 19 es DISPONIBLE y el 999 no existe.
beforeEach(() => {
    db.lote.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.id === LOTE_NO_DISPONIBLE) return loteNoDisponible;
        if (where.id === LOTE_DISPONIBLE) return { id: LOTE_DISPONIBLE, estado: 'DISPONIBLE', precio: '30000' };
        return null;
    });
    db.archivos.findUnique.mockImplementation(async ({ where }: any) => ARCHIVOS[where.id] ?? null);
    db.archivos.findMany.mockImplementation(async ({ where }: any) =>
        where.idLoteAsociado === LOTE_NO_DISPONIBLE ? [archivo(1, 'PLANO'), archivo(2, 'IMAGEN')] : []);
    db.venta.findMany.mockResolvedValue([]);
});

afterEach(() => {
    jest.clearAllMocks();
});

const crearReserva = (auth: Record<string, string>, loteId: number) =>
    request(app).post('/api/reservas').set(auth).send({
        fechaReserva: '2026-11-23T12:00:00.000Z', loteId, clienteId: 23, numero: 'QA-RES-ORACULO',
        ofertaInicial: 25000, fechaFinReserva: '2026-11-28T12:00:00.000Z',
    });

const crearPrioridad = (auth: Record<string, string>, loteId: number) =>
    request(app).post('/api/prioridades').set(auth).send({
        numero: 'QA-PRI-ORACULO', loteId, fechaInicio: '2026-11-23T12:00:00.000Z', fechaFin: '2099-11-25T12:00:00.000Z',
    });

const archivosDeLote = (auth: Record<string, string>, loteId: number) =>
    request(app).get(`/api/files/lote/${loteId}`).set(auth);

const archivoPorId = (auth: Record<string, string>, id: number) => request(app).get(`/api/files/${id}`).set(auth);
const urlDeArchivo = (auth: Record<string, string>, id: number) => request(app).post(`/api/files/${id}/url`).set(auth);

const mismaRespuesta = (a: request.Response, b: request.Response) => {
    expect(a.status).toBe(b.status);
    expect(a.body).toEqual(b.body);
};

describe('INMOBILIARIA · un lote NO_DISPONIBLE responde igual que uno inexistente', () => {
    test('POST /api/reservas', async () => {
        const noDisponible = await crearReserva(INMO, LOTE_NO_DISPONIBLE);
        const inexistente = await crearReserva(INMO, LOTE_INEXISTENTE);
        expect(inexistente.status).toBe(404);
        mismaRespuesta(noDisponible, inexistente);
    });

    test('POST /api/prioridades', async () => {
        const noDisponible = await crearPrioridad(INMO, LOTE_NO_DISPONIBLE);
        const inexistente = await crearPrioridad(INMO, LOTE_INEXISTENTE);
        expect(inexistente.status).toBe(404);
        mismaRespuesta(noDisponible, inexistente);
    });

    test('GET /api/files/lote/:id (no lista PLANO/IMAGEN del lote NO_DISPONIBLE)', async () => {
        const noDisponible = await archivosDeLote(INMO, LOTE_NO_DISPONIBLE);
        const inexistente = await archivosDeLote(INMO, LOTE_INEXISTENTE);
        expect(inexistente.status).toBe(200);
        expect(inexistente.body).toEqual([]);
        mismaRespuesta(noDisponible, inexistente);
    });

    test.each([1, 2])('GET /api/files/:id de un archivo (%s) de un lote NO_DISPONIBLE', async (id) => {
        const noDisponible = await archivoPorId(INMO, id);
        const inexistente = await archivoPorId(INMO, ARCHIVO_INEXISTENTE);
        expect(inexistente.status).toBe(404);
        mismaRespuesta(noDisponible, inexistente);
    });

    test.each([1, 2])('POST /api/files/:id/url de un archivo (%s) de un lote NO_DISPONIBLE', async (id) => {
        const noDisponible = await urlDeArchivo(INMO, id);
        const inexistente = await urlDeArchivo(INMO, ARCHIVO_INEXISTENTE);
        expect(inexistente.status).toBe(404);
        mismaRespuesta(noDisponible, inexistente);
    });

    test('control: GET /api/files/:id de un PLANO de un lote DISPONIBLE sigue en 200', async () => {
        const res = await archivoPorId(INMO, ARCHIVO_DE_LOTE_DISPONIBLE);
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(ARCHIVO_DE_LOTE_DISPONIBLE);
    });
});

describe('Controles: ADMINISTRADOR y GESTOR sin cambios', () => {
    test.each([['ADMINISTRADOR', ADMIN], ['GESTOR', GESTOR]])('%s · POST /api/reservas sobre NO_DISPONIBLE → 400', async (_rol, auth) => {
        const res = await crearReserva(auth, LOTE_NO_DISPONIBLE);
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/NO DISPONIBLE/);
    });

    test.each([['ADMINISTRADOR', ADMIN], ['GESTOR', GESTOR]])('%s · POST /api/prioridades sobre NO_DISPONIBLE → 400', async (_rol, auth) => {
        const res = await crearPrioridad(auth, LOTE_NO_DISPONIBLE);
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/NO DISPONIBLE/);
    });

    test('ADMINISTRADOR · GET /api/files/lote/:id de un NO_DISPONIBLE lista sus archivos', async () => {
        const res = await archivosDeLote(ADMIN, LOTE_NO_DISPONIBLE);
        expect(res.status).toBe(200);
        expect(res.body.map((f: any) => f.id)).toEqual([1, 2]);
    });

    test.each([['ADMINISTRADOR', ADMIN], ['GESTOR', GESTOR], ['TECNICO', TECNICO]])('%s · GET /api/files/:id de un PLANO de un lote NO_DISPONIBLE → 200', async (_rol, auth) => {
        const res = await archivoPorId(auth, 1);
        expect(res.status).toBe(200);
        expect(res.body.idLoteAsociado).toBe(LOTE_NO_DISPONIBLE);
    });

    test.each([['ADMINISTRADOR', ADMIN], ['GESTOR', GESTOR]])('%s · lote inexistente sigue en 404', async (_rol, auth) => {
        expect((await crearReserva(auth, LOTE_INEXISTENTE)).status).toBe(404);
        expect((await crearPrioridad(auth, LOTE_INEXISTENTE)).status).toBe(404);
    });
});
