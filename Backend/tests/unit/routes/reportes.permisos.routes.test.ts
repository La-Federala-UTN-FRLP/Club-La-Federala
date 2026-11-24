// REP-A3 (CCLF-52, subtarea 38.1): router /api/reportes con permisos y validación de query.
// Solo staff (ADMINISTRADOR, GESTOR); las rutas JSON responden la forma final del contrato y las
// .xlsx responden 501 hasta 38.5 (CCLF-56).
// Inventario (38.2, CCLF-53), ventas (38.3, CCLF-54) y cuotas vencidas (38.4, CCLF-55) consultan la
// base: acá corren contra los fakes de Prisma vacíos. Los contratos con datos están en
// reportes.inventario.routes.test.ts, reportes.ventas.routes.test.ts y
// reportes.cuotasVencidas.routes.test.ts.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        lote: require('../../support/fakes/loteInventario.fake').crearPrismaInventarioFake().lote,
        venta: require('../../support/fakes/ventaReporte.fake').crearPrismaVentasFake().venta,
        cuotaPlanPago: require('../../support/fakes/cuotaVencida.fake').crearPrismaCuotasFake().cuotaPlanPago,
    },
}));

import request from 'supertest';
import app from '../../../src/app';
import { authHeader, useTestWebEnv } from '../../support/http';
import { fechaCorte, periodoAnterior } from '../../../src/services/reporte.service';

useTestWebEnv();

const VENTAS_QS = 'desde=2026-11-01&hasta=2026-11-20';
const CUOTAS_QS = 'moneda=USD';

// Las 6 operaciones con una query válida: los rechazos de auth no dependen de la validación.
const RUTAS = [
    `/api/reportes/inventario`,
    `/api/reportes/inventario.xlsx`,
    `/api/reportes/ventas?${VENTAS_QS}`,
    `/api/reportes/ventas.xlsx?${VENTAS_QS}`,
    `/api/reportes/cuotas-vencidas?${CUOTAS_QS}`,
    `/api/reportes/cuotas-vencidas.xlsx?${CUOTAS_QS}`,
];
const RUTAS_XLSX = RUTAS.filter((r) => r.includes('.xlsx'));

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const TARJETA_VACIA = { cantidad: 0, montoUSD: '0.00', cantidadAnterior: 0, montoUSDAnterior: '0.00' };

describe('GET /api/reportes — autenticación y roles', () => {
    test.each(RUTAS)('sin token → 401 en %s', async (url) => {
        const res = await request(app).get(url);
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    });

    describe.each(['INMOBILIARIA', 'TECNICO'])('%s', (rol) => {
        test.each(RUTAS)('→ 403 en %s', async (url) => {
            const headers = rol === 'INMOBILIARIA' ? authHeader(rol, 7) : authHeader(rol);
            const res = await request(app).get(url).set(headers);
            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ success: false, code: 'FORBIDDEN' });
        });
    });
});

describe.each(['ADMINISTRADOR', 'GESTOR'])('GET /api/reportes — %s', (rol) => {
    test('inventario con la base vacía → 200 con la forma del contrato', async () => {
        const res = await request(app).get('/api/reportes/inventario').set(authHeader(rol));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            success: true,
            data: {
                corte: expect.stringMatching(FECHA),
                totales: { porEstado: [], porFraccion: [], porSubestado: [], ofrecibles: 0 },
                filas: [],
            },
        });
    });

    test('inventario con filtros válidos → 200', async () => {
        const res = await request(app)
            .get('/api/reportes/inventario?fraccion=3&estado=DISPONIBLE&subestado=CONSTRUIDO')
            .set(authHeader(rol));
        expect(res.status).toBe(200);
    });

    test('ventas → 200 con período, período anterior y tarjetas vacías', async () => {
        const res = await request(app).get(`/api/reportes/ventas?${VENTAS_QS}&fraccion=2`).set(authHeader(rol));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            success: true,
            data: {
                corte: expect.stringMatching(FECHA),
                periodo: { desde: '2026-11-01', hasta: '2026-11-20' },
                periodoAnterior: { desde: '2026-10-12', hasta: '2026-10-31' },
                tarjetas: { iniciadas: TARJETA_VACIA, escrituradas: TARJETA_VACIA, canceladas: TARJETA_VACIA },
                otrasMonedas: [],
                filas: [],
            },
        });
    });

    test('cuotas-vencidas con la base vacía → 200 con la moneda pedida y los 3 tramos en cero', async () => {
        const res = await request(app).get('/api/reportes/cuotas-vencidas?moneda=ARS').set(authHeader(rol));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            success: true,
            data: {
                corte: expect.stringMatching(FECHA),
                moneda: 'ARS',
                saldoVencido: '0.00',
                cuotas: 0,
                ventas: 0,
                tramos: [
                    { tramo: '1-30', cuotas: 0, saldo: '0.00' },
                    { tramo: '31-60', cuotas: 0, saldo: '0.00' },
                    { tramo: '+60', cuotas: 0, saldo: '0.00' },
                ],
                filas: [],
            },
        });
    });

    test.each(RUTAS_XLSX)('%s → 501 exportación pendiente', async (url) => {
        const res = await request(app).get(url).set(authHeader(rol));
        expect(res.status).toBe(501);
        expect(res.body).toEqual({ success: false, code: 'INTERNAL_ERROR', message: 'Exportación pendiente (CCLF-56)' });
    });
});

describe('GET /api/reportes — validación de query (400 VALIDATION_ERROR)', () => {
    const ADMIN = authHeader('ADMINISTRADOR');

    const expectValidationError = async (url: string) => {
        const res = await request(app).get(url).set(ADMIN);
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR', errors: expect.any(Array) });
        expect(res.body.errors.length).toBeGreaterThan(0);
    };

    describe.each(['/api/reportes/ventas', '/api/reportes/ventas.xlsx'])('%s', (base) => {
        test.each([
            ['sin desde', 'hasta=2026-11-20'],
            ['sin hasta', 'desde=2026-11-01'],
            ['sin desde ni hasta', ''],
            ['desde > hasta', 'desde=2026-11-21&hasta=2026-11-20'],
            ['rango de 367 días', 'desde=2025-01-01&hasta=2026-01-02'],
            ['fecha inexistente', 'desde=2026-02-30&hasta=2026-03-10'],
            ['fecha no ISO', 'desde=01/11/2026&hasta=2026-11-20'],
            ['fecha con hora', 'desde=2026-11-01T00:00:00Z&hasta=2026-11-20'],
            ['texto', 'desde=abc&hasta=2026-11-20'],
            ['fraccion inválida', `${VENTAS_QS}&fraccion=abc`],
        ])('%s → 400', async (_caso, qs) => {
            await expectValidationError(`${base}?${qs}`);
        });
    });

    test('ventas: rango de exactamente 366 días (año bisiesto completo) → 200', async () => {
        const res = await request(app).get('/api/reportes/ventas?desde=2028-01-01&hasta=2028-12-31').set(ADMIN);
        expect(res.status).toBe(200);
    });

    test('ventas: desde = hasta (un día) → 200 y período anterior de un día', async () => {
        const res = await request(app).get('/api/reportes/ventas?desde=2026-03-01&hasta=2026-03-01').set(ADMIN);
        expect(res.status).toBe(200);
        expect(res.body.data.periodoAnterior).toEqual({ desde: '2026-02-28', hasta: '2026-02-28' });
    });

    describe.each(['/api/reportes/cuotas-vencidas', '/api/reportes/cuotas-vencidas.xlsx'])('%s', (base) => {
        test.each([
            ['sin moneda', ''],
            ['moneda EUR', 'moneda=EUR'],
            ['moneda en minúscula', 'moneda=usd'],
            ['fraccion inválida', 'moneda=USD&fraccion=0'],
        ])('%s → 400', async (_caso, qs) => {
            await expectValidationError(`${base}?${qs}`);
        });
    });

    describe.each(['/api/reportes/inventario', '/api/reportes/inventario.xlsx'])('%s', (base) => {
        test.each([
            ['estado inválido', 'estado=INEXISTENTE'],
            ['estado con etiqueta en vez de enum', 'estado=Disponible'],
            ['subestado inválido', 'subestado=DEMOLIDO'],
            ['fraccion inválida', 'fraccion=-1'],
        ])('%s → 400', async (_caso, qs) => {
            await expectValidationError(`${base}?${qs}`);
        });
    });
});

describe('reporte.service — fechas', () => {
    test('fechaCorte usa el día de Buenos Aires, no el de UTC', () => {
        // 02:00 UTC del 22/11 son las 23:00 del 21/11 en Buenos Aires (UTC-3).
        expect(fechaCorte(new Date('2026-11-22T02:00:00Z'))).toBe('2026-11-21');
        expect(fechaCorte(new Date('2026-11-22T03:00:00Z'))).toBe('2026-11-22');
    });

    test('periodoAnterior: tramo de igual duración que termina el día antes de desde', () => {
        expect(periodoAnterior({ desde: '2026-11-01', hasta: '2026-11-20' })).toEqual({ desde: '2026-10-12', hasta: '2026-10-31' });
        expect(periodoAnterior({ desde: '2026-03-01', hasta: '2026-03-31' })).toEqual({ desde: '2026-01-29', hasta: '2026-02-28' });
    });
});
