// Contrato HTTP de GET /api/reportes/inventario con datos (CCLF-53, subtarea 38.2).
// Ruta → controller → service real; Prisma reemplazado por el fake que evalúa la query sobre el
// set de prueba. Cada elemento se compara contra la forma tipada: claves exactas y tipos.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: require('../../support/fakes/loteInventario.fake').crearPrismaInventarioFake(),
}));

import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/config/prisma';
import { EstadoLote, SubestadoLote } from '../../../src/generated/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';
import { DATOS_INVENTARIO, PrismaInventarioFake } from '../../support/fakes/loteInventario.fake';

const db = prisma as unknown as PrismaInventarioFake;

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');
const ESTADOS = Object.values(EstadoLote);
const SUBESTADOS = Object.values(SubestadoLote);
const DECIMAL_2 = /^\d+\.\d{2}$/;
const ENTERO_POSITIVO = (v: unknown) => Number.isInteger(v) && (v as number) > 0;

beforeEach(() => {
    db.cargar(DATOS_INVENTARIO);
});

function expectClaves(obj: object, claves: string[]) {
    expect(Object.keys(obj).sort()).toEqual([...claves].sort());
}

describe('GET /api/reportes/inventario — contrato con datos', () => {
    test('ADMINISTRADOR recibe datos del set de prueba con la forma tipada', async () => {
        const res = await request(app).get('/api/reportes/inventario').set(ADMIN);

        expect(res.status).toBe(200);
        expectClaves(res.body, ['success', 'data']);
        expect(res.body.success).toBe(true);

        const { data } = res.body;
        expectClaves(data, ['corte', 'totales', 'filas']);
        expect(data.corte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expectClaves(data.totales, ['porEstado', 'porFraccion', 'porSubestado', 'ofrecibles']);
        expect(data.totales.ofrecibles).toBe(5);

        // No vacíos: el reporte trae los datos del set.
        expect(data.totales.porEstado.length).toBeGreaterThan(0);
        expect(data.totales.porFraccion.length).toBeGreaterThan(0);
        expect(data.totales.porSubestado.length).toBeGreaterThan(0);
        expect(data.filas).toHaveLength(11);

        for (const e of data.totales.porEstado) {
            expectClaves(e, ['estado', 'cantidad']);
            expect(ESTADOS).toContain(e.estado);
            expect(ENTERO_POSITIVO(e.cantidad)).toBe(true);
        }
        for (const f of data.totales.porFraccion) {
            expectClaves(f, ['fraccionId', 'fraccion', 'cantidad', 'ofrecibles']);
            expect(ENTERO_POSITIVO(f.fraccionId)).toBe(true);
            expect(ENTERO_POSITIVO(f.fraccion)).toBe(true);
            expect(ENTERO_POSITIVO(f.cantidad)).toBe(true);
            expect(Number.isInteger(f.ofrecibles)).toBe(true);
            expect(f.ofrecibles).toBeLessThanOrEqual(f.cantidad);
        }
        for (const s of data.totales.porSubestado) {
            expectClaves(s, ['subestado', 'cantidad']);
            expect(SUBESTADOS).toContain(s.subestado);
            expect(ENTERO_POSITIVO(s.cantidad)).toBe(true);
        }
        for (const fila of data.filas) {
            expectClaves(fila, ['loteId', 'numero', 'fraccionId', 'fraccion', 'estado', 'subestado', 'precio', 'enlace']);
            expect(ENTERO_POSITIVO(fila.loteId)).toBe(true);
            expect(fila.numero === null || Number.isInteger(fila.numero)).toBe(true);
            expect(ENTERO_POSITIVO(fila.fraccionId)).toBe(true);
            expect(ENTERO_POSITIVO(fila.fraccion)).toBe(true);
            expect(ESTADOS).toContain(fila.estado);
            expect(SUBESTADOS).toContain(fila.subestado);
            expect(fila.precio === null || DECIMAL_2.test(fila.precio)).toBe(true);
            expect(fila.enlace).toBe(`/?lote=${fila.loteId}`);
        }
    });

    test('fila con la forma del ejemplo de CCLF-37', async () => {
        const res = await request(app).get('/api/reportes/inventario').set(ADMIN);
        expect(res.body.data.filas).toContainEqual({
            loteId: 101,
            numero: 5,
            fraccionId: 10,
            fraccion: 2,
            estado: 'DISPONIBLE',
            subestado: 'CONSTRUIDO',
            precio: '85000.00',
            enlace: '/?lote=101',
        });
    });

    test('REP-A4 por HTTP: fraccion + subestado filtran totales y filas', async () => {
        const res = await request(app).get('/api/reportes/inventario?fraccion=10&subestado=CONSTRUIDO').set(ADMIN);
        expect(res.status).toBe(200);
        expect(res.body.data.totales).toEqual({
            porEstado: [
                { estado: 'DISPONIBLE', cantidad: 2 },
                { estado: 'RESERVADO', cantidad: 1 },
            ],
            porFraccion: [{ fraccionId: 10, fraccion: 2, cantidad: 3, ofrecibles: 2 }],
            porSubestado: [{ subestado: 'CONSTRUIDO', cantidad: 3 }],
            ofrecibles: 2,
        });
        expect(res.body.data.filas.map((f: { loteId: number }) => f.loteId)).toEqual([101, 103, 112]);
    });

    test('error de base → 500 con el contrato de error, sin detalle', async () => {
        db.lote.findMany.mockRejectedValueOnce(new Error('conexión caída: postgres://user:secret@host'));
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app).get('/api/reportes/inventario').set(ADMIN);
        spy.mockRestore();
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ success: false, code: 'INTERNAL_ERROR', message: 'Error interno.' });
    });
});
