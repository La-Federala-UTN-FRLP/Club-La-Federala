// GET /api/reservas/filtrarPorEstado es legacy e inalcanzable: /:id (declarada antes) la captura
// y responde 400 por id inválido. No se elimina ni se reordena (queda como deuda), pero su
// controller también lee la query validada y no req.query, para que el invariante "ningún
// controller lee req.query" valga sin excepciones. Como la ruta no se puede ejercitar por HTTP,
// se invoca el handler directo con una request cuya query cruda difiere de la validada.
jest.mock('../../../src/services/reserva.service', () => ({
    getReservaByEstado: jest.fn(),
}));

import type { NextFunction, Request, Response } from 'express';
import { getAllReservasByEstadoController } from '../../../src/controllers/reserva.controller';
import { getReservaByEstado } from '../../../src/services/reserva.service';
import { queryReservasSchema } from '../../../src/validations/reserva.validation';

const getReservaByEstadoMock = getReservaByEstado as jest.Mock;

function buildRes() {
    const res = { json: jest.fn() };
    return res as unknown as Response & { json: jest.Mock };
}

function buildReq(overrides: Record<string, unknown>) {
    return { user: { role: 'ADMINISTRADOR' }, ...overrides } as unknown as Request;
}

beforeEach(() => {
    getReservaByEstadoMock.mockReset().mockResolvedValue([{ id: 1 }]);
});

describe('getAllReservasByEstadoController (legacy)', () => {
    test('usa el estado de la query validada, no el de req.query', async () => {
        const req = buildReq({
            query: { estado: 'RECHAZADA' }, // crudo
            validated: { query: { schema: queryReservasSchema, data: { estado: 'ACTIVA' } } },
        });
        const res = buildRes();
        const next = jest.fn();

        await getAllReservasByEstadoController(req, res, next as NextFunction);

        expect(next).not.toHaveBeenCalled();
        expect(getReservaByEstadoMock).toHaveBeenCalledWith('ACTIVA', expect.objectContaining({ role: 'ADMINISTRADOR' }));
        expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 1 }] });
    });

    test('si la ruta no validó la query, es un error de programación y va a next', async () => {
        const req = buildReq({ query: { estado: 'ACTIVA' } });
        const next = jest.fn();

        await getAllReservasByEstadoController(req, buildRes(), next as NextFunction);

        expect(getReservaByEstadoMock).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/No hay query validados/) }));
    });
});
