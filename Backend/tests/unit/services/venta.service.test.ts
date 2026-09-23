import {
    createVenta,
    getVentaById,
    deleteVenta,
    getVentasByInmobiliaria,
    eliminarVenta,
    reactivarVenta,
} from '../../../src/services/venta.service';
import prisma from '../../../src/config/prisma';
import type { PostVentaRequest } from '../../../src/types/interfacesCCLF';

const mockTx = {
    venta: { create: jest.fn() },
    lote: { update: jest.fn() },
    prioridad: { findFirst: jest.fn(), update: jest.fn() },
    reserva: { update: jest.fn() },
};

jest.mock('../../../src/config/prisma', () => ({
    venta: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    lote: {
        findUnique: jest.fn(),
        update: jest.fn(),
    },
    persona: {
        findUnique: jest.fn(),
    },
    reserva: {
        findMany: jest.fn(),
        update: jest.fn(),
    },
    prioridad: {
        findFirst: jest.fn(),
        update: jest.fn(),
    },
    $transaction: jest.fn(async (callback: any) => callback(mockTx)),
}));

afterEach(() => {
    jest.clearAllMocks();
});

type VentaActor = { role: string; inmobiliariaId?: number | null };

function buildUser(
    role: string,
    inmobiliariaId: number | null | undefined = undefined,
): VentaActor {
    return { role, inmobiliariaId };
}

async function expectStatus(
    fn: () => Promise<unknown>,
    status: number,
    key: 'status' | 'statusCode' = 'statusCode',
) {
    let thrown: unknown;
    try {
        await fn();
    } catch (error) {
        thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(thrown).toEqual(expect.objectContaining({ [key]: status }));
}

function buildVentaRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        inmobiliariaId: 5,
        estadoOperativo: 'OPERATIVO',
        estado: 'CANCELADA',
        estadoCobro: 'PENDIENTE',
        fechaEscrituraReal: null,
        fechaCancelacion: new Date('2026-01-01'),
        motivoCancelacion: 'motivo test',
        ...overrides,
    };
}

function baseVentaRequest(overrides: Partial<PostVentaRequest> = {}): PostVentaRequest {
    return {
        id: 1,
        loteId: 10,
        lote: { id: 10 } as any,
        fechaVenta: '2026-01-15T10:00:00.000Z',
        monto: 80000,
        tipoPago: 'CONTADO',
        compradorId: 100,
        numero: 'CCLF-2026-01',
        ...overrides,
    };
}

function setupBaseMocks(loteOverrides: any = {}) {
    (prisma.lote.findUnique as jest.Mock).mockResolvedValue({
        id: 10, estado: 'DISPONIBLE', ...loteOverrides,
    });
    (prisma.persona.findUnique as jest.Mock).mockResolvedValue({ id: 100 });
    (prisma.reserva.findMany as jest.Mock).mockResolvedValue([]);
    mockTx.prioridad.findFirst.mockResolvedValue(null);
    mockTx.venta.create.mockResolvedValue({
        id: 1, loteId: 10, compradorId: 100, monto: 80000,
    });
}

describe('getVentasByInmobiliaria', () => {
    test('INMOBILIARIA cross-tenant: rechaza 403 sin findMany (regression RED)', async () => {
        (prisma.venta.findMany as jest.Mock).mockResolvedValue([{ id: 99, inmobiliariaId: 9 }]);

        await expectStatus(
            () => getVentasByInmobiliaria(9, {}, buildUser('INMOBILIARIA', 5)),
            403,
        );
        expect(prisma.venta.findMany).not.toHaveBeenCalled();
    });

    test('INMOBILIARIA sin inmobiliariaId: rechaza 403 sin findMany (regression RED)', async () => {
        (prisma.venta.findMany as jest.Mock).mockResolvedValue([{ id: 1, inmobiliariaId: 5 }]);

        await expectStatus(
            () => getVentasByInmobiliaria(5, {}, buildUser('INMOBILIARIA', undefined)),
            403,
        );
        expect(prisma.venta.findMany).not.toHaveBeenCalled();
    });

    test('sin actor (user undefined): rechaza 403 sin findMany (regression RED)', async () => {
        (prisma.venta.findMany as jest.Mock).mockResolvedValue([{ id: 1, inmobiliariaId: 5 }]);

        await expectStatus(
            () => getVentasByInmobiliaria(5, {}, undefined),
            403,
        );
        expect(prisma.venta.findMany).not.toHaveBeenCalled();
    });

    test('INMOBILIARIA propia: consulta inmobiliariaId del path', async () => {
        const rows = [{ id: 10, inmobiliariaId: 5 }];
        (prisma.venta.findMany as jest.Mock).mockResolvedValue(rows);

        const result = await getVentasByInmobiliaria(5, {}, buildUser('INMOBILIARIA', 5));

        expect(result).toEqual(rows);
        expect(prisma.venta.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { inmobiliariaId: 5, estadoOperativo: 'OPERATIVO' },
            }),
        );
    });

    test.each(['ADMINISTRADOR', 'GESTOR'] as const)(
        '%s puede listar cualquier inmobiliaria sin filtro de tenant',
        async (role) => {
            const rows = [{ id: 20, inmobiliariaId: 9 }];
            (prisma.venta.findMany as jest.Mock).mockResolvedValue(rows);

            const result = await getVentasByInmobiliaria(9, {}, buildUser(role));

            expect(result).toEqual(rows);
            expect(prisma.venta.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { inmobiliariaId: 9, estadoOperativo: 'OPERATIVO' },
                }),
            );
        },
    );

    test('listado vacío autorizado: 404 mantiene contrato', async () => {
        (prisma.venta.findMany as jest.Mock).mockResolvedValue([]);

        await expectStatus(
            () => getVentasByInmobiliaria(5, {}, buildUser('INMOBILIARIA', 5)),
            404,
        );
        expect(prisma.venta.findMany).toHaveBeenCalled();
    });
});

describe('eliminarVenta', () => {
    test('INMOBILIARIA propia eliminable: soft delete permitido', async () => {
        const venta = buildVentaRow({ inmobiliariaId: 5 });
        (prisma.venta.findUnique as jest.Mock).mockResolvedValue(venta);
        (prisma.venta.update as jest.Mock).mockResolvedValue({
            ...venta,
            estadoOperativo: 'ELIMINADO',
        });

        await eliminarVenta(1, buildUser('INMOBILIARIA', 5));

        expect(prisma.venta.update).toHaveBeenCalledTimes(1);
        expect(prisma.venta.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 1 },
                data: expect.objectContaining({ estadoOperativo: 'ELIMINADO' }),
            }),
        );
    });

    test('INMOBILIARIA ajena: 403 sin update', async () => {
        (prisma.venta.findUnique as jest.Mock).mockResolvedValue(
            buildVentaRow({ inmobiliariaId: 9 }),
        );

        await expectStatus(
            () => eliminarVenta(1, buildUser('INMOBILIARIA', 5)),
            403,
        );
        expect(prisma.venta.update).not.toHaveBeenCalled();
    });

    test('venta Federala (inmobiliariaId null) vs INMO: 403 sin update', async () => {
        (prisma.venta.findUnique as jest.Mock).mockResolvedValue(
            buildVentaRow({ inmobiliariaId: null }),
        );

        await expectStatus(
            () => eliminarVenta(1, buildUser('INMOBILIARIA', 5)),
            403,
        );
        expect(prisma.venta.update).not.toHaveBeenCalled();
    });

    test('INMOBILIARIA sin inmobiliariaId: 403 sin update (regression RED)', async () => {
        (prisma.venta.findUnique as jest.Mock).mockResolvedValue(
            buildVentaRow({ inmobiliariaId: 9 }),
        );
        (prisma.venta.update as jest.Mock).mockResolvedValue({});

        await expectStatus(
            () => eliminarVenta(1, buildUser('INMOBILIARIA', undefined)),
            403,
        );
        expect(prisma.venta.update).not.toHaveBeenCalled();
    });

    test('sin actor (user undefined): 403 sin update (regression RED)', async () => {
        (prisma.venta.findUnique as jest.Mock).mockResolvedValue(
            buildVentaRow({ inmobiliariaId: 9 }),
        );
        (prisma.venta.update as jest.Mock).mockResolvedValue({});

        await expectStatus(
            () => eliminarVenta(1, undefined),
            403,
        );
        expect(prisma.venta.update).not.toHaveBeenCalled();
    });

    test('ADMINISTRADOR no restringido por tenant', async () => {
        const venta = buildVentaRow({ inmobiliariaId: 9 });
        (prisma.venta.findUnique as jest.Mock).mockResolvedValue(venta);
        (prisma.venta.update as jest.Mock).mockResolvedValue({
            ...venta,
            estadoOperativo: 'ELIMINADO',
        });

        await eliminarVenta(1, buildUser('ADMINISTRADOR'));

        expect(prisma.venta.update).toHaveBeenCalledTimes(1);
    });
});

describe('reactivarVenta', () => {
    test('INMOBILIARIA propia: reactiva a OPERATIVO', async () => {
        const venta = buildVentaRow({
            inmobiliariaId: 5,
            estadoOperativo: 'ELIMINADO',
        });
        (prisma.venta.findUnique as jest.Mock).mockResolvedValue(venta);
        (prisma.venta.update as jest.Mock).mockResolvedValue({
            ...venta,
            estadoOperativo: 'OPERATIVO',
        });

        await reactivarVenta(1, buildUser('INMOBILIARIA', 5));

        expect(prisma.venta.update).toHaveBeenCalledTimes(1);
        expect(prisma.venta.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 1 },
                data: { estadoOperativo: 'OPERATIVO' },
            }),
        );
    });

    test('INMOBILIARIA ajena: 403 sin update', async () => {
        (prisma.venta.findUnique as jest.Mock).mockResolvedValue(
            buildVentaRow({ inmobiliariaId: 9, estadoOperativo: 'ELIMINADO' }),
        );

        await expectStatus(
            () => reactivarVenta(1, buildUser('INMOBILIARIA', 5)),
            403,
        );
        expect(prisma.venta.update).not.toHaveBeenCalled();
    });

    test('venta Federala vs INMO: 403 sin update', async () => {
        (prisma.venta.findUnique as jest.Mock).mockResolvedValue(
            buildVentaRow({ inmobiliariaId: null, estadoOperativo: 'ELIMINADO' }),
        );

        await expectStatus(
            () => reactivarVenta(1, buildUser('INMOBILIARIA', 5)),
            403,
        );
        expect(prisma.venta.update).not.toHaveBeenCalled();
    });

    test('INMOBILIARIA sin inmobiliariaId: 403 sin update (regression RED)', async () => {
        (prisma.venta.findUnique as jest.Mock).mockResolvedValue(
            buildVentaRow({ inmobiliariaId: 9, estadoOperativo: 'ELIMINADO' }),
        );
        (prisma.venta.update as jest.Mock).mockResolvedValue({});

        await expectStatus(
            () => reactivarVenta(1, buildUser('INMOBILIARIA', undefined)),
            403,
        );
        expect(prisma.venta.update).not.toHaveBeenCalled();
    });

    test('sin actor (user undefined): 403 sin update (regression RED)', async () => {
        (prisma.venta.findUnique as jest.Mock).mockResolvedValue(
            buildVentaRow({ inmobiliariaId: 9, estadoOperativo: 'ELIMINADO' }),
        );
        (prisma.venta.update as jest.Mock).mockResolvedValue({});

        await expectStatus(
            () => reactivarVenta(1, undefined),
            403,
        );
        expect(prisma.venta.update).not.toHaveBeenCalled();
    });
});

describe('getVentaById', () => {
    test('debe retornar una venta existente', async () => {
        const mockVenta = { id: 1, loteId: 10, monto: 50000 };
        (prisma.venta.findUnique as jest.Mock).mockResolvedValue(mockVenta);

        const result = await getVentaById(1);
        expect(result).toEqual(mockVenta);
    });

    test('debe lanzar error 404 si la venta no existe', async () => {
        (prisma.venta.findUnique as jest.Mock).mockResolvedValue(null);

        await expect(getVentaById(999)).rejects.toThrow('Venta no encontrada');
        await expect(getVentaById(999)).rejects.toHaveProperty('statusCode', 404);
    });
});

describe('deleteVenta', () => {
    test('debe eliminar una venta y retornar mensaje', async () => {
        (prisma.venta.delete as jest.Mock).mockResolvedValue({ id: 1 });
        const result = await deleteVenta(1);
        expect(result).toEqual({ message: 'Venta eliminada correctamente' });
    });

    test('debe lanzar error 404 si la venta no existe', async () => {
        (prisma.venta.delete as jest.Mock).mockRejectedValue({ code: 'P2025' });
        await expect(deleteVenta(999)).rejects.toThrow('Venta no encontrada');
    });
});

describe('createVenta', () => {
    test('crea venta en lote DISPONIBLE sin reserva', async () => {
        setupBaseMocks();
        const req = baseVentaRequest();

        const result = await createVenta(req);

        expect(result).toBeDefined();
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(mockTx.venta.create).toHaveBeenCalledTimes(1);
        expect(mockTx.lote.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 10 }, data: { estado: 'VENDIDO' } })
        );
        expect(mockTx.reserva.update).not.toHaveBeenCalled();
    });

    test('error 404 si lote no existe', async () => {
        (prisma.lote.findUnique as jest.Mock).mockResolvedValue(null);
        await expect(createVenta(baseVentaRequest())).rejects.toThrow('Lote no encontrado');
    });

    test('error 400 si lote ya vendido', async () => {
        (prisma.lote.findUnique as jest.Mock).mockResolvedValue({ id: 10, estado: 'VENDIDO' });
        await expect(createVenta(baseVentaRequest())).rejects.toThrow('El lote ya está vendido');
    });

    test('error 404 si comprador no existe', async () => {
        setupBaseMocks();
        (prisma.persona.findUnique as jest.Mock).mockResolvedValue(null);
        await expect(createVenta(baseVentaRequest())).rejects.toThrow(/Comprador no encontrado/);
    });

    test('reserva ACTIVA → pasa a ACEPTADA y se asigna ventaId', async () => {
        setupBaseMocks({ estado: 'RESERVADO' });
        (prisma.reserva.findMany as jest.Mock).mockResolvedValue([
            { id: 50, loteId: 10, estado: 'ACTIVA', estadoOperativo: 'OPERATIVO', ventaId: null, inmobiliariaId: null, clienteId: 100, ofertaInicial: 80000, ofertaActual: 80000 },
        ]);

        await createVenta(baseVentaRequest());

        expect(mockTx.reserva.update).toHaveBeenCalledWith({
            where: { id: 50 },
            data: expect.objectContaining({ estado: 'ACEPTADA' }),
        });
        expect(mockTx.reserva.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ ventaId: 1 }) })
        );
    });

    test('reserva ACEPTADA → permanece ACEPTADA, ventaId seteado', async () => {
        setupBaseMocks({ estado: 'RESERVADO' });
        (prisma.reserva.findMany as jest.Mock).mockResolvedValue([
            { id: 51, loteId: 10, estado: 'ACEPTADA', estadoOperativo: 'OPERATIVO', ventaId: null, inmobiliariaId: null, clienteId: 100, ofertaInicial: 70000, ofertaActual: 80000 },
        ]);

        await createVenta(baseVentaRequest());

        expect(mockTx.reserva.update).toHaveBeenCalledWith({
            where: { id: 51 },
            data: { ventaId: 1 },
        });
    });

    test('reserva con inmobiliaria no-Federala: venta con misma inmobiliaria OK', async () => {
        setupBaseMocks({ estado: 'RESERVADO' });
        (prisma.reserva.findMany as jest.Mock).mockResolvedValue([
            { id: 52, loteId: 10, estado: 'ACEPTADA', estadoOperativo: 'OPERATIVO', ventaId: null, inmobiliariaId: 7, clienteId: 100, ofertaInicial: 80000, ofertaActual: 80000 },
        ]);

        await expect(createVenta(baseVentaRequest({ inmobiliariaId: 7 }))).resolves.toBeDefined();
    });

    test('reserva con inmobiliaria no-Federala: venta con distinta → error 400', async () => {
        setupBaseMocks({ estado: 'RESERVADO' });
        (prisma.reserva.findMany as jest.Mock).mockResolvedValue([
            { id: 53, loteId: 10, estado: 'ACEPTADA', estadoOperativo: 'OPERATIVO', ventaId: null, inmobiliariaId: 7, clienteId: 100, ofertaInicial: 80000, ofertaActual: 80000 },
        ]);

        await expect(
            createVenta(baseVentaRequest({ inmobiliariaId: 99 }))
        ).rejects.toThrow(/inmobiliaria de la venta debe coincidir/);
    });

    test('reserva Federala (inmobiliariaId null): venta con cualquier inmobiliaria OK', async () => {
        setupBaseMocks({ estado: 'RESERVADO' });
        (prisma.reserva.findMany as jest.Mock).mockResolvedValue([
            { id: 54, loteId: 10, estado: 'ACEPTADA', estadoOperativo: 'OPERATIVO', ventaId: null, inmobiliariaId: null, clienteId: 100, ofertaInicial: 80000, ofertaActual: 80000 },
        ]);

        await expect(createVenta(baseVentaRequest({ inmobiliariaId: 42 }))).resolves.toBeDefined();
    });

    test('reserva consumida (ventaId seteado) no es elegible', async () => {
        setupBaseMocks({ estado: 'DISPONIBLE' });
        (prisma.reserva.findMany as jest.Mock).mockResolvedValue([]);

        await expect(createVenta(baseVentaRequest())).resolves.toBeDefined();
        expect(mockTx.reserva.update).not.toHaveBeenCalled();
    });

    test('múltiples reservas vigentes → error 409', async () => {
        setupBaseMocks({ estado: 'RESERVADO' });
        (prisma.reserva.findMany as jest.Mock).mockResolvedValue([
            { id: 60, loteId: 10, estado: 'ACTIVA', estadoOperativo: 'OPERATIVO', ventaId: null, inmobiliariaId: null, clienteId: 100, ofertaInicial: 80000, ofertaActual: 80000 },
            { id: 61, loteId: 10, estado: 'ACEPTADA', estadoOperativo: 'OPERATIVO', ventaId: null, inmobiliariaId: null, clienteId: 101, ofertaInicial: 80000, ofertaActual: 80000 },
        ]);

        await expect(createVenta(baseVentaRequest())).rejects.toThrow(/Conflicto.*reservas vigentes/);
    });

    test('cliente reserva no coincide con compradores: no bloquea, se crea la venta', async () => {
        setupBaseMocks({ estado: 'RESERVADO' });
        (prisma.reserva.findMany as jest.Mock).mockResolvedValue([
            { id: 55, loteId: 10, estado: 'ACEPTADA', estadoOperativo: 'OPERATIVO', ventaId: null, inmobiliariaId: null, clienteId: 999, ofertaInicial: 80000, ofertaActual: 80000 },
        ]);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(createVenta(baseVentaRequest())).resolves.toBeDefined();

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[Venta-Reserva]'),
            expect.objectContaining({ reservaId: 55, clienteId: 999 })
        );
        warnSpy.mockRestore();
    });

    test('finaliza prioridad activa del lote dentro de la transacción', async () => {
        setupBaseMocks();
        mockTx.prioridad.findFirst.mockResolvedValue({ id: 200, loteId: 10, estado: 'ACTIVA' });

        await createVenta(baseVentaRequest());

        expect(mockTx.prioridad.update).toHaveBeenCalledWith({
            where: { id: 200 },
            data: { estado: 'FINALIZADA' },
        });
    });
});
