// D2 — aliases y hard deletes eliminados del contrato público (app real, services mockeados).
//
// - DELETE /api/ventas/:id      → era alias de PATCH /api/ventas/:id/eliminar (misma baja lógica).
// - DELETE /api/reservas/:id    → era alias de PATCH /api/reservas/:id/eliminar (misma baja lógica).
// - DELETE /api/inmobiliarias/:id → hard delete; D1 exige que la inmobiliaria persista y se
//   pueda reactivar.
// Ninguno tenía consumidor en el frontend. Ahora responden el 404 JSON global y no llegan al
// service; la baja lógica (y la reactivación) siguen disponibles por PATCH.
//
// Además: lote.auth.middleware (no-op) se quitó de GET/PUT /api/lotes/:id. El RBAC de esas rutas
// lo dan authorize de la ruta y las reglas del service; se verifica que no cambió.
jest.mock('../../../src/services/venta.service', () => ({
    ...jest.requireActual('../../../src/services/venta.service'),
    eliminarVenta: jest.fn(),
    reactivarVenta: jest.fn(),
}));
jest.mock('../../../src/services/reserva.service', () => ({
    ...jest.requireActual('../../../src/services/reserva.service'),
    eliminarReserva: jest.fn(),
    reactivarReserva: jest.fn(),
}));
jest.mock('../../../src/services/inmobiliaria.service', () => ({
    ...jest.requireActual('../../../src/services/inmobiliaria.service'),
    eliminarInmobiliaria: jest.fn(),
    reactivarInmobiliaria: jest.fn(),
}));
jest.mock('../../../src/services/lote.service', () => ({
    ...jest.requireActual('../../../src/services/lote.service'),
    getLoteById: jest.fn(),
    updatedLote: jest.fn(),
    deleteLote: jest.fn(),
}));

import request from 'supertest';
import app from '../../../src/app';
import * as ventaService from '../../../src/services/venta.service';
import * as reservaService from '../../../src/services/reserva.service';
import * as inmobiliariaService from '../../../src/services/inmobiliaria.service';
import * as loteService from '../../../src/services/lote.service';
import { authHeader, useTestWebEnv } from '../../support/http';

const mock = (fn: unknown) => fn as jest.Mock;

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');
const GESTOR = authHeader('GESTOR');
const TECNICO = authHeader('TECNICO');
const NOT_FOUND = { success: false, code: 'NOT_FOUND', message: 'Ruta no encontrada' };

beforeEach(() => {
    jest.clearAllMocks();
    mock(ventaService.eliminarVenta).mockResolvedValue({ id: 7 });
    mock(reservaService.eliminarReserva).mockResolvedValue({ id: 7 });
    mock(inmobiliariaService.eliminarInmobiliaria).mockResolvedValue({ inmobiliaria: { idInmobiliaria: 7 }, message: 'ok' });
    mock(inmobiliariaService.reactivarInmobiliaria).mockResolvedValue({ inmobiliaria: { idInmobiliaria: 7 }, message: 'ok' });
    mock(loteService.getLoteById).mockResolvedValue({ id: 1 });
    mock(loteService.updatedLote).mockResolvedValue({ id: 1 });
    mock(loteService.deleteLote).mockResolvedValue({ id: 1 });
});

describe('rutas eliminadas → 404 JSON sin llegar al service', () => {
    test.each([
        ['/api/ventas/7', () => ventaService.eliminarVenta],
        ['/api/reservas/7', () => reservaService.eliminarReserva],
        ['/api/inmobiliarias/7', () => inmobiliariaService.eliminarInmobiliaria],
    ])('DELETE %s', async (url, service) => {
        const res = await request(app).delete(url).set(ADMIN);

        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body).toEqual(NOT_FOUND);
        expect(service()).not.toHaveBeenCalled();
    });
});

describe('la baja lógica sigue disponible por PATCH', () => {
    test('PATCH /api/ventas/:id/eliminar', async () => {
        const res = await request(app).patch('/api/ventas/7/eliminar').set(GESTOR);

        expect(res.status).toBe(200);
        expect(ventaService.eliminarVenta).toHaveBeenCalledWith(7, expect.objectContaining({ role: 'GESTOR' }));
    });

    test('PATCH /api/reservas/:id/eliminar', async () => {
        const res = await request(app).patch('/api/reservas/7/eliminar').set(GESTOR);

        expect(res.status).toBe(200);
        expect(reservaService.eliminarReserva).toHaveBeenCalledWith(7, expect.objectContaining({ role: 'GESTOR' }));
    });

    test('PATCH /api/inmobiliarias/:id/eliminar y /reactivar', async () => {
        expect((await request(app).patch('/api/inmobiliarias/7/eliminar').set(ADMIN)).status).toBe(200);
        expect((await request(app).patch('/api/inmobiliarias/7/reactivar').set(ADMIN)).status).toBe(200);
        expect(inmobiliariaService.eliminarInmobiliaria).toHaveBeenCalledWith(7);
        expect(inmobiliariaService.reactivarInmobiliaria).toHaveBeenCalledWith(7);
    });
});

describe('RBAC de /api/lotes/:id sin lote.auth.middleware', () => {
    test('GET: TECNICO entra (200)', async () => {
        const res = await request(app).get('/api/lotes/1').set(TECNICO);

        expect(res.status).toBe(200);
        expect(loteService.getLoteById).toHaveBeenCalledWith(1, 'TECNICO');
    });

    test('PUT: TECNICO llega al service con su rol (el service restringe sus campos)', async () => {
        const res = await request(app).put('/api/lotes/1').set(TECNICO).send({ precio: 10 });

        expect(res.status).toBe(200);
        expect(loteService.updatedLote).toHaveBeenCalledWith(1, expect.any(Object), 'TECNICO');
    });

    test.each([
        ['TECNICO', TECNICO],
        ['GESTOR', GESTOR],
    ])('DELETE: %s → 403 sin llegar al service', async (_rol, auth) => {
        const res = await request(app).delete('/api/lotes/1').set(auth);

        expect(res.status).toBe(403);
        expect(loteService.deleteLote).not.toHaveBeenCalled();
    });

    test('DELETE: ADMINISTRADOR → 200', async () => {
        const res = await request(app).delete('/api/lotes/1').set(ADMIN);

        expect(res.status).toBe(200);
        expect(loteService.deleteLote).toHaveBeenCalledWith(1, 'ADMINISTRADOR');
    });
});

// Ubicaciones: las escrituras forman parte del lifecycle de Lote (alta/edición con calle + numeroCalle
// o ubicacionId). El ABM público independiente se retiró; las lecturas se conservan (ver
// fracciones-ubicaciones.errors.routes.test.ts y listados.d5.test.ts).
describe('escrituras públicas de Ubicaciones retiradas → 404 JSON', () => {
    test.each([
        ['post', '/api/ubicaciones', { calle: 'Maca', numero: 10 }],
        ['put', '/api/ubicaciones/1', { numero: 11 }],
        ['delete', '/api/ubicaciones/1', undefined],
    ] as const)('%s %s', async (metodo, url, body) => {
        const req = request(app)[metodo](url).set(ADMIN);
        const res = await (body ? req.send(body) : req);

        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body).toEqual(NOT_FOUND);
    });
});
