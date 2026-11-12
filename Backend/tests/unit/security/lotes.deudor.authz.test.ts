// Autorización del filtro deudor en GET /api/lotes (app real + service real, Prisma mockeado).
//
// El DTO de TECNICO oculta el campo deuda, pero si el filtro ?deudor=true|false se aplicara
// igual, el conjunto de resultados delataría quién es deudor. Para TECNICO el parámetro se
// rechaza con 400 (no se ignora en silencio) y Prisma nunca recibe where.deuda.
jest.mock('../../../src/config/prisma', () =>
    require('../../support/mocks/prisma').lotePrismaMock,
);

import request from 'supertest';
import app from '../../../src/app';
import { getAllLotes } from '../../../src/services/lote.service';
import { lotePrismaMock as prismaMock, resetPrismaMock } from '../../support/mocks/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';

useTestWebEnv();

beforeEach(() => {
    prismaMock.lote.findMany.mockResolvedValue([]);
    prismaMock.lote.count.mockResolvedValue(0);
});

afterEach(() => {
    resetPrismaMock(prismaMock);
});

const getLotes = (role: string, qs: string) =>
    request(app).get(`/api/lotes${qs}`).set(authHeader(role, role === 'INMOBILIARIA' ? 5 : undefined));

const prismaWhere = () => prismaMock.lote.findMany.mock.calls[0][0].where;

describe('GET /api/lotes?deudor — TECNICO no puede filtrar por deuda', () => {
    test.each(['true', 'false'])('TECNICO + deudor=%s → 400 y Prisma no se consulta', async (valor) => {
        const res = await getLotes('TECNICO', `?deudor=${valor}`);

        expect(res.status).toBe(400);
        expect(res.body).toEqual(expect.objectContaining({ success: false }));
        expect(prismaMock.lote.findMany).not.toHaveBeenCalled();
        expect(prismaMock.lote.count).not.toHaveBeenCalled();
    });

    test('TECNICO + deudor combinado con otros filtros → 400 igual', async () => {
        const res = await getLotes('TECNICO', '?estado=Disponible&deudor=true');
        expect(res.status).toBe(400);
        expect(prismaMock.lote.findMany).not.toHaveBeenCalled();
    });

    test('TECNICO sin deudor → 200 y el where no incluye deuda', async () => {
        const res = await getLotes('TECNICO', '?estado=Disponible');
        expect(res.status).toBe(200);
        expect(prismaWhere()).not.toHaveProperty('deuda');
    });
});

describe('GET /api/lotes?deudor — staff conserva el filtro', () => {
    test.each([
        ['ADMINISTRADOR', 'true', true],
        ['ADMINISTRADOR', 'false', false],
        ['GESTOR', 'true', true],
        ['GESTOR', 'false', false],
    ])('%s + deudor=%s → 200 y Prisma recibe where.deuda=%s', async (role, valor, esperado) => {
        const res = await getLotes(role, `?deudor=${valor}`);
        expect(res.status).toBe(200);
        expect(prismaWhere()).toEqual(expect.objectContaining({ deuda: esperado }));
    });
});

describe('getAllLotes — la regla vive donde se arma where.deuda', () => {
    test.each([true, false])('un caller directo con rol TECNICO y deudor=%s es rechazado (400)', async (deudor) => {
        await expect(getAllLotes({ deudor }, 'TECNICO')).rejects.toHaveProperty('statusCode', 400);
        expect(prismaMock.lote.findMany).not.toHaveBeenCalled();
    });
});
