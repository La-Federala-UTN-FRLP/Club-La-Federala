// REP-A2 (CCLF-54, subtarea 38.3): reporte de ventas por período.
// Las tarjetas y las filas se comparan con un conteo manual del set de prueba (DATOS_VENTAS, ver la
// tabla en ventaReporte.fake.ts). El fake de Prisma evalúa el where/select/orderBy del service.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: require('../../support/fakes/ventaReporte.fake').crearPrismaVentasFake(),
}));

import prisma from '../../../src/config/prisma';
import {
    getReporteVentas,
    inicioDiaNegocio,
    rangoNegocio,
    diaNegocio,
} from '../../../src/services/reporte.service';
import {
    DATOS_VENTAS,
    PERIODO_NOVIEMBRE,
    FRACCION_VA,
    FRACCION_VB,
    LOTES_VENTAS,
    PrismaVentasFake,
    VentaFixture,
    dia,
} from '../../support/fakes/ventaReporte.fake';

const db = prisma as unknown as PrismaVentasFake;

beforeEach(() => {
    db.cargar(DATOS_VENTAS);
});

afterEach(() => {
    jest.useRealTimers();
});

const idsDe = (filas: { ventaId: number }[]) => filas.map((f) => f.ventaId);

const ventaSola = (venta: Partial<VentaFixture> & Pick<VentaFixture, 'id' | 'estado' | 'fechaVenta'>): VentaFixture => ({
    numero: `CCLF-${venta.id}`,
    loteId: 501,
    monto: '1000',
    estadoOperativo: 'OPERATIVO',
    fechaEscrituraReal: null,
    fechaCancelacion: null,
    planes: [{ version: 1, moneda: 'USD' }],
    ...venta,
});

const cargarSolo = (...ventas: VentaFixture[]) =>
    db.cargar({ fracciones: [FRACCION_VA, FRACCION_VB], lotes: LOTES_VENTAS, ventas });

describe('REP-A2 — venta dada de alta en octubre y escriturada en noviembre', () => {
    beforeEach(() => {
        cargarSolo(ventaSola({
            id: 700,
            estado: 'ESCRITURADO',
            fechaVenta: dia('2026-10-15'),
            fechaEscrituraReal: dia('2026-11-10'),
            monto: '100000',
        }));
    });

    test('octubre: cuenta como iniciada y no como escriturada', async () => {
        const { tarjetas, filas } = await getReporteVentas({ desde: '2026-10-01', hasta: '2026-10-31' });
        expect(tarjetas.iniciadas).toEqual({ cantidad: 1, montoUSD: '100000.00', cantidadAnterior: 0, montoUSDAnterior: '0.00' });
        expect(tarjetas.escrituradas).toEqual({ cantidad: 0, montoUSD: '0.00', cantidadAnterior: 0, montoUSDAnterior: '0.00' });
        expect(idsDe(filas)).toEqual([700]);
    });

    test('noviembre: cuenta como escriturada; la iniciada queda en el período anterior', async () => {
        const { tarjetas, filas } = await getReporteVentas({ desde: '2026-11-01', hasta: '2026-11-30' });
        expect(tarjetas.escrituradas).toEqual({ cantidad: 1, montoUSD: '100000.00', cantidadAnterior: 0, montoUSDAnterior: '0.00' });
        expect(tarjetas.iniciadas).toEqual({ cantidad: 0, montoUSD: '0.00', cantidadAnterior: 1, montoUSDAnterior: '100000.00' });
        expect(idsDe(filas)).toEqual([700]);
    });
});

describe('getReporteVentas — set completo, noviembre 2026', () => {
    test('período y período anterior de igual duración, inmediatamente previo', async () => {
        const r = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(r.periodo).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' });
        expect(r.periodoAnterior).toEqual({ desde: '2026-10-02', hasta: '2026-10-31' });
    });

    test('iniciadas por fecha de alta (USD), contra el período anterior', async () => {
        const { tarjetas } = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(tarjetas.iniciadas).toEqual({
            cantidad: 4, // 602, 603, 606, 607
            montoUSD: '155000.50', // 80000 + 50000.50 + 20000 + 5000
            cantidadAnterior: 2, // 601, 605
            montoUSDAnterior: '110000.00', // 100000 + 10000
        });
    });

    test('escrituradas por fecha real de escritura y solo en estado ESCRITURADO', async () => {
        const { tarjetas } = await getReporteVentas(PERIODO_NOVIEMBRE);
        // 601 (escritura 10/11) y 613 (iniciada en junio). No cuentan 602 (escritura 03/12) ni
        // 612 (fecha de escritura cargada pero estado CON_BOLETO).
        expect(tarjetas.escrituradas).toEqual({ cantidad: 2, montoUSD: '160000.00', cantidadAnterior: 0, montoUSDAnterior: '0.00' });
    });

    test('canceladas por fecha de cancelación', async () => {
        const { tarjetas } = await getReporteVentas(PERIODO_NOVIEMBRE);
        // Actual: 603 (cancelada 20/11). Anterior: 604 (cancelada 10/10). 611 está eliminada.
        expect(tarjetas.canceladas).toEqual({ cantidad: 1, montoUSD: '50000.50', cantidadAnterior: 1, montoUSDAnterior: '30000.00' });
    });

    test('una venta suma en cada tarjeta por su propia fecha (603: iniciada y cancelada en el período)', async () => {
        cargarSolo(DATOS_VENTAS.ventas.find((x) => x.id === 603)!);
        const { tarjetas } = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(tarjetas.iniciadas.cantidad).toBe(1);
        expect(tarjetas.canceladas.cantidad).toBe(1);
        expect(tarjetas.escrituradas.cantidad).toBe(0);
    });

    test('iniciada en el rango y escriturada fuera de él (602): solo iniciada', async () => {
        cargarSolo(DATOS_VENTAS.ventas.find((x) => x.id === 602)!);
        const { tarjetas, filas } = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(tarjetas.iniciadas.cantidad).toBe(1);
        expect(tarjetas.escrituradas).toEqual({ cantidad: 0, montoUSD: '0.00', cantidadAnterior: 0, montoUSDAnterior: '0.00' });
        expect(filas[0]).toMatchObject({ ventaId: 602, fechaAlta: '2026-11-05', fechaEscritura: '2026-12-03' });
    });

    test('escriturada en el rango e iniciada fuera de él (613): solo escriturada', async () => {
        cargarSolo(DATOS_VENTAS.ventas.find((x) => x.id === 613)!);
        const { tarjetas, filas } = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(tarjetas.escrituradas.cantidad).toBe(1);
        expect(tarjetas.iniciadas).toEqual({ cantidad: 0, montoUSD: '0.00', cantidadAnterior: 0, montoUSDAnterior: '0.00' });
        expect(filas[0]).toMatchObject({ ventaId: 613, fechaAlta: '2026-06-01', fechaEscritura: '2026-11-25' });
    });

    test('otras monedas van aparte, agrupadas por moneda, sin sumarse a USD', async () => {
        const { otrasMonedas, tarjetas } = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(otrasMonedas).toEqual([
            {
                moneda: 'ARS',
                iniciadas: { cantidad: 1, monto: '9000000.00', cantidadAnterior: 1, montoAnterior: '4000000.00' }, // 609 / 610
                escrituradas: { cantidad: 0, monto: '0.00', cantidadAnterior: 0, montoAnterior: '0.00' },
                canceladas: { cantidad: 1, monto: '4000000.00', cantidadAnterior: 0, montoAnterior: '0.00' }, // 610
            },
        ]);
        // Ningún monto en ARS entra en las tarjetas USD.
        expect(tarjetas.iniciadas.montoUSD).toBe('155000.50');
        expect(tarjetas.canceladas.montoUSD).toBe('50000.50');
    });

    test('sin ventas en otra moneda → otrasMonedas vacío', async () => {
        cargarSolo(...DATOS_VENTAS.ventas.filter((x) => x.planes.every((p) => p.moneda === 'USD')));
        const { otrasMonedas } = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(otrasMonedas).toEqual([]);
    });

    test('ventas eliminadas (estadoOperativo ELIMINADO) quedan fuera de tarjetas y filas', async () => {
        const r = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(idsDe(r.filas)).not.toContain(611);
        // Si 611 no estuviera eliminada, sumaría 1 iniciada y 1 cancelada.
        cargarSolo({ ...DATOS_VENTAS.ventas.find((x) => x.id === 611)!, estadoOperativo: 'OPERATIVO' });
        const conActiva = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(conActiva.tarjetas.iniciadas.cantidad).toBe(1);
        expect(conActiva.tarjetas.canceladas.cantidad).toBe(1);
        // Y eliminada no suma nada.
        cargarSolo(DATOS_VENTAS.ventas.find((x) => x.id === 611)!);
        const eliminada = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(eliminada.tarjetas.iniciadas.cantidad).toBe(0);
        expect(eliminada.tarjetas.canceladas.cantidad).toBe(0);
        expect(eliminada.filas).toEqual([]);
    });

    test('filas: ventas con algún hecho en el período, por fecha de alta descendente', async () => {
        const { filas } = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(idsDe(filas)).toEqual([607, 609, 602, 603, 606, 610, 601, 613]);
    });

    test('fila con la forma tipada', async () => {
        const { filas } = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(filas.find((f) => f.ventaId === 603)).toEqual({
            ventaId: 603,
            numero: 'CCLF-2026-603',
            loteId: 503,
            loteNumero: 1,
            fraccionId: FRACCION_VB.id,
            fraccion: FRACCION_VB.numero,
            estado: 'CANCELADA',
            fechaAlta: '2026-11-02',
            fechaEscritura: null,
            fechaCancelacion: '2026-11-20',
            moneda: 'USD',
            monto: '50000.50',
            enlace: '/ventas?openId=603',
        });
        // Moneda de la fila: la del último plan (609 en ARS) o USD sin plan (602).
        expect(filas.find((f) => f.ventaId === 609)).toMatchObject({ moneda: 'ARS', monto: '9000000.00' });
        expect(filas.find((f) => f.ventaId === 602)).toMatchObject({ moneda: 'USD', monto: '80000.00' });
        // Lote sin número.
        expect(filas.find((f) => f.ventaId === 613)).toMatchObject({ loteNumero: null, fraccion: FRACCION_VA.numero });
    });

    test('filtro fraccion (id): tarjetas y filas solo de esa fracción', async () => {
        const r = await getReporteVentas({ ...PERIODO_NOVIEMBRE, fraccion: FRACCION_VA.id });
        expect(r.tarjetas).toEqual({
            iniciadas: { cantidad: 2, montoUSD: '100000.00', cantidadAnterior: 2, montoUSDAnterior: '110000.00' }, // 602, 606 / 601, 605
            escrituradas: { cantidad: 2, montoUSD: '160000.00', cantidadAnterior: 0, montoUSDAnterior: '0.00' }, // 601, 613
            canceladas: { cantidad: 0, montoUSD: '0.00', cantidadAnterior: 0, montoUSDAnterior: '0.00' },
        });
        expect(r.otrasMonedas).toEqual([]); // 609 y 610 son de la fracción B
        expect(idsDe(r.filas)).toEqual([602, 606, 601, 613]);
    });

    test('base vacía → tarjetas en cero y listas vacías', async () => {
        cargarSolo();
        const r = await getReporteVentas(PERIODO_NOVIEMBRE);
        const cero = { cantidad: 0, montoUSD: '0.00', cantidadAnterior: 0, montoUSDAnterior: '0.00' };
        expect(r.tarjetas).toEqual({ iniciadas: cero, escrituradas: cero, canceladas: cero });
        expect(r.otrasMonedas).toEqual([]);
        expect(r.filas).toEqual([]);
    });

    test('pide a la base una sola consulta que cubre ambos períodos, sin eliminadas', async () => {
        await getReporteVentas({ ...PERIODO_NOVIEMBRE, fraccion: 10 });
        expect(db.venta.findMany).toHaveBeenCalledTimes(1);
        const { where } = db.venta.findMany.mock.calls[0][0];
        const rango = { gte: new Date('2026-10-02T03:00:00.000Z'), lt: new Date('2026-12-01T03:00:00.000Z') };
        expect(where).toEqual({
            estadoOperativo: 'OPERATIVO',
            lote: { fraccionId: 10 },
            OR: [
                { fechaVenta: rango },
                { estado: 'ESCRITURADO', fechaEscrituraReal: rango },
                { estado: 'CANCELADA', fechaCancelacion: rango },
            ],
        });
    });
});

describe('bordes del día de negocio (Buenos Aires, UTC-3)', () => {
    test('alta a las 02:59:59 UTC del 01/11 es el 31/10: período anterior (605)', async () => {
        const { filas, tarjetas } = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(idsDe(filas)).not.toContain(605);
        expect(tarjetas.iniciadas.cantidadAnterior).toBe(2); // 601 y 605
    });

    test('alta a las 03:00 UTC del 01/11 ya es el 01/11: período actual (606)', async () => {
        const { filas } = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(filas.find((f) => f.ventaId === 606)).toMatchObject({ fechaAlta: '2026-11-01' });
    });

    test('alta a las 02:59:59 UTC del 01/12 todavía es el 30/11: entra (607); a las 03:00 no (608)', async () => {
        const { filas } = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(filas.find((f) => f.ventaId === 607)).toMatchObject({ fechaAlta: '2026-11-30' });
        expect(idsDe(filas)).not.toContain(608);
    });

    test('inicioDiaNegocio y rangoNegocio usan las 03:00 UTC como cambio de día', () => {
        expect(inicioDiaNegocio('2026-11-01').toISOString()).toBe('2026-11-01T03:00:00.000Z');
        expect(rangoNegocio({ desde: '2026-11-01', hasta: '2026-11-30' })).toEqual({
            gte: new Date('2026-11-01T03:00:00.000Z'),
            lt: new Date('2026-12-01T03:00:00.000Z'),
        });
        expect(diaNegocio(new Date('2026-11-01T02:59:59.999Z'))).toBe('2026-10-31');
        expect(diaNegocio(new Date('2026-11-01T03:00:00.000Z'))).toBe('2026-11-01');
    });

    test.each([
        ['2026-11-24T02:59:59Z', '2026-11-23'],
        ['2026-11-24T03:00:00Z', '2026-11-24'],
    ])('corte del reporte a las %s → %s', async (ahora, corte) => {
        jest.useFakeTimers({ now: new Date(ahora) });
        const r = await getReporteVentas(PERIODO_NOVIEMBRE);
        expect(r.corte).toBe(corte);
    });
});
