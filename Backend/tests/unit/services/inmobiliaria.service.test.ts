jest.mock('../../../src/config/prisma', () =>
    require('../../support/mocks/prisma').inmobiliariaPrismaMock,
);

import {
    createInmobiliaria,
    deleteInmobiliaria,
    eliminarInmobiliaria,
    getAllInmobiliarias,
    getInmobiliariaById,
    reactivarInmobiliaria,
    updateInmobiliaria,
} from '../../../src/services/inmobiliaria.service';
import { Prisma } from '../../../src/generated/prisma';
import {
    inmobiliariaPrismaMock as prismaMock,
    resetPrismaMock,
} from '../../support/mocks/prisma';
import type { PostInmobiliariaRequest } from '../../../src/types/interfacesCCLF';

afterEach(() => {
    resetPrismaMock(prismaMock);
});

const ZERO_METRICS = {
    ventasTotales: 0,
    ventasActivas: 0,
    reservasTotales: 0,
    reservasActivas: 0,
    prioridadesTotales: 0,
    prioridadesActivas: 0,
};

const CREATED_AT = new Date('2026-01-15T10:00:00.000Z');

function buildPrismaInmobiliaria(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        nombre: 'Horizonte SRL',
        razonSocial: 'Horizonte Desarrollos SRL',
        contacto: 'ventas@horizonte.com',
        comxventa: new Prisma.Decimal('5.50'),
        maxPrioridadesActivas: 5,
        estadoOperativo: 'OPERATIVO',
        fechaBaja: null,
        createdAt: CREATED_AT,
        updateAt: null,
        userId: null,
        ...overrides,
    };
}

type GroupRow = { inmobiliariaId: number | null; count: number };

function toGroupRows(rows: GroupRow[] = []) {
    return rows.map((row) => ({
        inmobiliariaId: row.inmobiliariaId,
        _count: { id: row.count },
    }));
}

function hasEstadoFilter(where: { estado?: unknown } | undefined): boolean {
    return where != null && where.estado !== undefined;
}

/**
 * Configura groupBy de listado. Distingue totales vs activas por el filtro `estado`.
 * Las claves omitidas equivalen a "sin filas", no a un happy path inventado.
 */
function stubListMetricGroupBys(rows: {
    ventasTotales?: GroupRow[];
    ventasActivas?: GroupRow[];
    reservasTotales?: GroupRow[];
    reservasActivas?: GroupRow[];
    prioridadesTotales?: GroupRow[];
    prioridadesActivas?: GroupRow[];
}) {
    prismaMock.venta.groupBy.mockImplementation(async (args: { where?: { estado?: unknown } }) =>
        toGroupRows(hasEstadoFilter(args.where) ? rows.ventasActivas : rows.ventasTotales),
    );
    prismaMock.reserva.groupBy.mockImplementation(async (args: { where?: { estado?: unknown } }) =>
        toGroupRows(hasEstadoFilter(args.where) ? rows.reservasActivas : rows.reservasTotales),
    );
    prismaMock.prioridad.groupBy.mockImplementation(async (args: { where?: { estado?: unknown } }) =>
        toGroupRows(
            hasEstadoFilter(args.where) ? rows.prioridadesActivas : rows.prioridadesTotales,
        ),
    );
}

function stubDetailMetricCounts(metrics: typeof ZERO_METRICS) {
    prismaMock.venta.count.mockImplementation(async (args: { where?: { estado?: unknown } }) =>
        hasEstadoFilter(args.where) ? metrics.ventasActivas : metrics.ventasTotales,
    );
    prismaMock.reserva.count.mockImplementation(async (args: { where?: { estado?: unknown } }) =>
        hasEstadoFilter(args.where) ? metrics.reservasActivas : metrics.reservasTotales,
    );
    prismaMock.prioridad.count.mockImplementation(async (args: { where?: { estado?: unknown } }) =>
        hasEstadoFilter(args.where) ? metrics.prioridadesActivas : metrics.prioridadesTotales,
    );
}

function mappedMetrics(metrics: typeof ZERO_METRICS) {
    return {
        cantidadVentas: metrics.ventasTotales,
        cantidadReservas: metrics.reservasTotales,
        ...metrics,
    };
}

async function expectStatusCode(fn: () => Promise<unknown>, statusCode: number) {
    let thrown: unknown;
    try {
        await fn();
    } catch (error) {
        thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(thrown).toEqual(expect.objectContaining({ statusCode }));
}

describe('getAllInmobiliarias', () => {
    test('lista operativas por defecto, mapea Decimal/null y métricas en cero', async () => {
        const rows = [
            buildPrismaInmobiliaria(),
            buildPrismaInmobiliaria({
                id: 2,
                nombre: 'Campo Norte',
                razonSocial: 'Campo Norte SA',
                contacto: null,
                comxventa: null,
            }),
        ];
        prismaMock.inmobiliaria.findMany.mockResolvedValue(rows);
        prismaMock.inmobiliaria.count.mockResolvedValue(2);
        stubListMetricGroupBys({});

        const result = await getAllInmobiliarias();

        expect(prismaMock.inmobiliaria.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { estadoOperativo: 'OPERATIVO' },
            }),
        );
        expect(result.total).toBe(2);
        expect(result.inmobiliarias).toHaveLength(2);
        expect(result.inmobiliarias[0]).toEqual(
            expect.objectContaining({
                idInmobiliaria: 1,
                nombre: 'Horizonte SRL',
                comxventa: 5.5,
                contacto: 'ventas@horizonte.com',
                estado: 'OPERATIVO',
                ...mappedMetrics(ZERO_METRICS),
            }),
        );
        expect(result.inmobiliarias[1]).toEqual(
            expect.objectContaining({
                idInmobiliaria: 2,
                contacto: undefined,
                comxventa: undefined,
                ...mappedMetrics(ZERO_METRICS),
            }),
        );
    });

    test('expone métricas de groupBy en la inmobiliaria correspondiente', async () => {
        prismaMock.inmobiliaria.findMany.mockResolvedValue([
            buildPrismaInmobiliaria({ id: 1 }),
            buildPrismaInmobiliaria({ id: 2, nombre: 'Sin actividad' }),
        ]);
        prismaMock.inmobiliaria.count.mockResolvedValue(2);
        stubListMetricGroupBys({
            ventasTotales: [{ inmobiliariaId: 1, count: 4 }],
            ventasActivas: [{ inmobiliariaId: 1, count: 2 }],
            reservasTotales: [{ inmobiliariaId: 1, count: 3 }],
            reservasActivas: [{ inmobiliariaId: 1, count: 1 }],
            prioridadesTotales: [{ inmobiliariaId: 1, count: 5 }],
            prioridadesActivas: [{ inmobiliariaId: 1, count: 2 }],
        });

        const result = await getAllInmobiliarias();
        const conActividad = result.inmobiliarias.find((i) => i.idInmobiliaria === 1);
        const sinActividad = result.inmobiliarias.find((i) => i.idInmobiliaria === 2);

        expect(conActividad).toEqual(
            expect.objectContaining({
                cantidadVentas: 4,
                cantidadReservas: 3,
                ventasTotales: 4,
                ventasActivas: 2,
                reservasTotales: 3,
                reservasActivas: 1,
                prioridadesTotales: 5,
                prioridadesActivas: 2,
            }),
        );
        expect(sinActividad).toEqual(expect.objectContaining(mappedMetrics(ZERO_METRICS)));
    });

    test('ignora filas de groupBy sin inmobiliariaId', async () => {
        prismaMock.inmobiliaria.findMany.mockResolvedValue([buildPrismaInmobiliaria({ id: 1 })]);
        prismaMock.inmobiliaria.count.mockResolvedValue(1);
        stubListMetricGroupBys({
            ventasTotales: [
                { inmobiliariaId: null, count: 9 },
                { inmobiliariaId: 1, count: 2 },
            ],
        });

        const result = await getAllInmobiliarias();
        expect(result.inmobiliarias[0]).toEqual(
            expect.objectContaining({ ventasTotales: 2, cantidadVentas: 2 }),
        );
    });

    test('total proviene de count() sin el filtro de listado (contrato actual)', async () => {
        prismaMock.inmobiliaria.findMany.mockResolvedValue([buildPrismaInmobiliaria()]);
        prismaMock.inmobiliaria.count.mockResolvedValue(11);
        stubListMetricGroupBys({});

        const result = await getAllInmobiliarias();

        expect(result.inmobiliarias).toHaveLength(1);
        expect(result.total).toBe(11);
        expect(prismaMock.inmobiliaria.count).toHaveBeenCalledWith();
    });

    test('respeta filtro explícito de estadoOperativo', async () => {
        prismaMock.inmobiliaria.findMany.mockResolvedValue([
            buildPrismaInmobiliaria({ estadoOperativo: 'ELIMINADO' }),
        ]);
        prismaMock.inmobiliaria.count.mockResolvedValue(1);
        stubListMetricGroupBys({});

        await getAllInmobiliarias({ estadoOperativo: 'ELIMINADO' });

        expect(prismaMock.inmobiliaria.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { estadoOperativo: 'ELIMINADO' },
            }),
        );
    });
});

describe('getInmobiliariaById', () => {
    test('devuelve la inmobiliaria mapeada con métricas de count', async () => {
        const metrics = {
            ventasTotales: 8,
            ventasActivas: 3,
            reservasTotales: 4,
            reservasActivas: 1,
            prioridadesTotales: 6,
            prioridadesActivas: 2,
        };
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(buildPrismaInmobiliaria({ id: 3 }));
        stubDetailMetricCounts(metrics);

        const result = await getInmobiliariaById({ idInmobiliaria: 3 });

        expect(prismaMock.inmobiliaria.findUnique).toHaveBeenCalledWith({ where: { id: 3 } });
        expect(prismaMock.venta.count).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    inmobiliariaId: 3,
                    estadoOperativo: 'OPERATIVO',
                }),
            }),
        );
        expect(result.inmobiliaria).toEqual(
            expect.objectContaining({
                idInmobiliaria: 3,
                nombre: 'Horizonte SRL',
                comxventa: 5.5,
                estado: 'OPERATIVO',
                ...mappedMetrics(metrics),
            }),
        );
    });

    test('devuelve null y mensaje cuando no existe', async () => {
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(null);
        stubDetailMetricCounts(ZERO_METRICS);

        const result = await getInmobiliariaById({ idInmobiliaria: 999 });

        expect(result).toEqual({
            inmobiliaria: null,
            message: 'Inmobiliaria no encontrada',
        });
    });
});

describe('createInmobiliaria', () => {
    test('crea cuando el nombre está libre, nace OPERATIVA y persiste Decimal', async () => {
        const payload: PostInmobiliariaRequest = {
            nombre: 'Ribera Urbana',
            razonSocial: 'Ribera Urbana SA',
            contacto: 'contacto@ribera.com',
            comxventa: 7.75,
            userId: 12,
            maxPrioridadesActivas: 3,
        };
        prismaMock.inmobiliaria.findFirst.mockResolvedValue(null);
        prismaMock.inmobiliaria.create.mockResolvedValue(
            buildPrismaInmobiliaria({
                id: 10,
                nombre: payload.nombre,
                razonSocial: payload.razonSocial,
                contacto: payload.contacto,
                comxventa: new Prisma.Decimal('7.75'),
                maxPrioridadesActivas: 3,
                userId: 12,
            }),
        );

        const result = await createInmobiliaria(payload);
        const createArgs = prismaMock.inmobiliaria.create.mock.calls[0][0];

        expect(prismaMock.inmobiliaria.findFirst).toHaveBeenCalledWith({
            where: { nombre: payload.nombre },
        });
        expect(createArgs.data.nombre).toBe(payload.nombre);
        expect(createArgs.data.user).toEqual({ connect: { id: 12 } });
        expect(createArgs.data.comxventa).toBeInstanceOf(Prisma.Decimal);
        expect(createArgs.data.estadoOperativo).toBe('OPERATIVO');
        expect(createArgs.data.fechaBaja).toBeNull();
        expect(result.message).toBe('Inmobiliaria creada exitosamente');
        expect(result.inmobiliaria).toEqual(
            expect.objectContaining({
                idInmobiliaria: 10,
                nombre: payload.nombre,
                comxventa: 7.75,
                estado: 'OPERATIVO',
            }),
        );
    });

    test('rechaza nombre duplicado con 400 y no crea', async () => {
        prismaMock.inmobiliaria.findFirst.mockResolvedValue({ id: 8, nombre: 'Duplicada' });

        await expect(
            createInmobiliaria({ nombre: 'Duplicada', razonSocial: 'Duplicada SA' }),
        ).rejects.toThrow(/ya existe una inmobiliaria con ese nombre/i);
        await expectStatusCode(
            () => createInmobiliaria({ nombre: 'Duplicada', razonSocial: 'Duplicada SA' }),
            400,
        );
        expect(prismaMock.inmobiliaria.create).not.toHaveBeenCalled();
    });
});

describe('updateInmobiliaria', () => {
    test('actualiza campos y devuelve inmobiliaria con métricas', async () => {
        const id = 5;
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(
            buildPrismaInmobiliaria({ id, nombre: 'Vista Original' }),
        );
        prismaMock.inmobiliaria.findFirst.mockResolvedValue(null);
        prismaMock.inmobiliaria.update.mockResolvedValue(
            buildPrismaInmobiliaria({
                id,
                nombre: 'Nueva Vista',
                razonSocial: 'Nueva Vista SA',
                contacto: 'ventas@nuevavista.com',
                comxventa: new Prisma.Decimal('6.15'),
            }),
        );
        stubDetailMetricCounts({
            ventasTotales: 1,
            ventasActivas: 1,
            reservasTotales: 0,
            reservasActivas: 0,
            prioridadesTotales: 0,
            prioridadesActivas: 0,
        });

        const result = await updateInmobiliaria(id, {
            nombre: 'Nueva Vista',
            razonSocial: 'Nueva Vista SA',
            comxventa: 6.15,
            contacto: 'ventas@nuevavista.com',
        });
        const updateArgs = prismaMock.inmobiliaria.update.mock.calls[0][0];

        expect(prismaMock.inmobiliaria.findFirst).toHaveBeenCalledWith({
            where: { nombre: 'Nueva Vista', NOT: { id } },
            select: { id: true },
        });
        expect(updateArgs.where).toEqual({ id });
        expect(updateArgs.data.nombre).toBe('Nueva Vista');
        expect(updateArgs.data.comxventa).toBeInstanceOf(Prisma.Decimal);
        expect(updateArgs.data.updateAt).toBeInstanceOf(Date);
        expect(result.message).toBe('Inmobiliaria actualizada correctamente');
        expect(result.inmobiliaria).toEqual(
            expect.objectContaining({
                idInmobiliaria: id,
                nombre: 'Nueva Vista',
                cantidadVentas: 1,
                ventasActivas: 1,
            }),
        );
    });

    test('lanza 404 cuando no existe', async () => {
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(null);

        await expect(updateInmobiliaria(999, { nombre: 'N/A' })).rejects.toThrow(
            'Inmobiliaria no encontrada',
        );
        await expectStatusCode(() => updateInmobiliaria(999, { nombre: 'N/A' }), 404);
        expect(prismaMock.inmobiliaria.update).not.toHaveBeenCalled();
    });

    test('lanza 400 si el nombre ya existe en otra inmobiliaria', async () => {
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(buildPrismaInmobiliaria({ id: 6 }));
        prismaMock.inmobiliaria.findFirst.mockResolvedValue({ id: 2 });

        await expect(updateInmobiliaria(6, { nombre: 'Duplicada' })).rejects.toThrow(
            'El nombre ya existe',
        );
        await expectStatusCode(() => updateInmobiliaria(6, { nombre: 'Duplicada' }), 400);
        expect(prismaMock.inmobiliaria.update).not.toHaveBeenCalled();
    });

    test('no permite editar una inmobiliaria ELIMINADA (409)', async () => {
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(
            buildPrismaInmobiliaria({ estadoOperativo: 'ELIMINADO' }),
        );

        await expect(updateInmobiliaria(1, { nombre: 'No' })).rejects.toThrow(
            /no se puede editar una inmobiliaria eliminada/i,
        );
        await expectStatusCode(() => updateInmobiliaria(1, { nombre: 'No' }), 409);
        expect(prismaMock.inmobiliaria.update).not.toHaveBeenCalled();
    });

    test('update parcial solo envía los campos presentes', async () => {
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(buildPrismaInmobiliaria({ id: 4 }));
        prismaMock.inmobiliaria.update.mockResolvedValue(
            buildPrismaInmobiliaria({ id: 4, contacto: 'nuevo@mail.com' }),
        );
        stubDetailMetricCounts(ZERO_METRICS);

        await updateInmobiliaria(4, { contacto: 'nuevo@mail.com' });
        const data = prismaMock.inmobiliaria.update.mock.calls[0][0].data;

        expect(data.contacto).toBe('nuevo@mail.com');
        expect(data.nombre).toBeUndefined();
        expect(data.razonSocial).toBeUndefined();
        expect(data.comxventa).toBeUndefined();
    });

    test('ignora intento de cambiar estadoOperativo desde update', async () => {
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(buildPrismaInmobiliaria({ id: 4 }));
        prismaMock.inmobiliaria.update.mockResolvedValue(buildPrismaInmobiliaria({ id: 4 }));
        stubDetailMetricCounts(ZERO_METRICS);

        await updateInmobiliaria(4, { estado: 'ELIMINADO', contacto: 'x' });
        const data = prismaMock.inmobiliaria.update.mock.calls[0][0].data;

        expect(data.estadoOperativo).toBeUndefined();
        expect(data.estado).toBeUndefined();
        expect(data.contacto).toBe('x');
    });
});

describe('eliminarInmobiliaria', () => {
    test('hace soft delete: ELIMINADO + fechaBaja y devuelve la entidad', async () => {
        const baja = new Date('2026-03-01T12:00:00.000Z');
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(buildPrismaInmobiliaria({ id: 7 }));
        prismaMock.inmobiliaria.update.mockResolvedValue(
            buildPrismaInmobiliaria({
                id: 7,
                estadoOperativo: 'ELIMINADO',
                fechaBaja: baja,
            }),
        );
        stubDetailMetricCounts(ZERO_METRICS);

        const result = await eliminarInmobiliaria(7);
        const data = prismaMock.inmobiliaria.update.mock.calls[0][0].data;

        expect(data.estadoOperativo).toBe('ELIMINADO');
        expect(data.fechaBaja).toBeInstanceOf(Date);
        expect(result.message).toBe('Inmobiliaria eliminada correctamente');
        expect(result.inmobiliaria).toEqual(
            expect.objectContaining({
                idInmobiliaria: 7,
                estado: 'ELIMINADO',
                fechaBaja: baja.toISOString(),
            }),
        );
    });

    test('lanza 404 si no existe', async () => {
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(null);
        await expectStatusCode(() => eliminarInmobiliaria(999), 404);
        expect(prismaMock.inmobiliaria.update).not.toHaveBeenCalled();
    });

    test('lanza 409 si ya está eliminada', async () => {
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(
            buildPrismaInmobiliaria({ estadoOperativo: 'ELIMINADO' }),
        );
        await expect(eliminarInmobiliaria(7)).rejects.toThrow(/ya está eliminada/i);
        await expectStatusCode(() => eliminarInmobiliaria(7), 409);
        expect(prismaMock.inmobiliaria.update).not.toHaveBeenCalled();
    });
});

describe('reactivarInmobiliaria', () => {
    test('vuelve a OPERATIVO y limpia fechaBaja', async () => {
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(
            buildPrismaInmobiliaria({
                id: 7,
                estadoOperativo: 'ELIMINADO',
                fechaBaja: new Date('2026-03-01T12:00:00.000Z'),
            }),
        );
        prismaMock.inmobiliaria.update.mockResolvedValue(
            buildPrismaInmobiliaria({ id: 7, estadoOperativo: 'OPERATIVO', fechaBaja: null }),
        );
        stubDetailMetricCounts(ZERO_METRICS);

        const result = await reactivarInmobiliaria(7);
        const data = prismaMock.inmobiliaria.update.mock.calls[0][0].data;

        expect(data.estadoOperativo).toBe('OPERATIVO');
        expect(data.fechaBaja).toBeNull();
        expect(result.message).toBe('Inmobiliaria reactivada correctamente');
        expect(result.inmobiliaria).toEqual(
            expect.objectContaining({ idInmobiliaria: 7, estado: 'OPERATIVO' }),
        );
    });

    test('lanza 404 si no existe', async () => {
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(null);
        await expectStatusCode(() => reactivarInmobiliaria(999), 404);
    });

    test('lanza 409 si ya está operativa', async () => {
        prismaMock.inmobiliaria.findUnique.mockResolvedValue(buildPrismaInmobiliaria());
        await expect(reactivarInmobiliaria(1)).rejects.toThrow(/ya está operativa/i);
        await expectStatusCode(() => reactivarInmobiliaria(1), 409);
        expect(prismaMock.inmobiliaria.update).not.toHaveBeenCalled();
    });
});

describe('deleteInmobiliaria', () => {
    test('hard delete retorna mensaje de éxito', async () => {
        prismaMock.inmobiliaria.delete.mockResolvedValue({ id: 4 });

        const result = await deleteInmobiliaria({ idInmobiliaria: 4 });

        expect(prismaMock.inmobiliaria.delete).toHaveBeenCalledWith({ where: { id: 4 } });
        expect(result).toEqual({ message: 'Inmobiliaria eliminada correctamente' });
    });

    test('traduce Prisma P2025 a 404', async () => {
        prismaMock.inmobiliaria.delete.mockRejectedValue({ code: 'P2025' });

        await expect(deleteInmobiliaria({ idInmobiliaria: 123 })).rejects.toThrow(
            'Inmobiliaria no encontrada',
        );
        await expectStatusCode(() => deleteInmobiliaria({ idInmobiliaria: 123 }), 404);
    });
});
