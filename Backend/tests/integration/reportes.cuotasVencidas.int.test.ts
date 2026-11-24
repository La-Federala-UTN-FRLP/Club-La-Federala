// Reporte de cuotas vencidas contra PostgreSQL real (CCLF-55, subtarea 38.4).
// Verifica lo que el fake de Prisma no puede: que la base acepte la consulta (filtros anidados
// cuota → plan → venta → lote, saldo Decimal > 0) y que el borde del día de vencimiento se respete
// con timestamps reales guardados a medianoche UTC y a las 12:00Z.
import { getReporteCuotasVencidas } from '../../src/services/reporte.service';
import { fijarAhora } from '../support/fakes/cuotaVencida.fake';
import { prisma, resetDb, crearLote, crearPersona } from './support/db';

type DatosCuota = { vence: string; exigible: string; pagado?: string };

let numeroVenta = 0;

async function crearVentaConPlanes(d: {
    loteId: number;
    estado?: 'INICIADA' | 'CON_BOLETO' | 'ESCRITURADO' | 'CANCELADA';
    estadoOperativo?: 'OPERATIVO' | 'ELIMINADO';
    planes: Array<{ estadoPlan: 'VIGENTE' | 'REEMPLAZADO' | 'CANCELADO'; moneda: 'ARS' | 'USD'; cuotas: DatosCuota[] }>;
}) {
    const comprador = await crearPersona();
    const venta = await prisma.venta.create({
        data: {
            numero: `INT-CV-${++numeroVenta}`,
            loteId: d.loteId,
            fechaVenta: new Date('2026-01-10T12:00:00Z'),
            monto: '100000',
            estado: d.estado ?? 'INICIADA',
            estadoOperativo: d.estadoOperativo ?? 'OPERATIVO',
            tipoPago: 'CUOTAS',
            compradorId: comprador.id,
        },
    });
    const cuotaIds: number[][] = [];
    for (const [i, p] of d.planes.entries()) {
        const plan = await prisma.planPago.create({
            data: {
                ventaId: venta.id,
                nombre: `Plan ${i + 1}`,
                estadoPlan: p.estadoPlan,
                esVigente: p.estadoPlan === 'VIGENTE',
                tipoFinanciacion: 'CUOTAS_FIJAS',
                moneda: p.moneda,
                cantidadCuotas: p.cuotas.length,
                montoTotalPlanificado: '100000',
                montoFinanciado: '100000',
                fechaInicio: new Date('2026-01-10T12:00:00Z'),
                version: i + 1,
            },
        });
        const ids: number[] = [];
        for (const [n, c] of p.cuotas.entries()) {
            const pagado = c.pagado ?? '0';
            const saldo = (Number(c.exigible) - Number(pagado)).toFixed(2);
            const cuota = await prisma.cuotaPlanPago.create({
                data: {
                    planPagoId: plan.id,
                    numeroCuota: n + 1,
                    tipoCuota: 'CUOTA',
                    fechaVencimiento: new Date(c.vence),
                    montoOriginal: c.exigible,
                    montoTotalExigible: c.exigible,
                    montoPagado: pagado,
                    saldoPendiente: saldo,
                    estadoCuota: saldo === '0.00' ? 'PAGA' : pagado === '0' ? 'PENDIENTE' : 'PAGO_PARCIAL',
                },
            });
            ids.push(cuota.id);
        }
        cuotaIds.push(ids);
    }
    return { venta, cuotaIds };
}

beforeEach(async () => {
    await resetDb();
    fijarAhora('2026-11-24T15:00:00Z');
});

afterEach(() => {
    jest.useRealTimers();
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe('getReporteCuotasVencidas contra PostgreSQL', () => {
    test('REP-A1: vence hoy, pagada, plan reemplazado y venta cancelada quedan fuera; ARS y USD separados', async () => {
        const loteA = await crearLote();
        const loteB = await crearLote();

        const vigente = await crearVentaConPlanes({
            loteId: loteA.id,
            planes: [
                { estadoPlan: 'REEMPLAZADO', moneda: 'USD', cuotas: [{ vence: '2026-10-01T12:00:00Z', exigible: '5000' }] },
                {
                    estadoPlan: 'VIGENTE',
                    moneda: 'USD',
                    cuotas: [
                        { vence: '2026-11-24T00:00:00Z', exigible: '1000' }, // vence hoy (medianoche UTC) → fuera
                        { vence: '2026-11-24T12:00:00Z', exigible: '1000' }, // vence hoy (frontend) → fuera
                        { vence: '2026-11-23T00:00:00Z', exigible: '1000' }, // ayer → 1 día
                        { vence: '2026-10-25T12:00:00Z', exigible: '1000', pagado: '699.67' }, // parcial, 30 días
                        { vence: '2026-09-24T12:00:00Z', exigible: '800', pagado: '800' }, // pagada → fuera
                        { vence: '2026-09-24T12:00:00Z', exigible: '2000' }, // 61 días
                    ],
                },
            ],
        });
        await crearVentaConPlanes({
            loteId: loteB.id,
            estado: 'CANCELADA',
            planes: [{ estadoPlan: 'VIGENTE', moneda: 'USD', cuotas: [{ vence: '2026-10-01T12:00:00Z', exigible: '7000' }] }],
        });
        await crearVentaConPlanes({
            loteId: loteB.id,
            estadoOperativo: 'ELIMINADO',
            planes: [{ estadoPlan: 'VIGENTE', moneda: 'USD', cuotas: [{ vence: '2026-10-01T12:00:00Z', exigible: '8000' }] }],
        });
        const ars = await crearVentaConPlanes({
            loteId: loteB.id,
            planes: [{ estadoPlan: 'VIGENTE', moneda: 'ARS', cuotas: [{ vence: '2026-11-01T12:00:00Z', exigible: '1500000' }] }],
        });

        const [, cuotasVigente] = vigente.cuotaIds;
        const usd = await getReporteCuotasVencidas({ moneda: 'USD' });
        expect(usd.corte).toBe('2026-11-24');
        expect(usd).toMatchObject({ saldoVencido: '3300.33', cuotas: 3, ventas: 1 });
        expect(usd.filas.map((f) => [f.cuotaId, f.fechaVencimiento, f.diasAtraso, f.tramo, f.saldoPendiente])).toEqual([
            [cuotasVigente[5], '2026-09-24', 61, '+60', '2000.00'],
            [cuotasVigente[3], '2026-10-25', 30, '1-30', '300.33'],
            [cuotasVigente[2], '2026-11-23', 1, '1-30', '1000.00'],
        ]);
        expect(usd.tramos).toEqual([
            { tramo: '1-30', cuotas: 2, saldo: '1300.33' },
            { tramo: '31-60', cuotas: 0, saldo: '0.00' },
            { tramo: '+60', cuotas: 1, saldo: '2000.00' },
        ]);

        const enArs = await getReporteCuotasVencidas({ moneda: 'ARS' });
        expect(enArs).toMatchObject({ saldoVencido: '1500000.00', cuotas: 1, ventas: 1 });
        expect(enArs.filas.map((f) => f.ventaId)).toEqual([ars.venta.id]);

        const soloA = await getReporteCuotasVencidas({ moneda: 'ARS', fraccion: loteA.fraccionId });
        expect(soloA.filas).toEqual([]);
    });
});
