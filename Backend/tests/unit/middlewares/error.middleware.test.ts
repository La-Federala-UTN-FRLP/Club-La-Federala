// Handler global de errores (handleError real sobre una app mínima).
//
// Defecto caracterizado (Block 0, final hardening): la rama `status || statusCode` devuelve
// `err.message` para cualquier status, incluido ≥500. Un error con statusCode 500 y un mensaje
// interno lo expone por HTTP.
//
// Contrato: con status/statusCode ≥500 se conserva el status, pero el body es genérico
// { success: false, code: 'INTERNAL_ERROR', message: 'Error interno.' } y el detalle va solo al log;
// con 4xx el mensaje de dominio se conserva (los errores de dominio dependen de eso) y `code`
// identifica la clase de error.
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { handleError } from '../../../src/middlewares/error.middleware';
import { SENSITIVE_MARKER, expectSinTextos } from '../../support/sensitiveErrors';

function appQueLanza(err: Error) {
    const app = express();
    app.get('/boom', (_req: Request, _res: Response, next: NextFunction) => next(err));
    app.use(handleError);
    return app;
}

let consoleError: jest.SpyInstance;
beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
    consoleError.mockRestore();
});

describe('error con status ≥500', () => {
    test.each([
        ['statusCode', 500],
        ['status', 500],
        ['statusCode', 503],
    ] as const)('%s = %s → conserva el status, body genérico sin el mensaje interno', async (campo, valor) => {
        const err = Object.assign(new Error(`${SENSITIVE_MARKER} detalle interno`), { [campo]: valor });

        const res = await request(appQueLanza(err)).get('/boom');

        expect(res.status).toBe(valor);
        expect(res.body).toEqual({ success: false, code: 'INTERNAL_ERROR', message: 'Error interno.' });
        expectSinTextos(res, [SENSITIVE_MARKER, 'detalle interno']);
    });

    test('el error real queda en el log del servidor, en forma segura (no el objeto completo)', async () => {
        const err = Object.assign(new Error(`${SENSITIVE_MARKER} detalle interno`), { statusCode: 500 });

        await request(appQueLanza(err)).get('/boom');

        expect(consoleError).toHaveBeenCalledWith(
            'Error no manejado:',
            expect.objectContaining({ name: 'Error', message: `${SENSITIVE_MARKER} detalle interno`, stack: expect.any(String) }),
        );
        expect(consoleError.mock.calls[0][1]).not.toBe(err);
    });
});

describe('error de dominio 4xx', () => {
    test.each([
        [400, 'BAD_REQUEST', 'Dato de dominio inválido'],
        [401, 'UNAUTHORIZED', 'Credenciales inválidas'],
        [403, 'FORBIDDEN', 'No tienes permiso para operar esta reserva'],
        [404, 'NOT_FOUND', 'Reserva no encontrada'],
        [409, 'CONFLICT', 'La reserva ya está eliminada.'],
    ] as const)('statusCode %s conserva status y mensaje, con code %s', async (status, code, mensaje) => {
        const err = Object.assign(new Error(mensaje), { statusCode: status });

        const res = await request(appQueLanza(err)).get('/boom');

        expect(res.status).toBe(status);
        expect(res.body).toEqual({ success: false, code, message: mensaje });
        expect(consoleError).not.toHaveBeenCalled();
    });

    test('`status` tiene prioridad sobre `statusCode`, como antes', async () => {
        const err = Object.assign(new Error('No encontrado'), { status: 404, statusCode: 500 });

        const res = await request(appQueLanza(err)).get('/boom');

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ success: false, code: 'NOT_FOUND', message: 'No encontrado' });
    });
});

describe('error sin status HTTP válido', () => {
    test.each([
        ['sin status', {}],
        ['status no numérico', { status: 'ACTIVA' }],
        ['status fuera de rango de error', { statusCode: 200 }],
    ])('%s → 500 genérico y log', async (_caso, extra) => {
        const err = Object.assign(new Error(`${SENSITIVE_MARKER} detalle interno`), extra);

        const res = await request(appQueLanza(err)).get('/boom');

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ success: false, code: 'INTERNAL_ERROR', message: 'Error interno.' });
        expect(consoleError).toHaveBeenCalledTimes(1);
    });
});
