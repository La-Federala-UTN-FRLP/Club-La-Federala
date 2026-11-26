// registrarPagoEnVenta y aplicarRecargoManualEnVenta (service real, Prisma mockeado).
// - Bug QA 22: dos pagos (o un pago y un recargo) sobre la misma cuota se serializan con un lock de la
//   fila (SELECT … FOR UPDATE) al inicio de la transacción, y los montos se calculan sobre la cuota
//   releída con el lock tomado, no sobre la lectura previa.
// - PAG-28: una venta CANCELADA no admite pagos ni recargos (409). El estado de la venta se relee
//   con lock dentro de la transacción, para cubrir una cancelación que confirma en el medio.
const mockTx = {
    $queryRaw: jest.fn(),
    cuotaPlanPago: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    pagoRegistrado: { create: jest.fn() },
    venta: { update: jest.fn() },
};

jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        venta: { findUnique: jest.fn() },
        planPago: { findFirst: jest.fn() },
        cuotaPlanPago: { findUnique: jest.fn() },
        $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(mockTx)),
    },
}));

import prismaReal from '../../../src/config/prisma';
import { aplicarRecargoManualEnVenta, registrarPagoEnVenta } from '../../../src/services/pago.service';

type Mock = jest.Mock;
const prisma = prismaReal as unknown as {
    venta: { findUnique: Mock };
    planPago: { findFirst: Mock };
    cuotaPlanPago: { findUnique: Mock };
    $transaction: Mock;
};

const MENSAJE_CANCELADA = 'No se pueden registrar pagos ni recargos sobre una venta cancelada';
const VENCIDA = new Date('2026-01-10T12:00:00.000Z');
const FUTURA = new Date('2099-01-10T12:00:00.000Z');

type CuotaRow = Record<string, unknown>;

function buildCuota(overrides: CuotaRow = {}): CuotaRow {
    return {
        id: 70,
        planPagoId: 7,
        numeroCuota: 1,
        fechaVencimiento: FUTURA,
        montoOriginal: 10000,
        montoRecargoManual: 0,
        montoTotalExigible: 10000,
        montoPagado: 3500,
        saldoPendiente: 6500,
        estadoCuota: 'PAGO_PARCIAL',
        ...overrides,
    };
}

/** Estado de la venta que devuelve el SELECT … FOR UPDATE dentro de la transacción. */
let ventaBloqueada: { estado: string; estadoOperativo: string };
/** Cuota releída dentro de la transacción (con el lock tomado). */
let cuotaBloqueada: CuotaRow;

function stubCuota(previa: CuotaRow, enTransaccion: CuotaRow = previa) {
    prisma.cuotaPlanPago.findUnique.mockResolvedValue(previa);
    prisma.planPago.findFirst.mockResolvedValue({ id: 7, cuotas: [previa] });
    cuotaBloqueada = enTransaccion;
}

beforeEach(() => {
    jest.clearAllMocks();
    prisma.venta.findUnique.mockResolvedValue({ id: 1, estado: 'INICIADA', estadoOperativo: 'OPERATIVO' });
    ventaBloqueada = { estado: 'INICIADA', estadoOperativo: 'OPERATIVO' };
    stubCuota(buildCuota());
    mockTx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
        strings.join('?').includes('"Venta"') ? [ventaBloqueada] : [{ id: 70 }],
    );
    mockTx.cuotaPlanPago.findUnique.mockImplementation(async () => cuotaBloqueada);
    // El update persiste en la "fila": el findMany posterior (resumen) ve la cuota actualizada.
    mockTx.cuotaPlanPago.update.mockImplementation(async ({ data }: { data: CuotaRow }) => {
        cuotaBloqueada = { ...cuotaBloqueada, ...data };
        return cuotaBloqueada;
    });
    mockTx.cuotaPlanPago.findMany.mockImplementation(async () => [cuotaBloqueada]);
    mockTx.pagoRegistrado.create.mockImplementation(async ({ data }: { data: CuotaRow }) => ({ id: 900, ...data }));
    mockTx.venta.update.mockResolvedValue({});
});

const pagar = (monto: number) =>
    registrarPagoEnVenta(1, { cuotaId: 70, fechaPago: '2026-02-01T10:00:00.000Z', monto, medioPago: 'EFECTIVO' });

const recargar = (montoRecargo: number) => aplicarRecargoManualEnVenta(1, { cuotaId: 70, montoRecargo });

/** SQL de cada llamada a $queryRaw (tagged template). */
const sqlDeLocks = () => mockTx.$queryRaw.mock.calls.map(([strings]) => (strings as TemplateStringsArray).join('?'));

describe('registrarPagoEnVenta — concurrencia (bug QA 22)', () => {
    test('bloquea cuota y venta (FOR UPDATE, en ese orden) antes de registrar el pago', async () => {
        await pagar(3000);

        const sql = sqlDeLocks();
        expect(sql).toHaveLength(2);
        expect(sql[0]).toMatch(/FROM "public"\."CuotaPlanPago" WHERE "id" = \? FOR UPDATE/);
        expect(sql[1]).toMatch(/FROM "public"\."Venta" WHERE "id" = \? FOR UPDATE/);
        expect(mockTx.$queryRaw.mock.calls[0][1]).toBe(70);
        expect(mockTx.$queryRaw.mock.calls[1][1]).toBe(1);
        expect(mockTx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
            mockTx.pagoRegistrado.create.mock.invocationCallOrder[0],
        );
    });

    test('pago válido: montoPagado, saldo, estado de la cuota y estadoCobro se actualizan', async () => {
        const result = await pagar(3000);

        expect(mockTx.cuotaPlanPago.update).toHaveBeenCalledWith({
            where: { id: 70 },
            data: expect.objectContaining({ montoPagado: 6500, saldoPendiente: 3500, estadoCuota: 'PAGO_PARCIAL' }),
        });
        expect(mockTx.venta.update).toHaveBeenCalledWith({
            where: { id: 1 },
            data: expect.objectContaining({ estadoCobro: 'EN_CURSO' }),
        });
        expect(result.resumen).toEqual(expect.objectContaining({ montoTotalPagado: 6500, saldoPendienteTotal: 3500 }));
    });

    // Reproducción del bug: saldo 6500 y dos pagos de 3000 en paralelo. El segundo leyó saldo 6500
    // antes de la transacción, pero con el lock ve la cuota ya actualizada por el primero.
    test('el segundo pago calcula sobre la cuota releída con el lock: sin lost update', async () => {
        stubCuota(buildCuota(), buildCuota({ montoPagado: 6500, saldoPendiente: 3500 }));

        await pagar(3000);

        expect(mockTx.cuotaPlanPago.update).toHaveBeenCalledWith({
            where: { id: 70 },
            data: expect.objectContaining({ montoPagado: 9500, saldoPendiente: 500 }),
        });
    });

    test('si con el saldo actualizado el pago lo supera → 409 sin registrar el pago ni tocar la cuota', async () => {
        stubCuota(buildCuota(), buildCuota({ montoPagado: 9500, saldoPendiente: 500 }));

        await expect(pagar(3000)).rejects.toMatchObject({
            statusCode: 409,
            message: 'El monto del pago supera el saldo pendiente de la cuota',
        });
        expect(mockTx.pagoRegistrado.create).not.toHaveBeenCalled();
        expect(mockTx.cuotaPlanPago.update).not.toHaveBeenCalled();
        expect(mockTx.venta.update).not.toHaveBeenCalled();
    });

    test('si la cuota quedó paga al tomar el lock → 409 sin registrar el pago', async () => {
        stubCuota(buildCuota(), buildCuota({ montoPagado: 10000, saldoPendiente: 0, estadoCuota: 'PAGA' }));

        await expect(pagar(3000)).rejects.toMatchObject({
            statusCode: 409,
            message: 'La cuota ya está paga o no tiene saldo pendiente',
        });
        expect(mockTx.pagoRegistrado.create).not.toHaveBeenCalled();
        expect(mockTx.cuotaPlanPago.update).not.toHaveBeenCalled();
    });
});

describe('registrarPagoEnVenta — venta cancelada o eliminada (PAG-28)', () => {
    test('venta CANCELADA → 409 sin abrir la transacción', async () => {
        prisma.venta.findUnique.mockResolvedValue({ id: 1, estado: 'CANCELADA', estadoOperativo: 'OPERATIVO' });

        await expect(pagar(3000)).rejects.toMatchObject({ statusCode: 409, message: MENSAJE_CANCELADA });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test.each([
        ['cancelada', { estado: 'CANCELADA', estadoOperativo: 'OPERATIVO' }, MENSAJE_CANCELADA],
        ['eliminada', { estado: 'INICIADA', estadoOperativo: 'ELIMINADO' }, 'La venta está eliminada'],
    ])('venta %s por otra operación mientras se registraba el pago → 409 sin registrarlo', async (_caso, estadoEnTx, mensaje) => {
        ventaBloqueada = estadoEnTx;

        await expect(pagar(3000)).rejects.toMatchObject({ statusCode: 409, message: mensaje });
        expect(mockTx.pagoRegistrado.create).not.toHaveBeenCalled();
        expect(mockTx.cuotaPlanPago.update).not.toHaveBeenCalled();
    });
});

describe('aplicarRecargoManualEnVenta — concurrencia (bug QA 22) y venta cancelada (PAG-28)', () => {
    beforeEach(() => {
        stubCuota(buildCuota({ fechaVencimiento: VENCIDA }));
    });

    test('bloquea cuota y venta antes de aplicar el recargo', async () => {
        await recargar(500);

        const sql = sqlDeLocks();
        expect(sql[0]).toMatch(/"CuotaPlanPago".*FOR UPDATE/);
        expect(sql[1]).toMatch(/"Venta".*FOR UPDATE/);
        expect(mockTx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
            mockTx.cuotaPlanPago.update.mock.invocationCallOrder[0],
        );
    });

    test('calcula sobre la cuota releída: no pisa un pago confirmado en el medio', async () => {
        stubCuota(
            buildCuota({ fechaVencimiento: VENCIDA }),
            buildCuota({ fechaVencimiento: VENCIDA, montoPagado: 6500, saldoPendiente: 3500 }),
        );

        await recargar(500);

        expect(mockTx.cuotaPlanPago.update).toHaveBeenCalledWith({
            where: { id: 70 },
            data: expect.objectContaining({ montoRecargoManual: 500, montoTotalExigible: 10500, saldoPendiente: 4000 }),
        });
    });

    test('si la cuota quedó paga al tomar el lock → 409 sin aplicar el recargo', async () => {
        stubCuota(
            buildCuota({ fechaVencimiento: VENCIDA }),
            buildCuota({ fechaVencimiento: VENCIDA, montoPagado: 10000, saldoPendiente: 0, estadoCuota: 'PAGA' }),
        );

        await expect(recargar(500)).rejects.toMatchObject({ statusCode: 409 });
        expect(mockTx.cuotaPlanPago.update).not.toHaveBeenCalled();
    });

    test('venta CANCELADA → 409 sin abrir la transacción', async () => {
        prisma.venta.findUnique.mockResolvedValue({ id: 1, estado: 'CANCELADA', estadoOperativo: 'OPERATIVO' });

        await expect(recargar(500)).rejects.toMatchObject({ statusCode: 409, message: MENSAJE_CANCELADA });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('venta cancelada mientras se aplicaba el recargo → 409 sin aplicarlo', async () => {
        ventaBloqueada = { estado: 'CANCELADA', estadoOperativo: 'OPERATIVO' };

        await expect(recargar(500)).rejects.toMatchObject({ statusCode: 409, message: MENSAJE_CANCELADA });
        expect(mockTx.cuotaPlanPago.update).not.toHaveBeenCalled();
    });
});
