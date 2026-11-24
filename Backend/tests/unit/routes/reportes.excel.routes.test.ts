// Exportación a Excel de los reportes (CCLF-56, subtarea 38.5).
//
// Ruta → controller → service real → reporte.excel; Prisma reemplazado por los fakes de los 3 reportes
// (los mismos sets que los tests JSON) más un fake de fraccion.findUnique para rotular el filtro.
// Cada .xlsx se lee con ExcelJS y se compara con la respuesta JSON de los mismos filtros (REP-A5).
jest.mock('../../../src/config/prisma', () => {
    const inventario = require('../../support/fakes/loteInventario.fake').crearPrismaInventarioFake();
    const ventas = require('../../support/fakes/ventaReporte.fake').crearPrismaVentasFake();
    const cuotas = require('../../support/fakes/cuotaVencida.fake').crearPrismaCuotasFake();
    // Fracciones de los sets: inventario y ventas usan los mismos ids y números (10 → 2, 20 → 1).
    const numeros = new Map([[10, 2], [20, 1]]);
    const fraccion = {
        findUnique: jest.fn(async (args: { where: { id: number }; select: unknown }) => {
            if (JSON.stringify(args.select) !== JSON.stringify({ numero: true })) throw new Error('fraccion.findUnique: select inesperado');
            const numero = numeros.get(args.where.id);
            return numero === undefined ? null : { numero };
        }),
    };
    return {
        __esModule: true,
        default: { lote: inventario.lote, venta: ventas.venta, cuotaPlanPago: cuotas.cuotaPlanPago, fraccion, fakes: { inventario, ventas, cuotas } },
    };
});

import request from 'supertest';
import { Workbook } from 'exceljs';
import type { Worksheet, CellValue } from 'exceljs';
import app from '../../../src/app';
import prisma from '../../../src/config/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';
import { DATOS_INVENTARIO, PrismaInventarioFake } from '../../support/fakes/loteInventario.fake';
import { DATOS_VENTAS, PrismaVentasFake } from '../../support/fakes/ventaReporte.fake';
import { AHORA_CORTE, CORTE, DATOS_CUOTAS, PrismaCuotasFake, fijarAhora } from '../../support/fakes/cuotaVencida.fake';

const db = prisma as unknown as {
    fakes: { inventario: PrismaInventarioFake; ventas: PrismaVentasFake; cuotas: PrismaCuotasFake };
    lote: PrismaInventarioFake['lote'];
};

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FMT_USD = '"USD" #,##0.00';
const FMT_ARS = '"ARS" #,##0.00';
const NOVIEMBRE = 'desde=2026-11-01&hasta=2026-11-30';

beforeEach(() => {
    db.fakes.inventario.cargar(DATOS_INVENTARIO);
    db.fakes.ventas.cargar(DATOS_VENTAS);
    db.fakes.cuotas.cargar(DATOS_CUOTAS);
    // Corte fijo (24/11/2026, 12:00 en Buenos Aires) para todos: fecha de corte y de generación deterministas.
    fijarAhora(AHORA_CORTE);
});

afterEach(() => {
    jest.useRealTimers();
});

// ------------------------------------------------------------ Helpers

/** Parser de supertest que junta el body binario en un Buffer (res es el IncomingMessage de Node). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function binario(res: any, cb: (err: Error | null, body: Buffer) => void) {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
}

async function descargar(url: string, headers: Record<string, string> = ADMIN) {
    return request(app).get(url).set(headers).buffer(true).parse(binario);
}

async function leerLibro(body: Buffer): Promise<Workbook> {
    const wb = new Workbook();
    // Los tipos de ExcelJS declaran el Buffer de @types/node viejo (sin genérico).
    await wb.xlsx.load(body as unknown as Parameters<Workbook['xlsx']['load']>[0]);
    return wb;
}

async function exportar(url: string): Promise<Workbook> {
    const res = await descargar(url);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(XLSX);
    return leerLibro(res.body);
}

async function json(url: string) {
    const res = await request(app).get(url).set(ADMIN);
    expect(res.status).toBe(200);
    return res.body.data;
}

function hoja(wb: Workbook, nombre: string): Worksheet {
    const ws = wb.getWorksheet(nombre);
    if (!ws) throw new Error(`Falta la hoja ${nombre}`);
    return ws;
}

function encabezados(ws: Worksheet): CellValue[] {
    return Array.from({ length: ws.columnCount }, (_, i) => ws.getRow(1).getCell(i + 1).value);
}

/** Filas de datos (sin el encabezado) como objetos encabezado → valor de celda. */
function filasDatos(ws: Worksheet): Record<string, CellValue>[] {
    const cols = encabezados(ws) as string[];
    const out: Record<string, CellValue>[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        out.push(Object.fromEntries(cols.map((c, i) => [c, row.getCell(i + 1).value])));
    }
    return out;
}

/** Celda de una fila de datos por encabezado. */
function celda(ws: Worksheet, filaDatos: number, encabezado: string) {
    const col = (encabezados(ws) as string[]).indexOf(encabezado) + 1;
    if (col === 0) throw new Error(`Falta la columna ${encabezado}`);
    return ws.getRow(filaDatos + 1).getCell(col);
}

/** Hoja Parámetros como mapa parámetro → celda del valor. */
function parametros(wb: Workbook) {
    const ws = hoja(wb, 'Parámetros');
    const out = new Map<string, ReturnType<Worksheet['getCell']>>();
    ws.eachRow((row) => {
        out.set(String(row.getCell(1).value), row.getCell(2));
    });
    return out;
}

/** Día de calendario de una celda de fecha (ExcelJS la devuelve a las 00:00Z de ese día). */
function dia(valor: CellValue): string {
    expect(valor).toBeInstanceOf(Date);
    return (valor as Date).toISOString().slice(0, 10);
}

/** Valores de la columna A de una hoja: para ubicar bloques en Totales. */
function columnaA(ws: Worksheet): CellValue[] {
    return Array.from({ length: ws.rowCount }, (_, i) => ws.getRow(i + 1).getCell(1).value);
}

function expectEncabezadoFormateado(ws: Worksheet) {
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeDefined();
}

// ------------------------------------------------------------ Inventario

describe('GET /api/reportes/inventario.xlsx', () => {
    const COLUMNAS = ['ID de lote', 'Fracción', 'N.º de lote', 'Estado', 'Subestado constructivo', 'Precio (USD)'];

    test('headers HTTP: tipo xlsx y descarga con nombre del reporte y fecha de corte', async () => {
        const res = await descargar('/api/reportes/inventario.xlsx');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe(XLSX);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="reporte-inventario_corte-${CORTE}.xlsx"`);
        expect(res.headers['cache-control']).toBe('no-store');
        // Es un zip (los .xlsx empiezan con "PK").
        expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    });

    test.each([
        ['sin filtros', ''],
        ['fracción + subestado', '?fraccion=10&subestado=CONSTRUIDO'],
        ['estado', '?estado=DISPONIBLE'],
    ])('REP-A5 (%s): mismas filas, en el mismo orden, que el JSON', async (_caso, qs) => {
        const data = await json(`/api/reportes/inventario${qs}`);
        const ws = hoja(await exportar(`/api/reportes/inventario.xlsx${qs}`), 'Inventario');

        expect(encabezados(ws)).toEqual(COLUMNAS);
        const filas = filasDatos(ws);
        expect(filas).toHaveLength(data.filas.length);
        expect(filas.length).toBeGreaterThan(0);
        filas.forEach((f, i) => {
            const j = data.filas[i];
            expect(f['ID de lote']).toBe(j.loteId);
            expect(f['Fracción']).toBe(j.fraccion);
            expect(f['N.º de lote']).toBe(j.numero);
            expect(f['Precio (USD)']).toBe(j.precio === null ? null : Number(j.precio));
        });
    });

    test('formatos: precio numérico en USD, estados con etiqueta, nulos vacíos, encabezado formateado', async () => {
        const ws = hoja(await exportar('/api/reportes/inventario.xlsx'), 'Inventario');
        expectEncabezadoFormateado(ws);
        const filas = filasDatos(ws);
        const i101 = filas.findIndex((f) => f['ID de lote'] === 101) + 1;
        const precio = celda(ws, i101, 'Precio (USD)');
        expect(precio.value).toBe(85000);
        expect(typeof precio.value).toBe('number');
        expect(precio.numFmt).toBe(FMT_USD);
        expect(celda(ws, i101, 'Estado').value).toBe('Disponible');
        expect(celda(ws, i101, 'Subestado constructivo').value).toBe('Construido');

        // Lote 102: etiquetas con tilde. Lote 104: sin precio. Lote 105: sin número.
        const i102 = filas.findIndex((f) => f['ID de lote'] === 102) + 1;
        expect(celda(ws, i102, 'Estado').value).toBe('En promoción');
        expect(celda(ws, i102, 'Precio (USD)').value).toBe(72000.5);
        const i104 = filas.findIndex((f) => f['ID de lote'] === 104) + 1;
        expect(celda(ws, i104, 'Subestado constructivo').value).toBe('En construcción');
        expect(celda(ws, i104, 'Precio (USD)').value).toBeNull();
        const i105 = filas.findIndex((f) => f['ID de lote'] === 105) + 1;
        expect(celda(ws, i105, 'N.º de lote').value).toBeNull();

        // Ningún valor crudo del enum ni dato que el JSON no tenga (enlace, ids internos de fracción).
        for (const f of filas) {
            expect(String(f['Estado'])).not.toMatch(/^[A-Z_]+$/);
            expect(String(f['Subestado constructivo'])).not.toMatch(/^[A-Z_]+$/);
        }
    });

    test('hoja Totales con los mismos agregados que el JSON', async () => {
        const data = await json('/api/reportes/inventario');
        const ws = hoja(await exportar('/api/reportes/inventario.xlsx'), 'Totales');
        const a = columnaA(ws);
        expect(ws.getRow(a.indexOf('Lotes ofrecibles (Disponible o En promoción)') + 2).getCell(1).value).toBe(data.totales.ofrecibles);
        const inicioFraccion = a.indexOf('Por fracción') + 3; // título + encabezado
        data.totales.porFraccion.forEach((f: { fraccion: number; cantidad: number; ofrecibles: number }, i: number) => {
            const row = ws.getRow(inicioFraccion + i);
            expect([row.getCell(1).value, row.getCell(2).value, row.getCell(3).value]).toEqual([f.fraccion, f.cantidad, f.ofrecibles]);
        });
    });

    test('Parámetros: corte en día de Buenos Aires, generación y filtros con valor legible', async () => {
        const p = parametros(await exportar('/api/reportes/inventario.xlsx?fraccion=10&subestado=NO_CONSTRUIDO'));
        expect(p.get('Reporte')?.value).toBe('Inventario de lotes');
        const corte = p.get('Fecha de corte (America/Argentina/Buenos_Aires)')!;
        expect(dia(corte.value)).toBe(CORTE);
        expect(corte.numFmt).toBe('dd/mm/yyyy');
        // 15:00Z = 12:00 en Buenos Aires.
        const generado = p.get('Generado (hora de Buenos Aires)')!;
        expect((generado.value as Date).toISOString()).toBe('2026-11-24T12:00:00.000Z');
        expect(generado.numFmt).toBe('dd/mm/yyyy hh:mm');
        // Fracción por número visible (id 10 → fracción 2), no por id.
        expect(p.get('Filtro: Fracción')?.value).toBe(2);
        expect(p.get('Filtro: Estado')?.value).toBe('Todos');
        expect(p.get('Filtro: Subestado constructivo')?.value).toBe('No construido');
        expect(p.get('Filas exportadas')?.value).toBe(2); // lotes 102 y 105
    });

    test('Parámetros sin filtros: "Todas" / "Todos"', async () => {
        const p = parametros(await exportar('/api/reportes/inventario.xlsx'));
        expect(p.get('Filtro: Fracción')?.value).toBe('Todas');
        expect(p.get('Filtro: Estado')?.value).toBe('Todos');
        expect(p.get('Filtro: Subestado constructivo')?.value).toBe('Todos');
    });

    test('sin filas: archivo válido solo con encabezados', async () => {
        // ELIMINADO está fuera del universo del inventario: el filtro no devuelve nada.
        const data = await json('/api/reportes/inventario?estado=ELIMINADO');
        expect(data.filas).toEqual([]);
        const wb = await exportar('/api/reportes/inventario.xlsx?estado=ELIMINADO');
        const ws = hoja(wb, 'Inventario');
        expect(ws.rowCount).toBe(1);
        expect(encabezados(ws)).toEqual(COLUMNAS);
        expect(parametros(wb).get('Filas exportadas')?.value).toBe(0);
    });

    test('fracción inexistente: 200 sin filas (como el JSON) y el filtro lo informa', async () => {
        const wb = await exportar('/api/reportes/inventario.xlsx?fraccion=99');
        expect(hoja(wb, 'Inventario').rowCount).toBe(1);
        expect(parametros(wb).get('Filtro: Fracción')?.value).toBe('Inexistente (id 99)');
    });

    test('error de base → 500 JSON, sin archivo adjunto', async () => {
        db.lote.findMany.mockRejectedValueOnce(new Error('conexión caída'));
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app).get('/api/reportes/inventario.xlsx').set(ADMIN);
        spy.mockRestore();
        expect(res.status).toBe(500);
        expect(res.headers['content-type']).toMatch(/^application\/json/);
        expect(res.headers['content-disposition']).toBeUndefined();
        expect(res.body).toEqual({ success: false, code: 'INTERNAL_ERROR', message: 'Error interno.' });
    });
});

// ------------------------------------------------------------ Ventas

describe('GET /api/reportes/ventas.xlsx', () => {
    const COLUMNAS = [
        'ID de venta', 'N.º de venta', 'Fracción', 'N.º de lote', 'Estado', 'Fecha de alta', 'Fecha de escritura',
        'Fecha de cancelación', 'Moneda', 'Monto',
    ];

    test('nombre del archivo con período y fecha de corte', async () => {
        const res = await descargar(`/api/reportes/ventas.xlsx?${NOVIEMBRE}`);
        expect(res.headers['content-disposition'])
            .toBe(`attachment; filename="reporte-ventas_2026-11-01_a_2026-11-30_corte-${CORTE}.xlsx"`);
    });

    test.each([
        ['noviembre', NOVIEMBRE],
        ['noviembre, fracción 10', `${NOVIEMBRE}&fraccion=10`],
    ])('REP-A5 (%s): mismas filas, en el mismo orden, que el JSON', async (_caso, qs) => {
        const data = await json(`/api/reportes/ventas?${qs}`);
        const ws = hoja(await exportar(`/api/reportes/ventas.xlsx?${qs}`), 'Ventas');
        expect(encabezados(ws)).toEqual(COLUMNAS);
        const filas = filasDatos(ws);
        expect(filas.length).toBeGreaterThan(0);
        expect(filas).toHaveLength(data.filas.length);
        filas.forEach((f, i) => {
            const j = data.filas[i];
            expect(f['ID de venta']).toBe(j.ventaId);
            expect(f['N.º de venta']).toBe(j.numero);
            expect(f['Fracción']).toBe(j.fraccion);
            expect(f['N.º de lote']).toBe(j.loteNumero);
            expect(f['Moneda']).toBe(j.moneda);
            expect(f['Monto']).toBe(Number(j.monto));
            expect(dia(f['Fecha de alta'])).toBe(j.fechaAlta);
            expect(f['Fecha de escritura'] === null ? null : dia(f['Fecha de escritura'])).toBe(j.fechaEscritura);
            expect(f['Fecha de cancelación'] === null ? null : dia(f['Fecha de cancelación'])).toBe(j.fechaCancelacion);
        });
    });

    test('formatos: fechas sin corrimiento de día, monto con el formato de su moneda, nulos vacíos', async () => {
        const ws = hoja(await exportar(`/api/reportes/ventas.xlsx?${NOVIEMBRE}`), 'Ventas');
        expectEncabezadoFormateado(ws);
        const filas = filasDatos(ws);
        const fila = (id: number) => filas.findIndex((f) => f['ID de venta'] === id) + 1;

        // 606 se dio de alta el 01/11 a las 00:00 de Buenos Aires (03:00Z): la fecha es 01/11.
        const alta606 = celda(ws, fila(606), 'Fecha de alta');
        expect(dia(alta606.value)).toBe('2026-11-01');
        expect(alta606.numFmt).toBe('dd/mm/yyyy');
        // 607: 30/11 23:59:59 en Buenos Aires (01/12 02:59:59Z) → 30/11.
        expect(dia(celda(ws, fila(607), 'Fecha de alta').value)).toBe('2026-11-30');

        const monto601 = celda(ws, fila(601), 'Monto');
        expect(monto601.value).toBe(100000);
        expect(monto601.numFmt).toBe(FMT_USD);
        expect(dia(celda(ws, fila(601), 'Fecha de escritura').value)).toBe('2026-11-10');
        expect(celda(ws, fila(601), 'Fecha de cancelación').value).toBeNull();
        expect(celda(ws, fila(601), 'Estado').value).toBe('Escriturado');

        // 609 es en ARS: su monto lleva formato ARS, nunca USD.
        const monto609 = celda(ws, fila(609), 'Monto');
        expect(monto609.value).toBe(9000000);
        expect(monto609.numFmt).toBe(FMT_ARS);
        expect(celda(ws, fila(609), 'Moneda').value).toBe('ARS');
        expect(celda(ws, fila(603), 'Monto').value).toBe(50000.5);
    });

    test('Totales: USD y otras monedas en bloques separados, sin sumar', async () => {
        const data = await json(`/api/reportes/ventas?${NOVIEMBRE}`);
        const ws = hoja(await exportar(`/api/reportes/ventas.xlsx?${NOVIEMBRE}`), 'Totales');
        const a = columnaA(ws);

        const usd = ws.getRow(a.indexOf('Ventas en USD') + 2 + 1); // título, encabezado, Iniciadas
        expect(usd.getCell(1).value).toBe('Iniciadas');
        expect(usd.getCell(2).value).toBe(data.tarjetas.iniciadas.cantidad);
        expect(usd.getCell(3).value).toBe(Number(data.tarjetas.iniciadas.montoUSD));
        expect(usd.getCell(3).numFmt).toBe(FMT_USD);
        expect(usd.getCell(4).value).toBe(data.tarjetas.iniciadas.cantidadAnterior);
        expect(usd.getCell(5).value).toBe(Number(data.tarjetas.iniciadas.montoUSDAnterior));

        const ars = data.otrasMonedas.find((o: { moneda: string }) => o.moneda === 'ARS');
        const filaArs = ws.getRow(a.indexOf('Ventas en ARS (no se suman a USD)') + 2 + 1);
        expect(filaArs.getCell(3).value).toBe(Number(ars.iniciadas.monto));
        expect(filaArs.getCell(3).numFmt).toBe(FMT_ARS);
    });

    test('Parámetros: desde, hasta y período anterior como fechas; fracción legible', async () => {
        const p = parametros(await exportar(`/api/reportes/ventas.xlsx?${NOVIEMBRE}&fraccion=20`));
        expect(dia(p.get('Filtro: Desde')!.value)).toBe('2026-11-01');
        expect(dia(p.get('Filtro: Hasta')!.value)).toBe('2026-11-30');
        expect(p.get('Filtro: Desde')!.numFmt).toBe('dd/mm/yyyy');
        expect(dia(p.get('Filtro: Período anterior: desde')!.value)).toBe('2026-10-02');
        expect(dia(p.get('Filtro: Período anterior: hasta')!.value)).toBe('2026-10-31');
        expect(p.get('Filtro: Fracción')?.value).toBe(1);
        expect(dia(p.get('Fecha de corte (America/Argentina/Buenos_Aires)')!.value)).toBe(CORTE);
    });

    test('sin filas: archivo válido solo con encabezados', async () => {
        const qs = 'desde=2020-01-01&hasta=2020-01-31';
        expect((await json(`/api/reportes/ventas?${qs}`)).filas).toEqual([]);
        const ws = hoja(await exportar(`/api/reportes/ventas.xlsx?${qs}`), 'Ventas');
        expect(ws.rowCount).toBe(1);
        expect(encabezados(ws)).toEqual(COLUMNAS);
    });
});

// ------------------------------------------------------------ Cuotas vencidas

describe('GET /api/reportes/cuotas-vencidas.xlsx', () => {
    const COLUMNAS = [
        'ID de cuota', 'N.º de venta', 'Fracción', 'N.º de lote', 'N.º de cuota', 'Cantidad de cuotas', 'Vencimiento',
        'Días de atraso', 'Tramo', 'Saldo (incluye recargos)',
    ];

    test('nombre del archivo con moneda y fecha de corte', async () => {
        const res = await descargar('/api/reportes/cuotas-vencidas.xlsx?moneda=ARS');
        expect(res.headers['content-disposition']).toBe(`attachment; filename="reporte-cuotas-vencidas_ARS_corte-${CORTE}.xlsx"`);
    });

    test.each([
        ['USD', 'moneda=USD'],
        ['ARS', 'moneda=ARS'],
        ['USD, fracción 20', 'moneda=USD&fraccion=20'],
    ])('REP-A5 (%s): mismas filas, en el mismo orden, que el JSON', async (_caso, qs) => {
        const data = await json(`/api/reportes/cuotas-vencidas?${qs}`);
        const ws = hoja(await exportar(`/api/reportes/cuotas-vencidas.xlsx?${qs}`), 'Cuotas vencidas');
        expect(encabezados(ws)).toEqual(COLUMNAS);
        const filas = filasDatos(ws);
        expect(filas.length).toBeGreaterThan(0);
        expect(filas).toHaveLength(data.filas.length);
        filas.forEach((f, i) => {
            const j = data.filas[i];
            expect(f['ID de cuota']).toBe(j.cuotaId);
            expect(f['N.º de venta']).toBe(j.ventaNumero);
            expect(f['Fracción']).toBe(j.fraccion);
            expect(f['N.º de lote']).toBe(j.loteNumero);
            expect(f['N.º de cuota']).toBe(j.numeroCuota);
            expect(f['Cantidad de cuotas']).toBe(j.cantidadCuotas);
            expect(dia(f['Vencimiento'])).toBe(j.fechaVencimiento);
            expect(f['Días de atraso']).toBe(j.diasAtraso);
            expect(f['Tramo']).toBe(j.tramo);
            expect(f['Saldo (incluye recargos)']).toBe(Number(j.saldoPendiente));
        });
    });

    test('formatos: saldo en la moneda pedida, vencimiento sin corrimiento de día', async () => {
        const usd = hoja(await exportar('/api/reportes/cuotas-vencidas.xlsx?moneda=USD'), 'Cuotas vencidas');
        expectEncabezadoFormateado(usd);
        const fila = (ws: Worksheet, id: number) => filasDatos(ws).findIndex((f) => f['ID de cuota'] === id) + 1;

        // 902 vence el 23/11 guardado a las 00:00Z (21:00 del 22/11 en Buenos Aires): la fecha es 23/11.
        const venc902 = celda(usd, fila(usd, 902), 'Vencimiento');
        expect(dia(venc902.value)).toBe('2026-11-23');
        expect(venc902.numFmt).toBe('dd/mm/yyyy');
        const saldo903 = celda(usd, fila(usd, 903), 'Saldo (incluye recargos)');
        expect(saldo903.value).toBe(500.5);
        expect(saldo903.numFmt).toBe(FMT_USD);

        const ars = hoja(await exportar('/api/reportes/cuotas-vencidas.xlsx?moneda=ARS'), 'Cuotas vencidas');
        const saldo914 = celda(ars, fila(ars, 914), 'Saldo (incluye recargos)');
        expect(saldo914.value).toBe(250000.5);
        expect(saldo914.numFmt).toBe(FMT_ARS);
        // Una moneda por archivo: ningún saldo ARS lleva formato USD.
        for (let i = 1; i <= ars.rowCount - 1; i++) expect(celda(ars, i, 'Saldo (incluye recargos)').numFmt).toBe(FMT_ARS);
    });

    test('Totales: saldo vencido y los 3 tramos (aunque estén en cero) como el JSON', async () => {
        const data = await json('/api/reportes/cuotas-vencidas?moneda=USD');
        const ws = hoja(await exportar('/api/reportes/cuotas-vencidas.xlsx?moneda=USD'), 'Totales');
        const a = columnaA(ws);
        const total = ws.getRow(a.indexOf('Saldo vencido en USD') + 3);
        expect(total.getCell(1).value).toBe(Number(data.saldoVencido));
        expect(total.getCell(1).value).toBe(4051.09);
        expect(total.getCell(1).numFmt).toBe(FMT_USD);
        expect([total.getCell(2).value, total.getCell(3).value]).toEqual([data.cuotas, data.ventas]);

        const inicioTramos = a.indexOf('Por tramo de atraso (días)') + 3;
        const tramos = [0, 1, 2].map((i) => ws.getRow(inicioTramos + i));
        expect(tramos.map((r) => r.getCell(1).value)).toEqual(['1-30', '31-60', '+60']);
        tramos.forEach((r, i) => {
            expect(r.getCell(2).value).toBe(data.tramos[i].cuotas);
            expect(r.getCell(3).value).toBe(Number(data.tramos[i].saldo));
            expect(r.getCell(3).numFmt).toBe(FMT_USD);
        });
    });

    test('Parámetros: moneda y fracción legibles', async () => {
        const p = parametros(await exportar('/api/reportes/cuotas-vencidas.xlsx?moneda=ARS&fraccion=10'));
        expect(p.get('Reporte')?.value).toBe('Cuotas vencidas');
        expect(dia(p.get('Fecha de corte (America/Argentina/Buenos_Aires)')!.value)).toBe(CORTE);
        expect(p.get('Filtro: Moneda')?.value).toBe('ARS');
        expect(p.get('Filtro: Fracción')?.value).toBe(2);
    });

    test('sin filas: archivo válido solo con encabezados y tramos en cero', async () => {
        db.fakes.cuotas.cargar({ ...DATOS_CUOTAS, cuotas: [] });
        const wb = await exportar('/api/reportes/cuotas-vencidas.xlsx?moneda=USD');
        const ws = hoja(wb, 'Cuotas vencidas');
        expect(ws.rowCount).toBe(1);
        expect(encabezados(ws)).toEqual(COLUMNAS);
        const totales = hoja(wb, 'Totales');
        const a = columnaA(totales);
        expect(totales.getRow(a.indexOf('Saldo vencido en USD') + 3).getCell(1).value).toBe(0);
    });
});

// ------------------------------------------------------------ Errores: JSON, nunca un archivo

describe('exportaciones: errores con el contrato JSON y sin archivo', () => {
    const RUTAS = [
        '/api/reportes/inventario.xlsx',
        `/api/reportes/ventas.xlsx?${NOVIEMBRE}`,
        '/api/reportes/cuotas-vencidas.xlsx?moneda=USD',
    ];

    const expectErrorJson = (res: request.Response, status: number, code: string) => {
        expect(res.status).toBe(status);
        expect(res.headers['content-type']).toMatch(/^application\/json/);
        expect(res.headers['content-disposition']).toBeUndefined();
        expect(res.body).toMatchObject({ success: false, code });
    };

    test.each(RUTAS)('sin token → 401 JSON en %s', async (url) => {
        expectErrorJson(await request(app).get(url), 401, 'UNAUTHORIZED');
    });

    test.each(RUTAS.flatMap((url) => [['INMOBILIARIA', url], ['TECNICO', url]]))('%s → 403 JSON en %s', async (rol, url) => {
        const headers = rol === 'INMOBILIARIA' ? authHeader(rol, 7) : authHeader(rol);
        expectErrorJson(await request(app).get(url).set(headers), 403, 'FORBIDDEN');
    });

    test.each([
        ['/api/reportes/inventario.xlsx?estado=Disponible'],
        ['/api/reportes/inventario.xlsx?fraccion=abc'],
        ['/api/reportes/ventas.xlsx?desde=2026-11-01'],
        ['/api/reportes/ventas.xlsx?desde=2025-01-01&hasta=2026-01-02'],
        ['/api/reportes/cuotas-vencidas.xlsx'],
        ['/api/reportes/cuotas-vencidas.xlsx?moneda=EUR'],
    ])('parámetros inválidos → 400 VALIDATION_ERROR JSON en %s', async (url) => {
        const res = await request(app).get(url).set(ADMIN);
        expectErrorJson(res, 400, 'VALIDATION_ERROR');
        expect(res.body.errors.length).toBeGreaterThan(0);
    });

    test('GESTOR también descarga los 3 archivos', async () => {
        for (const url of RUTAS) {
            const res = await descargar(url, authHeader('GESTOR'));
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toBe(XLSX);
        }
    });
});
