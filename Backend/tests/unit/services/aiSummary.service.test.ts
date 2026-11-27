// Servicio aiSummary (CCLF-66, tarea 40.2): Gemini en Vertex AI con el cliente mockeado, sin red.
//
// Contrato: devuelve el objeto JSON que genera el modelo (sin validarlo contra ResumenSalida, eso es
// de la 40.3) más el modelo y los tokens. Cualquier falla termina en AiUnavailableError (502
// AI_UNAVAILABLE) con mensaje genérico; el log lleva el motivo técnico, nunca la entrada ni la salida.
jest.mock('@google/genai', () => {
    const actual = jest.requireActual('@google/genai');
    return { ...actual, GoogleGenAI: jest.fn().mockImplementation(() => ({ models: { generateContent: jest.fn() } })) };
});

import { ApiError, GoogleGenAI, Type } from '@google/genai';
import {
    AI_SUMMARY_MAX_OUTPUT_TOKENS,
    AI_SUMMARY_SYSTEM_INSTRUCTION,
    AI_SUMMARY_TEMPERATURE,
    AI_SUMMARY_TIMEOUT_MS,
    createAiSummaryService,
    createVertexClient,
    generarResumen,
    resetAiSummaryServiceForTests,
    type AiSummaryClient,
    type AiSummaryResponse,
    type ResumenEntrada,
} from '../../../src/services/aiSummary.service';
import { AI_UNAVAILABLE_MESSAGE, AiUnavailableError } from '../../../src/services/aiSummary.errors';

const CONFIG = { project: 'staging-proyecto-ficticio', location: 'global', model: 'gemini-3.5-flash-lite' };

// Marcadores para comprobar que ni la entrada ni la salida llegan al log.
const MARCA_ENTRADA = '987654.32';
const MARCA_SALIDA = 'MARCA-TEXTO-GENERADO';

const ENTRADA: ResumenEntrada = {
    corte: '2026-11-20',
    periodo: { desde: '2026-11-01', hasta: '2026-11-20' },
    inventario: { ofrecibles: 41, porEstado: { DISPONIBLE: 38, EN_PROMOCION: 3, RESERVADO: 7, VENDIDO: 112 } },
    ventas: {
        iniciadas: { cantidad: 3, montoUSD: MARCA_ENTRADA, cantidadAnterior: 5 },
        escrituradas: { cantidad: 2 },
        canceladas: { cantidad: 1 },
    },
    cuotasVencidas: { moneda: 'USD', saldo: '7200.00', cuotas: 10, porFraccion: { '2': '4800.00', '3': '1800.00', '1': '600.00' } },
};

const SALIDA = {
    texto: `${MARCA_SALIDA} Se iniciaron 3 ventas en el período.`,
    puntos: [{ tema: 'Comercial', detalle: 'Se iniciaron 3 ventas.', enlace: '/reportes' }],
    datosFaltantes: [],
};

function respuesta(text: string | undefined, extra: Partial<AiSummaryResponse> = {}): AiSummaryResponse {
    return {
        text,
        modelVersion: 'gemini-3.5-flash-lite-001',
        usageMetadata: { promptTokenCount: 1800, candidatesTokenCount: 420, thoughtsTokenCount: 30, totalTokenCount: 2250 },
        candidates: [{ finishReason: 'STOP' as never }],
        ...extra,
    };
}

function setup(generateContent: jest.Mock) {
    const client: AiSummaryClient = { models: { generateContent } };
    const logger = { error: jest.fn() };
    const service = createAiSummaryService({ client, config: CONFIG, logger });
    return { service, logger };
}

function expectLogSinDatos(logger: { error: jest.Mock }) {
    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).not.toContain(MARCA_ENTRADA);
    expect(logged).not.toContain(MARCA_SALIDA);
    expect(logged).not.toContain('Se iniciaron');
}

async function expectAiUnavailable(promise: Promise<unknown>) {
    const err = await promise.then(
        () => {
            throw new Error('se esperaba AiUnavailableError');
        },
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AiUnavailableError);
    expect(err).toMatchObject({ status: 502, code: 'AI_UNAVAILABLE', message: AI_UNAVAILABLE_MESSAGE });
}

describe('respuesta válida', () => {
    test('devuelve el JSON parseado, el modelo y los tokens', async () => {
        const generateContent = jest.fn().mockResolvedValue(respuesta(JSON.stringify(SALIDA)));
        const { service, logger } = setup(generateContent);

        const result = await service.generarResumen(ENTRADA);

        expect(result).toEqual({
            resumen: SALIDA,
            modelo: 'gemini-3.5-flash-lite',
            versionModelo: 'gemini-3.5-flash-lite-001',
            tokens: { entrada: 1800, salida: 420, razonamiento: 30, total: 2250 },
        });
        expect(logger.error).not.toHaveBeenCalled();
    });

    test('sin usageMetadata ni modelVersion: tokens y versión en null', async () => {
        const generateContent = jest
            .fn()
            .mockResolvedValue(respuesta(JSON.stringify(SALIDA), { usageMetadata: undefined, modelVersion: undefined }));
        const { service } = setup(generateContent);

        const result = await service.generarResumen(ENTRADA);

        expect(result.versionModelo).toBeNull();
        expect(result.tokens).toEqual({ entrada: null, salida: null, razonamiento: null, total: null });
    });

    test('no valida el contenido: un objeto con otra forma se devuelve tal cual (lo valida la 40.3)', async () => {
        const generateContent = jest.fn().mockResolvedValue(respuesta('{"otro":1}'));
        const { service } = setup(generateContent);

        await expect(service.generarResumen(ENTRADA)).resolves.toMatchObject({ resumen: { otro: 1 } });
    });
});

describe('lo que se envía a Vertex AI', () => {
    test('modelo, entrada, instrucción de sistema, temperatura, tokens, JSON y responseSchema', async () => {
        const generateContent = jest.fn().mockResolvedValue(respuesta(JSON.stringify(SALIDA)));
        const { service } = setup(generateContent);

        await service.generarResumen(ENTRADA);

        expect(generateContent).toHaveBeenCalledTimes(1);
        const params = generateContent.mock.calls[0][0];
        expect(params.model).toBe('gemini-3.5-flash-lite');
        expect(JSON.parse(params.contents)).toEqual(ENTRADA);
        expect(params.config).toMatchObject({
            systemInstruction: AI_SUMMARY_SYSTEM_INSTRUCTION,
            temperature: 0.2,
            maxOutputTokens: 600,
            responseMimeType: 'application/json',
        });
        expect(AI_SUMMARY_TEMPERATURE).toBe(0.2);
        expect(AI_SUMMARY_MAX_OUTPUT_TOKENS).toBe(600);
        expect(params.config.abortSignal).toBeInstanceOf(AbortSignal);
    });

    test('responseSchema equivale a la salida V4, con tema como enum', async () => {
        const generateContent = jest.fn().mockResolvedValue(respuesta(JSON.stringify(SALIDA)));
        const { service } = setup(generateContent);

        await service.generarResumen(ENTRADA);

        const schema = generateContent.mock.calls[0][0].config.responseSchema;
        expect(schema).toMatchObject({
            type: Type.OBJECT,
            required: ['texto', 'puntos', 'datosFaltantes'],
            properties: {
                texto: { type: Type.STRING },
                datosFaltantes: { type: Type.ARRAY, items: { type: Type.STRING } },
                puntos: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        required: ['tema', 'detalle', 'enlace'],
                        properties: {
                            tema: { type: Type.STRING, enum: ['Comercial', 'Cobranzas', 'Inventario'] },
                            detalle: { type: Type.STRING },
                            enlace: { type: Type.STRING },
                        },
                    },
                },
            },
        });
    });

    test('la instrucción de sistema fija las reglas de la especificación', () => {
        const texto = AI_SUMMARY_SYSTEM_INSTRUCTION;
        expect(texto).toMatch(/solo cifras que aparezcan en la entrada/);
        expect(texto).toMatch(/No infieras causas/);
        expect(texto).toMatch(/datosFaltantes qué dato falta/);
        expect(texto).toMatch(/español rioplatense/);
        expect(texto).toMatch(/entre 4 y 6 oraciones/);
        expect(texto).toMatch(/No des consejos ni opiniones sobre personas/);
    });
});

describe('timeout', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test(`a los ${AI_SUMMARY_TIMEOUT_MS} ms cancela la request y lanza AI_UNAVAILABLE`, async () => {
        const generateContent = jest.fn().mockReturnValue(new Promise(() => undefined));
        const { service, logger } = setup(generateContent);

        const pending = service.generarResumen(ENTRADA);
        const signal: AbortSignal = generateContent.mock.calls[0][0].config.abortSignal;

        jest.advanceTimersByTime(AI_SUMMARY_TIMEOUT_MS - 1);
        expect(signal.aborted).toBe(false);
        jest.advanceTimersByTime(1);

        await expectAiUnavailable(pending);
        expect(signal.aborted).toBe(true);
        expect(AI_SUMMARY_TIMEOUT_MS).toBe(15_000);
        expect(logger.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ motivo: 'timeout' }));
        expectLogSinDatos(logger);
    });

    test('si responde a tiempo no deja el timer pendiente', async () => {
        const generateContent = jest.fn().mockResolvedValue(respuesta(JSON.stringify(SALIDA)));
        const { service } = setup(generateContent);

        await service.generarResumen(ENTRADA);

        expect(jest.getTimerCount()).toBe(0);
    });
});

describe('errores del SDK', () => {
    test.each([
        ['permisos', new ApiError({ message: 'Permission denied on resource project', status: 403 }), 'permisos'],
        ['credenciales', new ApiError({ message: 'Request had invalid authentication credentials', status: 401 }), 'permisos'],
        ['cuota', new ApiError({ message: 'Resource exhausted', status: 429 }), 'cuota'],
        ['modelo no encontrado', new ApiError({ message: 'Publisher model not found', status: 404 }), 'api'],
        ['red', new TypeError('fetch failed'), 'red'],
    ])('%s → AI_UNAVAILABLE con el motivo en el log', async (_caso, error, motivo) => {
        const generateContent = jest.fn().mockRejectedValue(error);
        const { service, logger } = setup(generateContent);

        await expectAiUnavailable(service.generarResumen(ENTRADA));

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error.mock.calls[0][1]).toMatchObject({ motivo, modelo: CONFIG.model });
        expectLogSinDatos(logger);
    });

    test('el error del SDK va al log en forma segura, no el objeto original', async () => {
        const error = new ApiError({ message: 'Permission denied', status: 403 });
        const generateContent = jest.fn().mockRejectedValue(error);
        const { service, logger } = setup(generateContent);

        await expectAiUnavailable(service.generarResumen(ENTRADA));

        const detail = logger.error.mock.calls[0][1];
        expect(detail).toMatchObject({ status: 403, error: { name: 'ApiError', message: 'Permission denied' } });
        expect(detail.error).not.toBe(error);
    });
});

describe('respuesta inválida', () => {
    test.each([
        ['texto undefined', undefined, 'respuesta_vacia'],
        ['texto vacío', '', 'respuesta_vacia'],
        ['solo espacios', '   \n ', 'respuesta_vacia'],
        ['JSON roto', `{"texto": "${MARCA_SALIDA}`, 'json_invalido'],
        ['JSON array', `["${MARCA_SALIDA}"]`, 'json_no_objeto'],
        ['JSON string', `"${MARCA_SALIDA}"`, 'json_no_objeto'],
        ['JSON null', 'null', 'json_no_objeto'],
    ])('%s → AI_UNAVAILABLE', async (_caso, text, motivo) => {
        const generateContent = jest.fn().mockResolvedValue(respuesta(text, { candidates: [{ finishReason: 'MAX_TOKENS' as never }] }));
        const { service, logger } = setup(generateContent);

        await expectAiUnavailable(service.generarResumen(ENTRADA));

        expect(logger.error.mock.calls[0][1]).toMatchObject({ motivo, finishReason: 'MAX_TOKENS' });
        expectLogSinDatos(logger);
    });
});

describe('instancia por defecto (entorno + ADC)', () => {
    const ENV_KEYS = ['VERTEX_PROJECT', 'VERTEX_LOCATION', 'AI_SUMMARY_MODEL'] as const;
    const saved: Record<string, string | undefined> = {};
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
        for (const k of ENV_KEYS) {
            saved[k] = process.env[k];
            delete process.env[k];
        }
        resetAiSummaryServiceForTests();
        (GoogleGenAI as unknown as jest.Mock).mockClear();
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
        resetAiSummaryServiceForTests();
        consoleError.mockRestore();
    });

    test('sin VERTEX_PROJECT: AI_UNAVAILABLE, no crea el cliente y el log nombra la variable', async () => {
        await expectAiUnavailable(generarResumen(ENTRADA));

        expect(GoogleGenAI).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ motivo: 'config', issues: ['VERTEX_PROJECT: VERTEX_PROJECT is required'] }),
        );
    });

    test('crea el cliente de Vertex AI con ADC (sin API key), location global y el modelo por defecto', async () => {
        process.env.VERTEX_PROJECT = CONFIG.project;
        const generateContent = jest.fn().mockResolvedValue(respuesta(JSON.stringify(SALIDA)));
        (GoogleGenAI as unknown as jest.Mock).mockImplementationOnce(() => ({ models: { generateContent } }));

        const result = await generarResumen(ENTRADA);

        expect(GoogleGenAI).toHaveBeenCalledTimes(1);
        expect(GoogleGenAI).toHaveBeenCalledWith({ vertexai: true, project: CONFIG.project, location: 'global' });
        expect(generateContent.mock.calls[0][0].model).toBe('gemini-3.5-flash-lite');
        expect(result.modelo).toBe('gemini-3.5-flash-lite');

        await generarResumen(ENTRADA);
        expect(GoogleGenAI).toHaveBeenCalledTimes(1); // el cliente se reutiliza
    });

    test('createVertexClient respeta VERTEX_LOCATION y no pasa apiKey', () => {
        createVertexClient({ ...CONFIG, location: 'us-central1' });

        const opts = (GoogleGenAI as unknown as jest.Mock).mock.calls[0][0];
        expect(opts).toEqual({ vertexai: true, project: CONFIG.project, location: 'us-central1' });
        expect(opts).not.toHaveProperty('apiKey');
    });
});
