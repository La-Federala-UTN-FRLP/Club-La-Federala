// Errores de POST /api/lotes/:id/promociones/{aplicar,quitar}.
// Regresión: los dos handlers atrapaban el error y respondían ellos mismos con
// `error.statusCode || 500` y `error.message`: un P2002 (unicidad) o P2025 (no encontrado) de Prisma
// salía como 500 y el mensaje interno de un error inesperado se devolvía al cliente. El middleware
// global ya mapea esos casos, así que los handlers delegan con next(error), como getPromocionActiva.
jest.mock('../../../src/services/promocion.service', () => ({
    aplicarPromocion: jest.fn(),
    quitarPromocion: jest.fn(),
    getPromocionActiva: jest.fn(),
}));

import request from 'supertest';
import { Prisma } from '../../../src/generated/prisma';
import app from '../../../src/app';
import * as promocionService from '../../../src/services/promocion.service';
import { authHeader, useTestWebEnv } from '../../support/http';

const aplicarMock = promocionService.aplicarPromocion as jest.Mock;
const quitarMock = promocionService.quitarPromocion as jest.Mock;

useTestWebEnv();

beforeEach(() => {
    aplicarMock.mockReset();
    quitarMock.mockReset();
});

const ADMIN = authHeader('ADMINISTRADOR');

const aplicar = () => request(app).post('/api/lotes/5/promociones/aplicar').set(ADMIN).send({ precioPromocional: 1000 });
const quitar = () => request(app).post('/api/lotes/5/promociones/quitar').set(ADMIN);

const conStatus = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
// Clase del cliente generado (src/generated/prisma), la misma que lanza Prisma en runtime.
// @prisma/client/runtime/library exporta otra clase: el instanceof del middleware no la reconoce.
const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError(`Prisma ${code}`, { code, clientVersion: 'test' });

const HANDLERS = [
    { nombre: 'aplicar', request: aplicar, mock: aplicarMock, ok: 201 },
    { nombre: 'quitar', request: quitar, mock: quitarMock, ok: 200 },
];

describe.each(HANDLERS)('POST promociones/$nombre', ({ request: hacer, mock, ok }) => {
    test('camino feliz: el resultado del service se responde igual que antes', async () => {
        mock.mockResolvedValue({ id: 1 });
        const res = await hacer();
        expect(res.status).toBe(ok);
        expect(res.body).toEqual(expect.objectContaining({ success: true, data: { id: 1 } }));
    });

    test.each([
        [404, 'Lote no encontrado'],
        [400, 'Solo se puede aplicar promoción a lotes en estado DISPONIBLE'],
        [409, 'El lote ya tiene una promoción activa'],
    ])('error de negocio con statusCode %s conserva su status y su mensaje', async (status, mensaje) => {
        mock.mockRejectedValue(conStatus(mensaje, status));
        const res = await hacer();
        expect(res.status).toBe(status);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe(mensaje);
    });

    test.each([
        ['P2002', 409, 'CONFLICT_UNIQUE'],
        ['P2025', 404, 'NOT_FOUND'],
    ])('error conocido de Prisma %s lo mapea el middleware global (%s)', async (code, status, codigoEsperado) => {
        mock.mockRejectedValue(prismaError(code));
        const res = await hacer();
        expect(res.status).toBe(status);
        expect(res.body.code).toBe(codigoEsperado);
    });

    test('un error inesperado responde 500 sin exponer su mensaje interno', async () => {
        mock.mockRejectedValue(new Error('detalle interno: tabla Promocion corrupta'));
        const res = await hacer();
        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(JSON.stringify(res.body)).not.toContain('detalle interno');
    });
});
