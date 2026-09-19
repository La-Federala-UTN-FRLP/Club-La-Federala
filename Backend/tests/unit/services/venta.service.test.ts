import { createVenta, getVentaById, deleteVenta } from '../../../src/services/venta.service';
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
