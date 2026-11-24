// Contrato HTTP de GET /api/reportes/cuotas-vencidas con datos (CCLF-55, subtarea 38.4).
// Ruta → controller → service real; Prisma reemplazado por el fake que evalúa la query sobre el
// set de prueba (ver la tabla en cuotaVencida.fake.ts). Corte fijo: 24/11/2026.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: require('../../support/fakes/cuotaVencida.fake').crearPrismaCuotasFake(),
}));

import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/config/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';
import { AHORA_CORTE, DATOS_CUOTAS, PrismaCuotasFake, fijarAhora } from '../../support/fakes/cuotaVencida.fake';

const db = prisma as unknown as PrismaCuotasFake;

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_2 = /^\d+\.\d{2}$/;
const ENTERO_POSITIVO = (v: unknown) => Number.isInteger(v) && (v as number) > 0;
const ENTERO_NO_NEGATIVO = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;

beforeEach(() => {
    db.cargar(DATOS_CUOTAS);
    fijarAhora(AHORA_CORTE);
});

afterEach(() => {
    jest.useRealTimers();
});

function expectClaves(obj: object, claves: string[]) {
    expect(Object.keys(obj).sort()).toEqual([...claves].sort());
}

describe('GET /api/reportes/cuotas-vencidas — contrato con datos', () => {
    test.each(['ADMINISTRADOR', 'GESTOR'])('%s recibe datos del set de prueba con la forma tipada', async (rol) => {
        const res = await request(app).get('/api/reportes/cuotas-vencidas?moneda=USD').set(authHeader(rol));

        expect(res.status).toBe(200);
        expectClaves(res.body, ['success', 'data']);
        expect(res.body.success).toBe(true);

        const { data } = res.body;
        expectClaves(data, ['corte', 'moneda', 'saldoVencido', 'cuotas', 'ventas', 'tramos', 'filas']);
        expect(data.corte).toBe('2026-11-24');
        expect(data.moneda).toBe('USD');
        expect(data.saldoVencido).toMatch(DECIMAL_2);
        expect(ENTERO_NO_NEGATIVO(data.cuotas)).toBe(true);
        expect(ENTERO_NO_NEGATIVO(data.ventas)).toBe(true);

        expect(data.tramos.map((t: { tramo: string }) => t.tramo)).toEqual(['1-30', '31-60', '+60']);
        for (const t of data.tramos) {
            expectClaves(t, ['tramo', 'cuotas', 'saldo']);
            expect(ENTERO_NO_NEGATIVO(t.cuotas)).toBe(true);
            expect(t.saldo).toMatch(DECIMAL_2);
        }

        expect(data.filas).toHaveLength(6);
        for (const fila of data.filas) {
            expectClaves(fila, [
                'cuotaId', 'ventaId', 'ventaNumero', 'loteId', 'loteNumero', 'fraccion', 'numeroCuota',
                'cantidadCuotas', 'fechaVencimiento', 'diasAtraso', 'tramo', 'saldoPendiente', 'enlace',
            ]);
            expect(ENTERO_POSITIVO(fila.cuotaId)).toBe(true);
            expect(ENTERO_POSITIVO(fila.ventaId)).toBe(true);
            expect(typeof fila.ventaNumero).toBe('string');
            expect(ENTERO_POSITIVO(fila.loteId)).toBe(true);
            expect(fila.loteNumero === null || Number.isInteger(fila.loteNumero)).toBe(true);
            expect(ENTERO_POSITIVO(fila.fraccion)).toBe(true);
            expect(ENTERO_POSITIVO(fila.numeroCuota)).toBe(true);
            expect(ENTERO_POSITIVO(fila.cantidadCuotas)).toBe(true);
            expect(fila.fechaVencimiento).toMatch(FECHA);
            expect(fila.fechaVencimiento < data.corte).toBe(true);
            expect(ENTERO_POSITIVO(fila.diasAtraso)).toBe(true);
            expect(['1-30', '31-60', '+60']).toContain(fila.tramo);
            expect(fila.saldoPendiente).toMatch(DECIMAL_2);
            expect(fila.enlace).toBe(`/ventas/${fila.ventaId}/pagos`);
        }
    });

    test('REP-A1 por HTTP: ejemplo completo en USD', async () => {
        const res = await request(app).get('/api/reportes/cuotas-vencidas?moneda=USD').set(ADMIN);
        expect(res.status).toBe(200);
        const fila = (cuotaId: number, numeroCuota: number, fechaVencimiento: string, diasAtraso: number, tramo: string, saldoPendiente: string) => ({
            cuotaId, ventaId: 801, ventaNumero: 'CCLF-2026-801', loteId: 501, loteNumero: 1, fraccion: 2,
            numeroCuota, cantidadCuotas: 12, fechaVencimiento, diasAtraso, tramo, saldoPendiente, enlace: '/ventas/801/pagos',
        });
        expect(res.body).toEqual({
            success: true,
            data: {
                corte: '2026-11-24',
                moneda: 'USD',
                saldoVencido: '4051.09',
                cuotas: 6,
                ventas: 2,
                tramos: [
                    { tramo: '1-30', cuotas: 3, saldo: '1800.83' },
                    { tramo: '31-60', cuotas: 2, saldo: '250.26' },
                    { tramo: '+60', cuotas: 1, saldo: '2000.00' },
                ],
                filas: [
                    fila(906, 6, '2026-09-24', 61, '+60', '2000.00'),
                    fila(905, 5, '2026-09-25', 60, '31-60', '0.01'),
                    fila(904, 4, '2026-10-24', 31, '31-60', '250.25'),
                    fila(903, 3, '2026-10-25', 30, '1-30', '500.50'),
                    {
                        cuotaId: 909, ventaId: 802, ventaNumero: 'CCLF-2026-802', loteId: 503, loteNumero: 1, fraccion: 1,
                        numeroCuota: 1, cantidadCuotas: 4, fechaVencimiento: '2026-11-10', diasAtraso: 14, tramo: '1-30',
                        saldoPendiente: '300.33', enlace: '/ventas/802/pagos',
                    },
                    fila(902, 2, '2026-11-23', 1, '1-30', '1000.00'),
                ],
            },
        });
    });

    test('ARS por separado: no incluye ninguna cuota en USD', async () => {
        const res = await request(app).get('/api/reportes/cuotas-vencidas?moneda=ARS').set(ADMIN);
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ moneda: 'ARS', saldoVencido: '1750000.50', cuotas: 2, ventas: 1 });
        expect(res.body.data.filas.map((f: { cuotaId: number }) => f.cuotaId)).toEqual([914, 913]);
    });

    test('filtro fraccion por id', async () => {
        const res = await request(app).get('/api/reportes/cuotas-vencidas?moneda=USD&fraccion=20').set(ADMIN);
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ saldoVencido: '300.33', cuotas: 1, ventas: 1 });
    });

    test('error de base → 500 con el contrato de error, sin detalle', async () => {
        db.cuotaPlanPago.findMany.mockRejectedValueOnce(new Error('conexión caída: postgres://user:secret@host'));
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app).get('/api/reportes/cuotas-vencidas?moneda=USD').set(ADMIN);
        spy.mockRestore();
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ success: false, code: 'INTERNAL_ERROR', message: 'Error interno.' });
    });
});

describe('GET /api/reportes/cuotas-vencidas — validación (400 VALIDATION_ERROR, sin consultar la base)', () => {
    test.each([
        ['sin moneda', ''],
        ['moneda vacía', 'moneda='],
        ['moneda EUR', 'moneda=EUR'],
        ['moneda en minúscula', 'moneda=usd'],
        ['moneda repetida', 'moneda=USD&moneda=ARS'],
        ['fraccion 0', 'moneda=USD&fraccion=0'],
        ['fraccion negativa', 'moneda=USD&fraccion=-1'],
        ['fraccion texto', 'moneda=USD&fraccion=abc'],
        ['fraccion decimal', 'moneda=USD&fraccion=1.5'],
    ])('%s → 400', async (_caso, qs) => {
        const res = await request(app).get(`/api/reportes/cuotas-vencidas?${qs}`).set(ADMIN);
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR', errors: expect.any(Array) });
        expect(res.body.errors.length).toBeGreaterThan(0);
        expect(db.cuotaPlanPago.findMany).not.toHaveBeenCalled();
    });
});

describe('GET /api/reportes/cuotas-vencidas — permisos', () => {
    test('sin token → 401', async () => {
        const res = await request(app).get('/api/reportes/cuotas-vencidas?moneda=USD');
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
        expect(db.cuotaPlanPago.findMany).not.toHaveBeenCalled();
    });

    test('token inválido → 401', async () => {
        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const res = await request(app).get('/api/reportes/cuotas-vencidas?moneda=USD').set({ Authorization: 'Bearer no-es-un-jwt' });
        spy.mockRestore();
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
        expect(db.cuotaPlanPago.findMany).not.toHaveBeenCalled();
    });

    test.each([
        ['INMOBILIARIA', authHeader('INMOBILIARIA', 7)],
        ['TECNICO', authHeader('TECNICO')],
    ])('%s → 403', async (_rol, headers) => {
        const res = await request(app).get('/api/reportes/cuotas-vencidas?moneda=USD').set(headers);
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ success: false, code: 'FORBIDDEN' });
        expect(db.cuotaPlanPago.findMany).not.toHaveBeenCalled();
    });
});
