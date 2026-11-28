// POST /api/reportes/resumen (CCLF-37, tarea 40.3): ruta → controller → 3 services reales sobre los
// fakes de Prisma → aiSummary con el cliente de @google/genai mockeado (sin red) → validación.
// Casos REP-A6 (resumen sobre el set ficticio) y REP-A7 (Vertex AI caído o con timeout), permisos,
// validación del body y límite de 20 por usuario por día. Corte fijo: 24/11/2026.
const mockGenerateContent = jest.fn();
jest.mock('@google/genai', () => {
    const actual = jest.requireActual('@google/genai');
    return { ...actual, GoogleGenAI: jest.fn().mockImplementation(() => ({ models: { generateContent: mockGenerateContent } })) };
});

jest.mock('../../../src/config/prisma', () => {
    const inventario = require('../../support/fakes/loteInventario.fake').crearPrismaInventarioFake();
    const ventas = require('../../support/fakes/ventaReporte.fake').crearPrismaVentasFake();
    const cuotas = require('../../support/fakes/cuotaVencida.fake').crearPrismaCuotasFake();
    return {
        __esModule: true,
        default: { lote: inventario.lote, venta: ventas.venta, cuotaPlanPago: cuotas.cuotaPlanPago, fakes: { inventario, ventas, cuotas } },
    };
});

import request from 'supertest';
import { ApiError, type GenerateContentParameters } from '@google/genai';
import app from '../../../src/app';
import prisma from '../../../src/config/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';
import { DATOS_INVENTARIO, type PrismaInventarioFake } from '../../support/fakes/loteInventario.fake';
import { DATOS_VENTAS, PERIODO_NOVIEMBRE, type PrismaVentasFake } from '../../support/fakes/ventaReporte.fake';
import { AHORA_CORTE, DATOS_CUOTAS, fijarAhora, type PrismaCuotasFake } from '../../support/fakes/cuotaVencida.fake';
import { AI_SUMMARY_TIMEOUT_MS, resetAiSummaryServiceForTests, type ResumenEntrada } from '../../../src/services/aiSummary.service';
import { AI_UNAVAILABLE_MESSAGE } from '../../../src/services/aiSummary.errors';
import { cifrasDeEntrada, contarCifrasAjenas } from '../../../src/services/reporteResumen.salida';
import * as reporteService from '../../../src/services/reporte.service';
import { RESUMEN_LIMITE_DIARIO, resumenDailyLimit } from '../../../src/middlewares/resumenDailyLimit.middleware';

const { fakes } = prisma as unknown as {
    fakes: { inventario: PrismaInventarioFake; ventas: PrismaVentasFake; cuotas: PrismaCuotasFake };
};

useTestWebEnv();

const URL = '/api/reportes/resumen';
const BODY = { ...PERIODO_NOVIEMBRE, moneda: 'USD' };
const MODELO = 'gemini-3.5-flash-lite';

// Patrones de datos personales (V4: sin nombres, DNI, CUIT, emails ni teléfonos).
const EMAIL = /[^\s@"]+@[^\s@"]+\.[^\s@"]+/;
const CUIT = /\b\d{2}-?\d{8}-?\d\b/;
const DNI = /\b\d{1,2}\.?\d{3}\.?\d{3}\b/;
const TELEFONO = /\b(?:\+?54\s?)?(?:11|[2-9]\d{2,3})[\s-]?\d{3,4}[\s-]?\d{4}\b/;
/** JSON sin las fechas ISO, que no son datos personales y confundirían los patrones numéricos. */
const sinFechas = (json: string) => json.replace(/\d{4}-\d{2}-\d{2}/g, '');

/** Respuesta del SDK con el JSON dado como texto. */
function respuestaSdk(salida: unknown) {
    return {
        text: JSON.stringify(salida),
        modelVersion: `${MODELO}-001`,
        usageMetadata: { promptTokenCount: 1800, candidatesTokenCount: 420, thoughtsTokenCount: 30, totalTokenCount: 2250 },
        candidates: [{ finishReason: 'STOP' }],
    };
}

/** Entrada que recibió el modelo en la llamada `i`. */
const entradaEnviada = (i = 0): ResumenEntrada =>
    JSON.parse((mockGenerateContent.mock.calls[i][0] as GenerateContentParameters).contents as string);

/** Fake del modelo: lee la entrada que recibe y arma un resumen solo con sus cifras. */
function resumenDesde(e: ResumenEntrada) {
    const [fraccion, saldoFraccion] = Object.entries(e.cuotasVencidas.porFraccion).at(-1)!;
    return {
        texto:
            `Al ${e.corte} hay ${e.inventario.ofrecibles} lotes ofrecibles. ` +
            `Del ${e.periodo.desde} al ${e.periodo.hasta} se iniciaron ${e.ventas.iniciadas.cantidad} ventas por USD ${e.ventas.iniciadas.montoUSD}, ` +
            `frente a ${e.ventas.iniciadas.cantidadAnterior} en el período anterior. ` +
            `Se escrituraron ${e.ventas.escrituradas.cantidad} y se cancelaron ${e.ventas.canceladas.cantidad}. ` +
            `Hay ${e.cuotasVencidas.cuotas} cuotas vencidas en ${e.cuotasVencidas.moneda} por ${e.cuotasVencidas.saldo}.`,
        puntos: [
            { tema: 'Comercial', detalle: `Se iniciaron ${e.ventas.iniciadas.cantidad} ventas.`, enlace: '/reportes' },
            { tema: 'Cobranzas', detalle: `La fracción ${fraccion} tiene ${saldoFraccion} vencidos.`, enlace: `/reportes?moneda=${e.cuotasVencidas.moneda}` },
            { tema: 'Inventario', detalle: `Quedan ${e.inventario.ofrecibles} lotes ofrecibles.`, enlace: '/reportes' },
        ],
        datosFaltantes: ['La entrada no trae las ventas en otras monedas.'],
    };
}

/** Modelo que responde un resumen armado con la entrada recibida, más los cambios de `editar`. */
function modeloQueResume(editar: (s: ReturnType<typeof resumenDesde>) => unknown = (s) => s) {
    mockGenerateContent.mockImplementation(async (params: GenerateContentParameters) =>
        respuestaSdk(editar(resumenDesde(JSON.parse(params.contents as string)))),
    );
}

/** Líneas del log de resumen ([AI_SUMMARY] resumen) emitidas en consola. */
function lineasResumen(...spies: jest.SpyInstance[]) {
    return spies
        .flatMap((s) => s.mock.calls.map((c) => c[0]))
        .filter((l): l is string => typeof l === 'string' && l.includes('[AI_SUMMARY] resumen'))
        .map((l) => JSON.parse(l));
}

let logSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeAll(() => {
    process.env.VERTEX_PROJECT = 'staging-proyecto-ficticio';
    process.env.AI_SUMMARY_MODEL = MODELO;
});

afterAll(() => {
    delete process.env.VERTEX_PROJECT;
    delete process.env.AI_SUMMARY_MODEL;
});

beforeEach(() => {
    fakes.inventario.cargar(DATOS_INVENTARIO);
    fakes.ventas.cargar(DATOS_VENTAS);
    fakes.cuotas.cargar(DATOS_CUOTAS);
    fijarAhora(AHORA_CORTE);
    mockGenerateContent.mockReset();
    resetAiSummaryServiceForTests();
    resumenDailyLimit.reset();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('REP-A6 — resumen con IA sobre el set ficticio', () => {
    test.each(['ADMINISTRADOR', 'GESTOR'])('%s: 200 con cifras de la entrada, dato faltante y sin datos personales', async (rol) => {
        modeloQueResume();
        const res = await request(app).post(URL).set(authHeader(rol)).send(BODY);

        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual(['data', 'success']);
        expect(res.body.success).toBe(true);
        const { data } = res.body;
        expect(Object.keys(data).sort()).toEqual(['corte', 'datosFaltantes', 'modelo', 'puntos', 'texto']);
        expect(data.corte).toBe('2026-11-24');
        expect(data.modelo).toBe(MODELO);

        // Cada cifra del texto, de los detalles y de los datos faltantes está en la entrada.
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
        const entrada = entradaEnviada();
        const permitidas = cifrasDeEntrada(entrada);
        for (const t of [data.texto, ...data.puntos.map((p: { detalle: string }) => p.detalle), ...data.datosFaltantes]) {
            expect({ t, ajenas: contarCifrasAjenas(t, permitidas) }).toEqual({ t, ajenas: 0 });
        }
        expect(data.datosFaltantes.length).toBeGreaterThanOrEqual(1);

        // Ni la entrada ni la respuesta traen datos personales ni identificadores de filas.
        for (const json of [JSON.stringify(entrada), JSON.stringify(res.body)]) {
            for (const patron of [EMAIL, CUIT, DNI, TELEFONO]) expect(sinFechas(json)).not.toMatch(patron);
            expect(json).not.toContain('CCLF-2026-');
            expect(json).not.toMatch(/"(filas|ventaId|loteId|cuotaId|numero|nombre|email|dni|cuit|telefono)"/i);
        }
    });

    test('la entrada son solo los agregados de los 3 reportes, con los mismos filtros', async () => {
        modeloQueResume();
        const res = await request(app).post(URL).set(authHeader('ADMINISTRADOR')).send(BODY);
        expect(res.status).toBe(200);

        const admin = authHeader('ADMINISTRADOR');
        const [inv, ven, cuo] = await Promise.all([
            request(app).get('/api/reportes/inventario').set(admin),
            request(app).get(`/api/reportes/ventas?desde=${BODY.desde}&hasta=${BODY.hasta}`).set(admin),
            request(app).get('/api/reportes/cuotas-vencidas?moneda=USD').set(admin),
        ]);
        const i = inv.body.data;
        const v = ven.body.data;
        const c = cuo.body.data;

        expect(entradaEnviada()).toEqual({
            corte: '2026-11-24',
            periodo: PERIODO_NOVIEMBRE,
            inventario: {
                ofrecibles: i.totales.ofrecibles,
                porEstado: Object.fromEntries(i.totales.porEstado.map((e: { estado: string; cantidad: number }) => [e.estado, e.cantidad])),
            },
            ventas: {
                iniciadas: {
                    cantidad: v.tarjetas.iniciadas.cantidad,
                    montoUSD: v.tarjetas.iniciadas.montoUSD,
                    cantidadAnterior: v.tarjetas.iniciadas.cantidadAnterior,
                },
                escrituradas: { cantidad: v.tarjetas.escrituradas.cantidad },
                canceladas: { cantidad: v.tarjetas.canceladas.cantidad },
            },
            // Conteo manual del set (cuotaVencida.fake.ts): USD 4051.09, fracción 2 → 902–906 y fracción 1 → 909.
            cuotasVencidas: { moneda: 'USD', saldo: c.saldoVencido, cuotas: c.cuotas, porFraccion: { '1': '300.33', '2': '3750.76' } },
        });
        expect(c.saldoVencido).toBe('4051.09');
    });

    test('fraccion filtra los 3 reportes (id 20 = fracción número 1)', async () => {
        modeloQueResume();
        const res = await request(app).post(URL).set(authHeader('ADMINISTRADOR')).send({ ...BODY, fraccion: 20 });
        expect(res.status).toBe(200);
        expect(entradaEnviada().cuotasVencidas).toEqual({ moneda: 'USD', saldo: '300.33', cuotas: 1, porFraccion: { '1': '300.33' } });
    });

    test('log: una línea INFO con tokens, latencias y resultado, sin entrada ni salida', async () => {
        modeloQueResume();
        const res = await request(app).post(URL).set(authHeader('GESTOR')).send(BODY);
        expect(res.status).toBe(200);

        const lineas = lineasResumen(logSpy, errorSpy);
        expect(lineas).toHaveLength(1);
        expect(lineas[0]).toEqual({
            severity: 'INFO',
            message: '[AI_SUMMARY] resumen',
            resultado: 'ok',
            motivo: null,
            cifrasRechazadas: 0,
            rol: 'GESTOR',
            modelo: MODELO,
            versionModelo: `${MODELO}-001`,
            tokens: { entrada: 1800, salida: 420, razonamiento: 30, total: 2250 },
            latenciaMs: expect.any(Number),
            latenciaIaMs: expect.any(Number),
        });
        const todo = JSON.stringify([logSpy.mock.calls, errorSpy.mock.calls, warnSpy.mock.calls]);
        expect(todo).not.toContain('4051.09');
        expect(todo).not.toContain('lotes ofrecibles');
    });

    test.each([
        ['cifra inventada', (s: ReturnType<typeof resumenDesde>) => ({ ...s, texto: `${s.texto} El saldo subió 1234.56.` })],
        ['porcentaje', (s: ReturnType<typeof resumenDesde>) => ({ ...s, texto: `${s.texto} Es un 12% más.` })],
        ['email', (s: ReturnType<typeof resumenDesde>) => ({ ...s, datosFaltantes: ['Consultar a alguien@example.com'] })],
        ['enlace externo', (s: ReturnType<typeof resumenDesde>) => ({ ...s, puntos: [{ ...s.puntos[0], enlace: 'https://example.com' }] })],
        ['esquema inválido', (s: ReturnType<typeof resumenDesde>) => ({ texto: s.texto, puntos: [{ tema: 'Otro', detalle: 'x', enlace: '/reportes' }] })],
    ])('negativo: %s → 502 AI_UNAVAILABLE y log salida_invalida sin contenido', async (_caso, editar) => {
        modeloQueResume(editar);
        const res = await request(app).post(URL).set(authHeader('ADMINISTRADOR')).send(BODY);

        expect(res.status).toBe(502);
        expect(res.body).toEqual({ success: false, code: 'AI_UNAVAILABLE', message: AI_UNAVAILABLE_MESSAGE });
        const lineas = lineasResumen(logSpy, errorSpy);
        expect(lineas).toEqual([expect.objectContaining({ severity: 'ERROR', resultado: 'salida_invalida' })]);
        const todo = JSON.stringify(errorSpy.mock.calls);
        for (const dato of ['1234.56', 'example.com', 'lotes ofrecibles']) expect(todo).not.toContain(dato);
    });
});

describe('REP-A7 — Vertex AI caído o con timeout', () => {
    async function expectReportesSiguenAndando() {
        const inv = await request(app).get('/api/reportes/inventario').set(authHeader('ADMINISTRADOR'));
        expect(inv.status).toBe(200);
        expect(inv.body.success).toBe(true);
    }

    function expectLogDeErrorSinContenido() {
        const lineas = lineasResumen(logSpy, errorSpy);
        expect(lineas).toEqual([
            expect.objectContaining({ severity: 'ERROR', resultado: 'ai_unavailable', tokens: null, latenciaIaMs: expect.any(Number) }),
        ]);
        const todo = JSON.stringify(errorSpy.mock.calls);
        expect(todo).not.toContain('4051.09');
        expect(todo).not.toContain('3750.76');
        expect(todo).not.toContain('"contents"');
    }

    test.each([
        ['ApiError 503', () => new ApiError({ message: 'Service Unavailable', status: 503 })],
        ['error de red', () => new TypeError('fetch failed')],
    ])('%s → 502 con mensaje público, los reportes siguen y queda el log de error', async (_caso, crearError) => {
        mockGenerateContent.mockRejectedValue(crearError());
        const res = await request(app).post(URL).set(authHeader('GESTOR')).send(BODY);

        expect(res.status).toBe(502);
        expect(res.body).toEqual({ success: false, code: 'AI_UNAVAILABLE', message: AI_UNAVAILABLE_MESSAGE });
        expect(JSON.stringify(res.body)).not.toMatch(/Service Unavailable|fetch failed/);
        expectLogDeErrorSinContenido();
        await expectReportesSiguenAndando();
    });

    test('timeout de 15 s → 502', async () => {
        // Solo setTimeout/clearTimeout simulados: supertest y las promesas siguen con el reloj real.
        jest.useFakeTimers({
            now: new Date(AHORA_CORTE),
            doNotFake: [
                'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
                'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
            ],
        });
        mockGenerateContent.mockImplementation(() => new Promise(() => {}));

        const pendiente = request(app).post(URL).set(authHeader('GESTOR')).send(BODY).then((r) => r);
        // Esperar a que el pedido llegue al modelo antes de adelantar el reloj.
        // Espera en tiempo real (performance y setImmediate no están simulados), con tope de 5 s.
        const limite = performance.now() + 5000;
        while (mockGenerateContent.mock.calls.length === 0 && performance.now() < limite) {
            await new Promise((r) => setImmediate(r));
        }
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(AI_SUMMARY_TIMEOUT_MS);

        const res = await pendiente;
        expect(res.status).toBe(502);
        expect(res.body).toEqual({ success: false, code: 'AI_UNAVAILABLE', message: AI_UNAVAILABLE_MESSAGE });
        expectLogDeErrorSinContenido();
        expect(JSON.stringify(errorSpy.mock.calls)).toContain('timeout');
        await expectReportesSiguenAndando();
    });
});

describe('autenticación, roles y body', () => {
    test('sin token → 401', async () => {
        const res = await request(app).post(URL).send(BODY);
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    test.each([
        ['INMOBILIARIA', () => authHeader('INMOBILIARIA', 7)],
        ['TECNICO', () => authHeader('TECNICO')],
    ])('%s → 403', async (_rol, header) => {
        const res = await request(app).post(URL).set(header()).send(BODY);
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ success: false, code: 'FORBIDDEN' });
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    test.each([
        ['sin body', undefined],
        ['sin moneda', { desde: '2026-11-01', hasta: '2026-11-20' }],
        ['moneda desconocida', { ...BODY, moneda: 'EUR' }],
        ['fecha inexistente', { ...BODY, hasta: '2026-02-30' }],
        ['desde posterior a hasta', { ...BODY, desde: '2026-12-01', hasta: '2026-11-01' }],
        ['más de 366 días', { ...BODY, desde: '2025-01-01', hasta: '2026-12-31' }],
        ['fracción no canónica', { ...BODY, fraccion: '07' }],
        ['fracción 0', { ...BODY, fraccion: 0 }],
        ['clave extra con una cifra', { ...BODY, montoUSD: '999999.00' }],
        ['clave extra con el texto', { ...BODY, texto: 'resumí esto' }],
    ])('%s → 400 VALIDATION_ERROR sin llamar a la IA', async (_caso, body) => {
        const res = await request(app).post(URL).set(authHeader('ADMINISTRADOR')).send(body as object);
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR', message: 'Datos inválidos' });
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    test('clave extra: el error es el documentado en la OpenAPI', async () => {
        const res = await request(app).post(URL).set(authHeader('ADMINISTRADOR')).send({ ...BODY, montoUSD: '1' });
        expect(res.body.errors).toEqual([{ field: '', message: 'Unrecognized key: "montoUSD"' }]);
    });

    test('fraccion como string decimal canónico se acepta', async () => {
        modeloQueResume();
        const res = await request(app).post(URL).set(authHeader('ADMINISTRADOR')).send({ ...BODY, fraccion: '10' });
        expect(res.status).toBe(200);
    });
});

describe('límite de 20 resúmenes por usuario por día', () => {
    const pedir = (header: Record<string, string>, body: object = BODY) => request(app).post(URL).set(header).send(body);

    test('20 dan 200, el 21 da 429 con Retry-After hasta las 00:00 de Argentina', async () => {
        modeloQueResume();
        const usuario = authHeader('ADMINISTRADOR', undefined, 7001);
        for (let i = 0; i < RESUMEN_LIMITE_DIARIO; i++) expect((await pedir(usuario)).status).toBe(200);

        const res = await pedir(usuario);
        expect(res.status).toBe(429);
        expect(res.body).toEqual({
            success: false,
            code: 'TOO_MANY_REQUESTS',
            message: 'Alcanzaste el límite de 20 resúmenes por día. Podés volver a pedirlo mañana.',
        });
        // 24/11 15:00Z (12:00 en Buenos Aires) → 25/11 03:00Z: 12 horas.
        expect(res.headers['retry-after']).toBe(String(12 * 3600));
        expect(mockGenerateContent).toHaveBeenCalledTimes(RESUMEN_LIMITE_DIARIO);
        // El aviso del límite no identifica al usuario.
        expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('7001');
    });

    test('otro usuario no se ve afectado', async () => {
        modeloQueResume();
        const uno = authHeader('GESTOR', undefined, 7002);
        const otro = authHeader('GESTOR', undefined, 7003);
        for (let i = 0; i < RESUMEN_LIMITE_DIARIO; i++) await pedir(uno);
        expect((await pedir(uno)).status).toBe(429);
        expect((await pedir(otro)).status).toBe(200);
    });

    test('al cambiar el día de Buenos Aires se reinicia', async () => {
        modeloQueResume();
        // Mismo usuario (sub 7004); el token se vuelve a firmar con cada reloj porque vence en 1 h.
        const usuario = () => authHeader('ADMINISTRADOR', undefined, 7004);
        for (let i = 0; i < RESUMEN_LIMITE_DIARIO; i++) await pedir(usuario());
        // 25/11 02:59:59Z sigue siendo 24/11 en Buenos Aires.
        fijarAhora('2026-11-25T02:59:59.000Z');
        const antes = await pedir(usuario());
        expect(antes.status).toBe(429);
        expect(antes.headers['retry-after']).toBe('1');
        // 00:00 del 25/11 en Buenos Aires.
        fijarAhora('2026-11-25T03:00:00.000Z');
        expect((await pedir(usuario())).status).toBe(200);
    });

    test('un 400 no consume cupo; un 502 sí', async () => {
        const usuario = authHeader('ADMINISTRADOR', undefined, 7005);
        for (let i = 0; i < 5; i++) expect((await pedir(usuario, { ...BODY, extra: 1 })).status).toBe(400);

        // El primer pedido válido falla en la IA (502) y los demás responden bien.
        modeloQueResume();
        mockGenerateContent.mockRejectedValueOnce(new ApiError({ message: 'Service Unavailable', status: 503 }));
        expect((await pedir(usuario)).status).toBe(502);
        for (let i = 1; i < RESUMEN_LIMITE_DIARIO; i++) expect((await pedir(usuario)).status).toBe(200);
        expect((await pedir(usuario)).status).toBe(429);
    });

    test('si fallan los reportes antes de la IA (500) no consume cupo', async () => {
        modeloQueResume();
        const usuario = authHeader('ADMINISTRADOR', undefined, 7006);
        jest.spyOn(reporteService, 'getReporteVentas').mockRejectedValueOnce(new Error('db caída'));
        const fallo = await pedir(usuario);
        expect(fallo.status).toBe(500);
        expect(fallo.body).toMatchObject({ code: 'INTERNAL_ERROR' });
        expect(mockGenerateContent).not.toHaveBeenCalled();
        expect(lineasResumen(logSpy, errorSpy)).toEqual([expect.objectContaining({ resultado: 'error_reportes' })]);

        for (let i = 0; i < RESUMEN_LIMITE_DIARIO; i++) expect((await pedir(usuario)).status).toBe(200);
        expect((await pedir(usuario)).status).toBe(429);
    });
});
