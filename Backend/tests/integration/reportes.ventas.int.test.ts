// Reporte de ventas por período contra PostgreSQL real (CCLF-54, subtarea 38.3).
// Verifica lo que el fake de Prisma no puede: que la base acepte la consulta (OR por fecha y estado,
// filtro por relación con el lote, último plan con orderBy + take) y que los bordes de día de
// Buenos Aires se respeten con timestamps reales.
import { getReporteVentas } from '../../src/services/reporte.service';
import { prisma, resetDb, crearLote, crearPersona } from './support/db';

type DatosVenta = {
    loteId: number;
    estado?: 'INICIADA' | 'CON_BOLETO' | 'ESCRITURADO' | 'CANCELADA';
    fechaVenta: string;
    monto: string;
    fechaEscrituraReal?: string;
    fechaCancelacion?: string;
    estadoOperativo?: 'OPERATIVO' | 'ELIMINADO';
    planes?: Array<'ARS' | 'USD'>;
};

let numeroVenta = 0;

async function crearVenta(d: DatosVenta) {
    const comprador = await crearPersona();
    const venta = await prisma.venta.create({
        data: {
            numero: `INT-${++numeroVenta}`,
            loteId: d.loteId,
            fechaVenta: new Date(d.fechaVenta),
            monto: d.monto,
            estado: d.estado ?? 'INICIADA',
            estadoOperativo: d.estadoOperativo ?? 'OPERATIVO',
            fechaEscrituraReal: d.fechaEscrituraReal ? new Date(d.fechaEscrituraReal) : null,
            fechaCancelacion: d.fechaCancelacion ? new Date(d.fechaCancelacion) : null,
            tipoPago: 'CONTADO',
            compradorId: comprador.id,
        },
    });
    const planes = d.planes ?? [];
    for (const [i, moneda] of planes.entries()) {
        const version = i + 1;
        const vigente = version === planes.length;
        await prisma.planPago.create({
            data: {
                ventaId: venta.id,
                nombre: `Plan ${version}`,
                estadoPlan: vigente ? 'VIGENTE' : 'REEMPLAZADO',
                esVigente: vigente,
                tipoFinanciacion: 'CONTADO',
                moneda,
                cantidadCuotas: 1,
                montoTotalPlanificado: d.monto,
                montoFinanciado: d.monto,
                fechaInicio: new Date(d.fechaVenta),
                version,
            },
        });
    }
    return venta;
}

const NOVIEMBRE = { desde: '2026-11-01', hasta: '2026-11-30' };

beforeEach(async () => {
    await resetDb();
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe('getReporteVentas contra PostgreSQL', () => {
    test('REP-A2: alta en octubre y escritura en noviembre', async () => {
        const lote = await crearLote();
        const venta = await crearVenta({
            loteId: lote.id,
            estado: 'ESCRITURADO',
            fechaVenta: '2026-10-15T12:00:00Z',
            fechaEscrituraReal: '2026-11-10T12:00:00Z',
            monto: '100000',
            planes: ['USD'],
        });

        const octubre = await getReporteVentas({ desde: '2026-10-01', hasta: '2026-10-31' });
        expect(octubre.tarjetas.iniciadas).toMatchObject({ cantidad: 1, montoUSD: '100000.00' });
        expect(octubre.tarjetas.escrituradas.cantidad).toBe(0);

        const noviembre = await getReporteVentas(NOVIEMBRE);
        expect(noviembre.tarjetas.escrituradas).toMatchObject({ cantidad: 1, montoUSD: '100000.00' });
        expect(noviembre.tarjetas.iniciadas).toMatchObject({ cantidad: 0, cantidadAnterior: 1, montoUSDAnterior: '100000.00' });
        expect(noviembre.filas.map((f) => f.ventaId)).toEqual([venta.id]);
    });

    test('bordes de día, moneda del último plan, eliminadas y filtro por fracción', async () => {
        const loteA = await crearLote();
        const loteB = await crearLote();
        // 02:59:59 UTC del 01/11 = 31/10 en Buenos Aires → período anterior.
        await crearVenta({ loteId: loteA.id, fechaVenta: '2026-11-01T02:59:59Z', monto: '10000' });
        // 03:00 UTC del 01/11 = 01/11 → período actual (sin plan: USD).
        const borde = await crearVenta({ loteId: loteA.id, fechaVenta: '2026-11-01T03:00:00Z', monto: '20000' });
        // Plan reemplazado en ARS → otrasMonedas.
        const ars = await crearVenta({ loteId: loteB.id, fechaVenta: '2026-11-12T12:00:00Z', monto: '9000000', planes: ['ARS', 'ARS'] });
        // Eliminada → fuera.
        await crearVenta({
            loteId: loteB.id,
            estado: 'CANCELADA',
            fechaVenta: '2026-11-10T12:00:00Z',
            fechaCancelacion: '2026-11-11T12:00:00Z',
            monto: '999999',
            estadoOperativo: 'ELIMINADO',
        });

        const r = await getReporteVentas(NOVIEMBRE);
        expect(r.tarjetas.iniciadas).toEqual({ cantidad: 1, montoUSD: '20000.00', cantidadAnterior: 1, montoUSDAnterior: '10000.00' });
        expect(r.tarjetas.canceladas.cantidad).toBe(0);
        expect(r.otrasMonedas).toEqual([
            expect.objectContaining({ moneda: 'ARS', iniciadas: { cantidad: 1, monto: '9000000.00', cantidadAnterior: 0, montoAnterior: '0.00' } }),
        ]);
        expect(r.filas.map((f) => [f.ventaId, f.moneda, f.fechaAlta])).toEqual([
            [ars.id, 'ARS', '2026-11-12'],
            [borde.id, 'USD', '2026-11-01'],
        ]);

        const soloA = await getReporteVentas({ ...NOVIEMBRE, fraccion: loteA.fraccionId });
        expect(soloA.otrasMonedas).toEqual([]);
        expect(soloA.filas.map((f) => f.ventaId)).toEqual([borde.id]);
    });
});
