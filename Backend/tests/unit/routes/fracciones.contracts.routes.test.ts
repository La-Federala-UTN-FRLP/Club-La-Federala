// Contrato HTTP de /api/fracciones, de punta a punta (ruta → controller → service real, Prisma mockeado).
// Regresión:
// - Fraccion.numero es Int en Prisma pero el schema Zod lo pedía string: POST {numero: 5} daba 400 y
//   POST {numero: "5"} llegaba a Prisma como string. PUT además escribía `updatedAt`, un campo que el
//   modelo Fraccion no tiene.
// - GET /:id inexistente respondía 500 (el service tiraba un Error sin status y el controller
//   respondía siempre 500).
// - Un número duplicado respondía 400 en vez de 409 Conflict.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        fraccion: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        lote: { count: jest.fn() },
    },
}));

import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/config/prisma';
import { Prisma } from '../../../src/generated/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';

const db = prisma as unknown as {
    fraccion: Record<'findMany' | 'findUnique' | 'count' | 'create' | 'update' | 'delete', jest.Mock>;
    lote: { count: jest.Mock };
};

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');

beforeEach(() => {
    Object.values(db.fraccion).forEach((fn) => fn.mockReset());
    db.lote.count.mockReset();
});

const CAMPOS_FRACCION = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Fraccion')!.fields.map((f) => f.name);

describe('POST /api/fracciones — numero es Int', () => {
    test.each([
        [5, 5],
        ['5', 5],
        [2147483647, 2147483647],
        ['2147483647', 2147483647],
    ])('numero %j llega a Prisma como number %s', async (entrada, esperado) => {
        db.fraccion.findUnique.mockResolvedValue(null);
        db.fraccion.create.mockResolvedValue({ id: 1, numero: esperado });

        const res = await request(app).post('/api/fracciones').set(ADMIN).send({ numero: entrada });

        expect(res.status).toBe(201);
        expect(db.fraccion.findUnique).toHaveBeenCalledWith({ where: { numero: esperado } });
        expect(db.fraccion.create).toHaveBeenCalledWith({ data: { numero: esperado } });
        expect(typeof db.fraccion.create.mock.calls[0][0].data.numero).toBe('number');
    });

    test.each([
        ['"05"', '05'],
        ['"007"', '007'],
        ['"1e2"', '1e2'],
        ['"0x10"', '0x10'],
        ['"+5"', '+5'],
        ['"5.5"', '5.5'],
        ['5.5', 5.5],
        ['0', 0],
        ['"0"', '0'],
        ['-1', -1],
        ['true', true],
        ['null', null],
        ['""', ''],
        ['"abc"', 'abc'],
        ['[5]', [5]],
        ['{}', {}],
        ['INT4_MAX + 1', 2147483648],
        ['"INT4_MAX + 1"', '2147483648'],
    ])('numero %s responde 400 sin llegar a Prisma', async (_nombre, valor) => {
        const res = await request(app).post('/api/fracciones').set(ADMIN).send({ numero: valor });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Datos inválidos');
        expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'numero' })]));
        expect(db.fraccion.findUnique).not.toHaveBeenCalled();
        expect(db.fraccion.create).not.toHaveBeenCalled();
    });

    test('sin numero responde 400', async () => {
        const res = await request(app).post('/api/fracciones').set(ADMIN).send({});
        expect(res.status).toBe(400);
        expect(db.fraccion.create).not.toHaveBeenCalled();
    });
});

describe('PUT /api/fracciones/:id — numero es Int', () => {
    test.each([
        [8, 8],
        ['8', 8],
    ])('numero %j actualiza con un number y solo con campos del modelo', async (entrada, esperado) => {
        db.fraccion.findUnique.mockImplementation(async ({ where }: { where: { id?: number; numero?: number } }) =>
            where.id === 3 ? { id: 3, numero: 4 } : null,
        );
        db.fraccion.update.mockResolvedValue({ id: 3, numero: esperado });

        const res = await request(app).put('/api/fracciones/3').set(ADMIN).send({ numero: entrada });

        expect(res.status).toBe(200);
        expect(db.fraccion.update).toHaveBeenCalledTimes(1);
        const { where, data } = db.fraccion.update.mock.calls[0][0];
        expect(where).toEqual({ id: 3 });
        expect(data).toEqual({ numero: esperado });
        expect(typeof data.numero).toBe('number');
        // Prisma rechaza claves que el modelo no declara (Fraccion no tiene updatedAt).
        expect(Object.keys(data).filter((k) => !CAMPOS_FRACCION.includes(k))).toEqual([]);
    });

    test.each([['05'], ['1e2'], [true], [null], [''], [5.5], [0], [2147483648], ['2147483648']])(
        'numero %j responde 400 sin llegar a Prisma',
        async (valor) => {
            const res = await request(app).put('/api/fracciones/3').set(ADMIN).send({ numero: valor });
            expect(res.status).toBe(400);
            expect(db.fraccion.findUnique).not.toHaveBeenCalled();
            expect(db.fraccion.update).not.toHaveBeenCalled();
        },
    );

    // Bloque 3 del #257: un update sin campos es 400. Se preserva.
    test.each([[{}], [{ campoInventado: 1 }]])('%j sigue respondiendo 400', async (body) => {
        const res = await request(app).put('/api/fracciones/3').set(ADMIN).send(body);
        expect(res.status).toBe(400);
        expect(db.fraccion.update).not.toHaveBeenCalled();
    });
});

describe('statuses de fracciones', () => {
    test('GET /:id inexistente responde 404 (antes 500)', async () => {
        db.fraccion.findUnique.mockResolvedValue(null);
        const res = await request(app).get('/api/fracciones/99').set(ADMIN);
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Fracción no encontrada');
    });

    test('GET /:id existente responde 200 con la fracción', async () => {
        db.fraccion.findUnique.mockResolvedValue({ id: 2, numero: 7, lotes: [] });
        const res = await request(app).get('/api/fracciones/2').set(ADMIN);
        expect(res.status).toBe(200);
        expect(res.body.fraccion).toEqual(expect.objectContaining({ idFraccion: 2, numero: 7 }));
    });

    test('PUT /:id inexistente sigue respondiendo 404', async () => {
        db.fraccion.findUnique.mockResolvedValue(null);
        const res = await request(app).put('/api/fracciones/99').set(ADMIN).send({ numero: 8 });
        expect(res.status).toBe(404);
        expect(db.fraccion.update).not.toHaveBeenCalled();
    });

    test('DELETE /:id inexistente sigue respondiendo 404', async () => {
        db.fraccion.findUnique.mockResolvedValue(null);
        const res = await request(app).delete('/api/fracciones/99').set(authHeader('ADMINISTRADOR'));
        expect(res.status).toBe(404);
        expect(db.fraccion.delete).not.toHaveBeenCalled();
    });

    test('POST con número duplicado responde 409 (antes 400)', async () => {
        db.fraccion.findUnique.mockResolvedValue({ id: 1, numero: 5 });
        const res = await request(app).post('/api/fracciones').set(ADMIN).send({ numero: 5 });
        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('La fracción ya existe');
        expect(db.fraccion.create).not.toHaveBeenCalled();
    });

    test('PUT con número duplicado en otra fracción responde 409 (antes 400)', async () => {
        db.fraccion.findUnique.mockImplementation(async ({ where }: { where: { id?: number; numero?: number } }) =>
            where.id === 3 ? { id: 3, numero: 4 } : { id: 9, numero: where.numero },
        );
        const res = await request(app).put('/api/fracciones/3').set(ADMIN).send({ numero: 8 });
        expect(res.status).toBe(409);
        expect(res.body.message).toBe('El número de fracción ya existe');
        expect(db.fraccion.update).not.toHaveBeenCalled();
    });

    test('PUT con el mismo número que ya tiene no es un duplicado', async () => {
        db.fraccion.findUnique.mockResolvedValue({ id: 3, numero: 4 });
        db.fraccion.update.mockResolvedValue({ id: 3, numero: 4 });
        const res = await request(app).put('/api/fracciones/3').set(ADMIN).send({ numero: 4 });
        expect(res.status).toBe(200);
    });

    test('DELETE de una fracción con lotes asociados conserva su status (400)', async () => {
        db.fraccion.findUnique.mockResolvedValue({ id: 3, numero: 4 });
        db.lote.count.mockResolvedValue(2);
        const res = await request(app).delete('/api/fracciones/3').set(ADMIN);
        expect(res.status).toBe(400);
        expect(db.fraccion.delete).not.toHaveBeenCalled();
    });
});
