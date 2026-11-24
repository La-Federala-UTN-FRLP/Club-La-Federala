// Contrato HTTP de GET /api/reportes/ventas con datos (CCLF-54, subtarea 38.3).
// Ruta → controller → service real; Prisma reemplazado por el fake que evalúa la query sobre el
// set de prueba. Cada elemento se compara contra la forma tipada: claves exactas y tipos.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: require('../../support/fakes/ventaReporte.fake').crearPrismaVentasFake(),
}));

import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/config/prisma';
import { EstadoVenta, Moneda } from '../../../src/generated/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';
import { DATOS_VENTAS, PrismaVentasFake } from '../../support/fakes/ventaReporte.fake';

const db = prisma as unknown as PrismaVentasFake;

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');
const NOVIEMBRE = 'desde=2026-11-01&hasta=2026-11-30';
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_2 = /^\d+\.\d{2}$/;
const ENTERO_POSITIVO = (v: unknown) => Number.isInteger(v) && (v as number) > 0;
const ENTERO_NO_NEGATIVO = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;

beforeEach(() => {
    db.cargar(DATOS_VENTAS);
});

function expectClaves(obj: object, claves: string[]) {
    expect(Object.keys(obj).sort()).toEqual([...claves].sort());
}

describe('GET /api/reportes/ventas — contrato con datos', () => {
    test.each(['ADMINISTRADOR', 'GESTOR'])('%s recibe datos del set de prueba con la forma tipada', async (rol) => {
        const res = await request(app).get(`/api/reportes/ventas?${NOVIEMBRE}`).set(authHeader(rol));

        expect(res.status).toBe(200);
        expectClaves(res.body, ['success', 'data']);
        expect(res.body.success).toBe(true);

        const { data } = res.body;
        expectClaves(data, ['corte', 'periodo', 'periodoAnterior', 'tarjetas', 'otrasMonedas', 'filas']);
        expect(data.corte).toMatch(FECHA);
        expect(data.periodo).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' });
        expect(data.periodoAnterior).toEqual({ desde: '2026-10-02', hasta: '2026-10-31' });

        expectClaves(data.tarjetas, ['iniciadas', 'escrituradas', 'canceladas']);
        for (const t of Object.values<Record<string, unknown>>(data.tarjetas)) {
            expectClaves(t, ['cantidad', 'montoUSD', 'cantidadAnterior', 'montoUSDAnterior']);
            expect(ENTERO_NO_NEGATIVO(t.cantidad)).toBe(true);
            expect(ENTERO_NO_NEGATIVO(t.cantidadAnterior)).toBe(true);
            expect(t.montoUSD).toMatch(DECIMAL_2);
            expect(t.montoUSDAnterior).toMatch(DECIMAL_2);
        }

        expect(data.otrasMonedas.length).toBeGreaterThan(0);
        for (const o of data.otrasMonedas) {
            expectClaves(o, ['moneda', 'iniciadas', 'escrituradas', 'canceladas']);
            expect(Object.values(Moneda)).toContain(o.moneda);
            expect(o.moneda).not.toBe('USD');
            for (const t of [o.iniciadas, o.escrituradas, o.canceladas]) {
                expectClaves(t, ['cantidad', 'monto', 'cantidadAnterior', 'montoAnterior']);
                expect(ENTERO_NO_NEGATIVO(t.cantidad)).toBe(true);
                expect(ENTERO_NO_NEGATIVO(t.cantidadAnterior)).toBe(true);
                expect(t.monto).toMatch(DECIMAL_2);
                expect(t.montoAnterior).toMatch(DECIMAL_2);
            }
        }

        expect(data.filas).toHaveLength(8);
        for (const fila of data.filas) {
            expectClaves(fila, [
                'ventaId', 'numero', 'loteId', 'loteNumero', 'fraccionId', 'fraccion', 'estado',
                'fechaAlta', 'fechaEscritura', 'fechaCancelacion', 'moneda', 'monto', 'enlace',
            ]);
            expect(ENTERO_POSITIVO(fila.ventaId)).toBe(true);
            expect(typeof fila.numero).toBe('string');
            expect(ENTERO_POSITIVO(fila.loteId)).toBe(true);
            expect(fila.loteNumero === null || Number.isInteger(fila.loteNumero)).toBe(true);
            expect(ENTERO_POSITIVO(fila.fraccionId)).toBe(true);
            expect(ENTERO_POSITIVO(fila.fraccion)).toBe(true);
            expect(Object.values(EstadoVenta)).toContain(fila.estado);
            expect(fila.fechaAlta).toMatch(FECHA);
            expect(fila.fechaEscritura === null || FECHA.test(fila.fechaEscritura)).toBe(true);
            expect(fila.fechaCancelacion === null || FECHA.test(fila.fechaCancelacion)).toBe(true);
            expect(Object.values(Moneda)).toContain(fila.moneda);
            expect(fila.monto).toMatch(DECIMAL_2);
            expect(fila.enlace).toBe(`/ventas?openId=${fila.ventaId}`);
        }
    });

    test('ejemplo completo contra el set de prueba (CCLF-37 + OpenAPI)', async () => {
        const res = await request(app).get(`/api/reportes/ventas?${NOVIEMBRE}&fraccion=20`).set(ADMIN);
        expect(res.status).toBe(200);
        // Fracción 20 (número 1): lotes 503 y 504 → ventas 603, 604, 607, 609, 610.
        expect(res.body).toEqual({
            success: true,
            data: {
                corte: expect.stringMatching(FECHA),
                periodo: { desde: '2026-11-01', hasta: '2026-11-30' },
                periodoAnterior: { desde: '2026-10-02', hasta: '2026-10-31' },
                tarjetas: {
                    iniciadas: { cantidad: 2, montoUSD: '55000.50', cantidadAnterior: 0, montoUSDAnterior: '0.00' },
                    escrituradas: { cantidad: 0, montoUSD: '0.00', cantidadAnterior: 0, montoUSDAnterior: '0.00' },
                    canceladas: { cantidad: 1, montoUSD: '50000.50', cantidadAnterior: 1, montoUSDAnterior: '30000.00' },
                },
                otrasMonedas: [
                    {
                        moneda: 'ARS',
                        iniciadas: { cantidad: 1, monto: '9000000.00', cantidadAnterior: 1, montoAnterior: '4000000.00' },
                        escrituradas: { cantidad: 0, monto: '0.00', cantidadAnterior: 0, montoAnterior: '0.00' },
                        canceladas: { cantidad: 1, monto: '4000000.00', cantidadAnterior: 0, montoAnterior: '0.00' },
                    },
                ],
                filas: [
                    {
                        ventaId: 607, numero: 'CCLF-2026-607', loteId: 503, loteNumero: 1, fraccionId: 20, fraccion: 1,
                        estado: 'INICIADA', fechaAlta: '2026-11-30', fechaEscritura: null, fechaCancelacion: null,
                        moneda: 'USD', monto: '5000.00', enlace: '/ventas?openId=607',
                    },
                    {
                        ventaId: 609, numero: 'CCLF-2026-609', loteId: 504, loteNumero: 2, fraccionId: 20, fraccion: 1,
                        estado: 'INICIADA', fechaAlta: '2026-11-12', fechaEscritura: null, fechaCancelacion: null,
                        moneda: 'ARS', monto: '9000000.00', enlace: '/ventas?openId=609',
                    },
                    {
                        ventaId: 603, numero: 'CCLF-2026-603', loteId: 503, loteNumero: 1, fraccionId: 20, fraccion: 1,
                        estado: 'CANCELADA', fechaAlta: '2026-11-02', fechaEscritura: null, fechaCancelacion: '2026-11-20',
                        moneda: 'USD', monto: '50000.50', enlace: '/ventas?openId=603',
                    },
                    {
                        ventaId: 610, numero: 'CCLF-2026-610', loteId: 503, loteNumero: 1, fraccionId: 20, fraccion: 1,
                        estado: 'CANCELADA', fechaAlta: '2026-10-20', fechaEscritura: null, fechaCancelacion: '2026-11-03',
                        moneda: 'ARS', monto: '4000000.00', enlace: '/ventas?openId=610',
                    },
                ],
            },
        });
    });

    test('REP-A2 por HTTP: alta en octubre y escritura en noviembre', async () => {
        const octubre = await request(app).get('/api/reportes/ventas?desde=2026-10-01&hasta=2026-10-31&fraccion=10').set(ADMIN);
        const noviembre = await request(app).get(`/api/reportes/ventas?${NOVIEMBRE}&fraccion=10`).set(ADMIN);
        const ids = (res: request.Response) => res.body.data.filas.map((f: { ventaId: number }) => f.ventaId);
        // 601: iniciada el 15/10, escriturada el 10/11.
        expect(ids(octubre)).toContain(601);
        expect(octubre.body.data.tarjetas.escrituradas.cantidad).toBe(0);
        expect(ids(noviembre)).toContain(601);
        expect(noviembre.body.data.tarjetas.escrituradas).toMatchObject({ cantidad: 2, montoUSD: '160000.00' }); // 601 y 613
    });

    test('rango de 366 días (año bisiesto) con datos → 200', async () => {
        const res = await request(app).get('/api/reportes/ventas?desde=2026-01-01&hasta=2027-01-01').set(ADMIN);
        expect(res.status).toBe(200);
        expect(res.body.data.periodoAnterior).toEqual({ desde: '2024-12-31', hasta: '2025-12-31' });
        // Todas las altas de 2026 en USD: 13 ventas menos la eliminada (611) y las 2 en ARS (609, 610).
        expect(res.body.data.tarjetas.iniciadas.cantidad).toBe(10);
    });

    test('error de base → 500 con el contrato de error, sin detalle', async () => {
        db.venta.findMany.mockRejectedValueOnce(new Error('conexión caída: postgres://user:secret@host'));
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app).get(`/api/reportes/ventas?${NOVIEMBRE}`).set(ADMIN);
        spy.mockRestore();
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ success: false, code: 'INTERNAL_ERROR', message: 'Error interno.' });
    });
});

describe('GET /api/reportes/ventas — validación (400 VALIDATION_ERROR, sin consultar la base)', () => {
    test.each([
        ['rango de 367 días', 'desde=2026-01-01&hasta=2027-01-02'],
        ['desde > hasta', 'desde=2026-11-30&hasta=2026-11-01'],
        ['fecha inexistente', 'desde=2026-11-31&hasta=2026-12-10'],
        ['fecha con formato local', 'desde=01/11/2026&hasta=2026-11-30'],
        ['sin desde', 'hasta=2026-11-30'],
        ['sin hasta', 'desde=2026-11-01'],
    ])('%s → 400', async (_caso, qs) => {
        const res = await request(app).get(`/api/reportes/ventas?${qs}`).set(ADMIN);
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR', errors: expect.any(Array) });
        expect(res.body.errors.length).toBeGreaterThan(0);
        expect(db.venta.findMany).not.toHaveBeenCalled();
    });

    test('mensaje del rango máximo', async () => {
        const res = await request(app).get('/api/reportes/ventas?desde=2026-01-01&hasta=2027-01-02').set(ADMIN);
        expect(res.body.errors).toContainEqual(expect.objectContaining({ message: 'El período no puede superar 366 días' }));
    });
});

describe('GET /api/reportes/ventas — permisos', () => {
    test('sin token → 401', async () => {
        const res = await request(app).get(`/api/reportes/ventas?${NOVIEMBRE}`);
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
        expect(db.venta.findMany).not.toHaveBeenCalled();
    });

    test.each([
        ['INMOBILIARIA', authHeader('INMOBILIARIA', 7)],
        ['TECNICO', authHeader('TECNICO')],
    ])('%s → 403', async (_rol, headers) => {
        const res = await request(app).get(`/api/reportes/ventas?${NOVIEMBRE}`).set(headers);
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ success: false, code: 'FORBIDDEN' });
        expect(db.venta.findMany).not.toHaveBeenCalled();
    });
});
