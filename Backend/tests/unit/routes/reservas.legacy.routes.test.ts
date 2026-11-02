// GET /api/reservas/filtrarPorEstado era legacy e inalcanzable: /:id, declarada antes, la capturaba
// y respondía 400. Se eliminó (ruta, controller y service); el filtro por estado vive en
// GET /api/reservas?estado=...
jest.mock('../../../src/services/reserva.service', () => ({
    getAllReservas: jest.fn(),
    getReservaById: jest.fn(),
}));

import request from 'supertest';
import app from '../../../src/app';
import * as reservaController from '../../../src/controllers/reserva.controller';
import * as reservaService from '../../../src/services/reserva.service';
import { authHeader, useTestWebEnv } from '../../support/http';

const service = reservaService as unknown as Record<string, jest.Mock>;

useTestWebEnv();

beforeEach(() => {
    service.getAllReservas.mockReset().mockResolvedValue([]);
    service.getReservaById.mockReset().mockResolvedValue({ id: 1 });
});

const ADMIN = authHeader('ADMINISTRADOR');

describe('GET /api/reservas/filtrarPorEstado — eliminada', () => {
    test('el controller legacy ya no se exporta', () => {
        expect(reservaController).not.toHaveProperty('getAllReservasByEstadoController');
    });

    test('el service legacy ya no se exporta', () => {
        const real = jest.requireActual('../../../src/services/reserva.service');
        expect(real).not.toHaveProperty('getReservaByEstado');
    });

    test('el path sigue resolviéndose por /:id (400 de id inválido): no se revive ni se reordena', async () => {
        const res = await request(app).get('/api/reservas/filtrarPorEstado?estado=ACTIVA').set(ADMIN);
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([expect.objectContaining({ field: 'id' })]);
        expect(service.getReservaById).not.toHaveBeenCalled();
        expect(service.getAllReservas).not.toHaveBeenCalled();
    });

    test('GET /api/reservas?estado=... sigue siendo el contrato vigente', async () => {
        const res = await request(app).get('/api/reservas?estado=ACTIVA').set(ADMIN);
        expect(res.status).toBe(200);
        expect(service.getAllReservas).toHaveBeenCalledTimes(1);
        expect(service.getAllReservas.mock.calls[0]).toEqual(
            expect.arrayContaining([expect.objectContaining({ estado: 'ACTIVA' })]),
        );
    });
});
