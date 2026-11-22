// REP-A4 (CCLF-53, subtarea 38.2): reporte de inventario.
// Los totales y las filas se comparan con un conteo manual del set de prueba (DATOS_INVENTARIO).
// El fake de Prisma evalúa el where/groupBy/orderBy del service sobre esos datos.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: require('../../support/fakes/loteInventario.fake').crearPrismaInventarioFake(),
}));

import prisma from '../../../src/config/prisma';
import { getReporteInventario, ESTADOS_OFRECIBLES } from '../../../src/services/reporte.service';
import { DATOS_INVENTARIO, FRACCION_A, FRACCION_B, PrismaInventarioFake } from '../../support/fakes/loteInventario.fake';

const db = prisma as unknown as PrismaInventarioFake;

beforeEach(() => {
    db.cargar(DATOS_INVENTARIO);
});

const idsDe = (filas: { loteId: number }[]) => filas.map((f) => f.loteId);

describe('getReporteInventario — sin filtros', () => {
    // Universo: 11 LOTE_VENTA (101–109, 111, 112). Fuera: ESPACIO_COMUN 201 y 202, y 110 (ELIMINADO).
    test('porEstado coincide con el conteo manual, en el orden del enum', async () => {
        const { totales } = await getReporteInventario({});
        expect(totales.porEstado).toEqual([
            { estado: 'OPERATIVO', cantidad: 1 },
            { estado: 'ALQUILADO', cantidad: 1 },
            { estado: 'CON_PRIORIDAD', cantidad: 1 },
            { estado: 'DISPONIBLE', cantidad: 3 },
            { estado: 'EN_PROMOCION', cantidad: 2 },
            { estado: 'NO_DISPONIBLE', cantidad: 1 },
            { estado: 'RESERVADO', cantidad: 1 },
            { estado: 'VENDIDO', cantidad: 1 },
        ]);
    });

    test('porFraccion ordenado por número de fracción, con cantidad y ofrecibles', async () => {
        const { totales } = await getReporteInventario({});
        expect(totales.porFraccion).toEqual([
            // Fracción 1 (id 20): 106, 107, 108, 109, 111; ofrecibles 106 (DISPONIBLE) y 111 (EN_PROMOCION).
            { fraccionId: FRACCION_B.id, fraccion: 1, cantidad: 5, ofrecibles: 2 },
            // Fracción 2 (id 10): 101, 102, 103, 104, 105, 112; ofrecibles 101, 102, 112.
            { fraccionId: FRACCION_A.id, fraccion: 2, cantidad: 6, ofrecibles: 3 },
        ]);
    });

    test('porSubestado coincide con el conteo manual, en el orden del enum', async () => {
        const { totales } = await getReporteInventario({});
        expect(totales.porSubestado).toEqual([
            { subestado: 'CONSTRUIDO', cantidad: 6 }, // 101, 103, 107, 108, 111, 112
            { subestado: 'NO_CONSTRUIDO', cantidad: 3 }, // 102, 105, 106
            { subestado: 'EN_CONSTRUCCION', cantidad: 2 }, // 104, 109
        ]);
    });

    test('ofrecibles = DISPONIBLE + EN_PROMOCION', async () => {
        const { totales } = await getReporteInventario({});
        expect(totales.ofrecibles).toBe(5); // 101, 102, 106, 111, 112
    });

    test('ESPACIO_COMUN y lotes ELIMINADO no aparecen en filas ni totales', async () => {
        const { totales, filas } = await getReporteInventario({});
        expect(idsDe(filas)).not.toContain(201);
        expect(idsDe(filas)).not.toContain(202);
        expect(idsDe(filas)).not.toContain(110);
        expect(filas).toHaveLength(11);
        expect(totales.porEstado.reduce((s, e) => s + e.cantidad, 0)).toBe(11);
        expect(totales.porEstado.map((e) => e.estado)).not.toContain('ELIMINADO');
    });

    test('filas ordenadas por número de fracción y número de lote (sin número al final)', async () => {
        const { filas } = await getReporteInventario({});
        expect(idsDe(filas)).toEqual([
            107, 106, 109, 108, 111, // fracción 1: lotes 1, 2, 3, 4, 5
            104, 102, 101, 103, 112, 105, // fracción 2: lotes 1, 3, 5, 7, 9 y sin número
        ]);
    });

    test('precio con 2 decimales tal como está cargado; null si no tiene', async () => {
        const { filas } = await getReporteInventario({});
        const precio = (id: number) => filas.find((f) => f.loteId === id)!.precio;
        expect(precio(101)).toBe('85000.00');
        expect(precio(102)).toBe('72000.50');
        expect(precio(103)).toBe('90000.00');
        expect(precio(107)).toBe('60000.75');
        expect(precio(104)).toBeNull();
        for (const f of filas) {
            if (f.precio !== null) expect(f.precio).toMatch(/^\d+\.\d{2}$/);
        }
    });

    test('fila completa con el enlace al lote', async () => {
        const { filas } = await getReporteInventario({});
        expect(filas.find((f) => f.loteId === 101)).toEqual({
            loteId: 101,
            numero: 5,
            fraccionId: FRACCION_A.id,
            fraccion: 2,
            estado: 'DISPONIBLE',
            subestado: 'CONSTRUIDO',
            precio: '85000.00',
            enlace: '/?lote=101',
        });
        expect(filas.find((f) => f.loteId === 105)!.numero).toBeNull();
    });

    test('corte es la fecha actual en formato YYYY-MM-DD', async () => {
        const { corte } = await getReporteInventario({});
        expect(corte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('2 groupBy y 1 findMany, sin consultas por fila (sin N+1)', async () => {
        await getReporteInventario({});
        expect(db.lote.groupBy).toHaveBeenCalledTimes(2);
        expect(db.lote.findMany).toHaveBeenCalledTimes(1);
    });
});

describe('getReporteInventario — filtros (aplican a totales y filas por igual)', () => {
    test('REP-A4: fracción + subestado', async () => {
        // Fracción 2 (id 10) y CONSTRUIDO: 101 (DISPONIBLE), 103 (RESERVADO), 112 (DISPONIBLE).
        // 201 cumple los dos filtros pero es ESPACIO_COMUN.
        const reporte = await getReporteInventario({ fraccion: FRACCION_A.id, subestado: 'CONSTRUIDO' });
        expect(reporte.totales).toEqual({
            porEstado: [
                { estado: 'DISPONIBLE', cantidad: 2 },
                { estado: 'RESERVADO', cantidad: 1 },
            ],
            porFraccion: [{ fraccionId: FRACCION_A.id, fraccion: 2, cantidad: 3, ofrecibles: 2 }],
            porSubestado: [{ subestado: 'CONSTRUIDO', cantidad: 3 }],
            ofrecibles: 2,
        });
        expect(idsDe(reporte.filas)).toEqual([101, 103, 112]);
    });

    test('estado EN_PROMOCION: cuenta como ofrecible', async () => {
        // 111 (fracción 1, CONSTRUIDO) y 102 (fracción 2, NO_CONSTRUIDO).
        const reporte = await getReporteInventario({ estado: 'EN_PROMOCION' });
        expect(reporte.totales).toEqual({
            porEstado: [{ estado: 'EN_PROMOCION', cantidad: 2 }],
            porFraccion: [
                { fraccionId: FRACCION_B.id, fraccion: 1, cantidad: 1, ofrecibles: 1 },
                { fraccionId: FRACCION_A.id, fraccion: 2, cantidad: 1, ofrecibles: 1 },
            ],
            porSubestado: [
                { subestado: 'CONSTRUIDO', cantidad: 1 },
                { subestado: 'NO_CONSTRUIDO', cantidad: 1 },
            ],
            ofrecibles: 2,
        });
        expect(idsDe(reporte.filas)).toEqual([111, 102]);
    });

    test.each(['RESERVADO', 'VENDIDO'] as const)('estado %s: no es ofrecible', async (estado) => {
        const reporte = await getReporteInventario({ estado });
        expect(reporte.totales.porEstado).toEqual([{ estado, cantidad: 1 }]);
        expect(reporte.totales.ofrecibles).toBe(0);
        expect(reporte.totales.porFraccion).toEqual([{ fraccionId: FRACCION_A.id, fraccion: 2, cantidad: 1, ofrecibles: 0 }]);
        expect(reporte.filas).toHaveLength(1);
    });

    test('solo DISPONIBLE y EN_PROMOCION son ofrecibles', () => {
        expect([...ESTADOS_OFRECIBLES].sort()).toEqual(['DISPONIBLE', 'EN_PROMOCION']);
    });

    test('fracción sola: totales y filas de esa fracción', async () => {
        const reporte = await getReporteInventario({ fraccion: FRACCION_B.id });
        expect(reporte.totales.porFraccion).toEqual([{ fraccionId: FRACCION_B.id, fraccion: 1, cantidad: 5, ofrecibles: 2 }]);
        expect(reporte.totales.ofrecibles).toBe(2);
        expect(idsDe(reporte.filas)).toEqual([107, 106, 109, 108, 111]);
    });

    test('estado ELIMINADO: el lote queda fuera del universo, reporte vacío', async () => {
        const reporte = await getReporteInventario({ estado: 'ELIMINADO' });
        expect(reporte.totales).toEqual({ porEstado: [], porFraccion: [], porSubestado: [], ofrecibles: 0 });
        expect(reporte.filas).toEqual([]);
    });

    test('fracción sin lotes: reporte vacío', async () => {
        const reporte = await getReporteInventario({ fraccion: 999 });
        expect(reporte.totales).toEqual({ porEstado: [], porFraccion: [], porSubestado: [], ofrecibles: 0 });
        expect(reporte.filas).toEqual([]);
    });

    test('la misma condición llega a los 2 groupBy y al findMany', async () => {
        await getReporteInventario({ fraccion: FRACCION_A.id, estado: 'DISPONIBLE', subestado: 'CONSTRUIDO' });
        const esperado = {
            tipo: 'LOTE_VENTA',
            estado: { notIn: ['ELIMINADO'], equals: 'DISPONIBLE' },
            fraccionId: FRACCION_A.id,
            subestado: 'CONSTRUIDO',
        };
        for (const call of [...db.lote.groupBy.mock.calls, ...db.lote.findMany.mock.calls]) {
            expect(call[0].where).toEqual(esperado);
        }
    });
});
