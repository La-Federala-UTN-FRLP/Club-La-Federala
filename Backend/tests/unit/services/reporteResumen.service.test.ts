// Servicio del resumen para la reunión (CCLF-37, tarea 40.3) con dependencias inyectadas: porFraccion
// en Decimal, flujo entrada → IA → validación y la línea de log (tokens, latencia y resultado, nunca
// la entrada, la salida ni las cifras rechazadas).
import type { ResumenEntrada, ResumenGenerado } from '../../../src/services/aiSummary.service';
import { AiUnavailableError } from '../../../src/services/aiSummary.errors';
import {
    createReporteResumenService,
    saldoPorFraccion,
    type ResumenLog,
} from '../../../src/services/reporteResumen.service';

// Marcas para comprobar que ni la entrada ni la salida llegan al log.
const MARCA_ENTRADA = '987654.32';
const MARCA_SALIDA = 'MARCA-TEXTO-GENERADO';

const ENTRADA: ResumenEntrada = {
    corte: '2026-11-20',
    periodo: { desde: '2026-11-01', hasta: '2026-11-20' },
    inventario: { ofrecibles: 41, porEstado: { DISPONIBLE: 38, EN_PROMOCION: 3 } },
    ventas: {
        iniciadas: { cantidad: 3, montoUSD: MARCA_ENTRADA, cantidadAnterior: 5 },
        escrituradas: { cantidad: 2 },
        canceladas: { cantidad: 1 },
    },
    cuotasVencidas: { moneda: 'USD', saldo: '7200.00', cuotas: 10, porFraccion: { '2': '7200.00' } },
};

const FILTROS = { desde: '2026-11-01', hasta: '2026-11-20', moneda: 'USD' as const };

const SALIDA_OK = {
    texto: `${MARCA_SALIDA} Se iniciaron 3 ventas por USD ${MARCA_ENTRADA}.`,
    puntos: [{ tema: 'Comercial', detalle: 'Se iniciaron 3 ventas.', enlace: '/reportes' }],
    datosFaltantes: ['No hay ventas en ARS.'],
};

const generado = (resumen: Record<string, unknown>): ResumenGenerado => ({
    resumen,
    modelo: 'gemini-3.5-flash-lite',
    versionModelo: 'gemini-3.5-flash-lite-001',
    tokens: { entrada: 1800, salida: 420, razonamiento: 30, total: 2250 },
});

function setup(generar: jest.Mock, armarEntrada: jest.Mock = jest.fn().mockResolvedValue(ENTRADA)) {
    const logs: ResumenLog[] = [];
    // Reloj simulado: cada lectura avanza 100 ms.
    let t = 0;
    const reloj = () => (t += 100);
    const service = createReporteResumenService({ armarEntrada, generar, logger: (l) => logs.push(l), reloj });
    return { service, logs, armarEntrada };
}

function expectLogSinContenido(logs: ResumenLog[]) {
    const json = JSON.stringify(logs);
    expect(json).not.toContain(MARCA_ENTRADA);
    expect(json).not.toContain(MARCA_SALIDA);
    expect(json).not.toContain('Se iniciaron');
    expect(json).not.toContain('2026-11');
}

describe('saldoPorFraccion', () => {
    test('suma por número visible de fracción en Decimal, con 2 decimales y en orden', () => {
        const filas = [
            { fraccion: 3, saldoPendiente: '0.10' },
            { fraccion: 1, saldoPendiente: '600' },
            { fraccion: 3, saldoPendiente: '0.20' },
            { fraccion: 2, saldoPendiente: '4800.005' },
            { fraccion: 10, saldoPendiente: '1' },
        ];
        const r = saldoPorFraccion(filas);
        // En float 0.1 + 0.2 = 0.30000000000000004: en Decimal es exacto.
        expect(r).toEqual({ '1': '600.00', '2': '4800.01', '3': '0.30', '10': '1.00' });
        expect(Object.keys(r)).toEqual(['1', '2', '3', '10']);
    });

    test('sin cuotas vencidas → objeto vacío', () => {
        expect(saldoPorFraccion([])).toEqual({});
    });

    test('montos grandes no pierden precisión', () => {
        const r = saldoPorFraccion([
            { fraccion: 1, saldoPendiente: '9007199254740993.01' },
            { fraccion: 1, saldoPendiente: '0.02' },
        ]);
        expect(r).toEqual({ '1': '9007199254740993.03' });
    });
});

describe('resumirParaReunion', () => {
    test('ok: devuelve la salida validada, el modelo y el corte, y registra una línea INFO', async () => {
        const generar = jest.fn().mockResolvedValue(generado(SALIDA_OK));
        const { service, logs } = setup(generar);

        const data = await service.resumirParaReunion(FILTROS, { rol: 'GESTOR' });

        expect(generar).toHaveBeenCalledWith(ENTRADA);
        expect(data).toEqual({ ...SALIDA_OK, modelo: 'gemini-3.5-flash-lite', corte: '2026-11-20' });
        expect(logs).toEqual([
            {
                severity: 'INFO',
                message: '[AI_SUMMARY] resumen',
                resultado: 'ok',
                motivo: null,
                cifrasRechazadas: 0,
                rol: 'GESTOR',
                modelo: 'gemini-3.5-flash-lite',
                versionModelo: 'gemini-3.5-flash-lite-001',
                tokens: { entrada: 1800, salida: 420, razonamiento: 30, total: 2250 },
                latenciaMs: 300,
                latenciaIaMs: 100,
            },
        ]);
        expectLogSinContenido(logs);
    });

    test('cifra inventada → AiUnavailableError y log salida_invalida con la cantidad, no la cifra', async () => {
        const generar = jest.fn().mockResolvedValue(generado({ ...SALIDA_OK, texto: `${MARCA_SALIDA} Hay 123456.78 vencidos y 99 lotes.` }));
        const { service, logs } = setup(generar);

        await expect(service.resumirParaReunion(FILTROS, { rol: 'ADMINISTRADOR' })).rejects.toBeInstanceOf(AiUnavailableError);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
            severity: 'ERROR',
            resultado: 'salida_invalida',
            motivo: 'cifras',
            cifrasRechazadas: 2,
            rol: 'ADMINISTRADOR',
            modelo: 'gemini-3.5-flash-lite',
            tokens: { total: 2250 },
        });
        expect(JSON.stringify(logs)).not.toContain('123456');
        expectLogSinContenido(logs);
    });

    test('esquema inválido → AiUnavailableError y log salida_invalida/esquema', async () => {
        const generar = jest.fn().mockResolvedValue(generado({ texto: 'x', puntos: 'no-array' }));
        const { service, logs } = setup(generar);

        await expect(service.resumirParaReunion(FILTROS, { rol: 'GESTOR' })).rejects.toBeInstanceOf(AiUnavailableError);
        expect(logs[0]).toMatchObject({ resultado: 'salida_invalida', motivo: 'esquema', cifrasRechazadas: 0 });
    });

    test('IA no disponible → propaga AiUnavailableError y log ai_unavailable sin tokens', async () => {
        const error = new AiUnavailableError();
        const generar = jest.fn().mockRejectedValue(error);
        const { service, logs } = setup(generar);

        await expect(service.resumirParaReunion(FILTROS, { rol: 'GESTOR' })).rejects.toBe(error);
        expect(logs).toEqual([
            expect.objectContaining({
                severity: 'ERROR',
                resultado: 'ai_unavailable',
                motivo: null,
                modelo: null,
                tokens: null,
                latenciaIaMs: 100,
                latenciaMs: 300,
            }),
        ]);
    });

    test('otra falla de la IA también termina en AiUnavailableError', async () => {
        const generar = jest.fn().mockRejectedValue(new TypeError(`fetch failed ${MARCA_ENTRADA}`));
        const { service, logs } = setup(generar);

        await expect(service.resumirParaReunion(FILTROS, { rol: 'GESTOR' })).rejects.toBeInstanceOf(AiUnavailableError);
        expect(logs[0]).toMatchObject({ resultado: 'ai_unavailable', motivo: 'TypeError' });
        expectLogSinContenido(logs);
    });

    test('fallan los reportes → no llama a la IA, libera el cupo y propaga el error', async () => {
        const error = new Error('db caída');
        const generar = jest.fn();
        const { service, logs } = setup(generar, jest.fn().mockRejectedValue(error));
        const liberarCupo = jest.fn();

        await expect(service.resumirParaReunion(FILTROS, { rol: 'GESTOR', liberarCupo })).rejects.toBe(error);
        expect(generar).not.toHaveBeenCalled();
        expect(liberarCupo).toHaveBeenCalledTimes(1);
        expect(logs).toEqual([expect.objectContaining({ resultado: 'error_reportes', motivo: 'Error', latenciaIaMs: null })]);
        expect(JSON.stringify(logs)).not.toContain('db caída');
    });

    test('si llega a la IA no libera el cupo, aunque falle', async () => {
        const liberarCupo = jest.fn();
        const { service } = setup(jest.fn().mockRejectedValue(new AiUnavailableError()));
        await expect(service.resumirParaReunion(FILTROS, { rol: 'GESTOR', liberarCupo })).rejects.toBeInstanceOf(AiUnavailableError);
        expect(liberarCupo).not.toHaveBeenCalled();
    });
});
