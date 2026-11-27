import { ApiError, GoogleGenAI, Type, type GenerateContentParameters, type GenerateContentResponse, type Schema } from '@google/genai';
import { AiSummaryConfigError, parseAiSummaryConfig, type AiSummaryConfig } from '../config/aiSummary.config';
import { safeErrorForLog } from '../utils/safeErrorLog';
import { AiUnavailableError } from './aiSummary.errors';

/**
 * Resumen con IA de Reportes (CCLF-37, tarea 40.2): llama a Gemini en Vertex AI con los agregados de
 * los 3 reportes y devuelve el JSON que genera el modelo, más el modelo y los tokens usados.
 *
 * Alcance: este servicio solo garantiza que la salida sea un objeto JSON. La validación contra
 * ResumenSalida y el control de que cada número del texto esté en la entrada son de la 40.3, igual
 * que el endpoint, el armado de la entrada, el límite diario y el logging de tokens y latencia.
 *
 * Cualquier falla (configuración, timeout, red, permisos, cuota, respuesta vacía o JSON inválido)
 * termina en AiUnavailableError (502 AI_UNAVAILABLE). El log lleva el motivo y el detalle técnico,
 * nunca la entrada ni el texto generado.
 */

// ------------------------------------------------------------------ Parámetros (especificación V4)
export const AI_SUMMARY_TEMPERATURE = 0.2;
export const AI_SUMMARY_MAX_OUTPUT_TOKENS = 600;
export const AI_SUMMARY_TIMEOUT_MS = 15_000;
export const AI_SUMMARY_RESPONSE_MIME_TYPE = 'application/json';

// ------------------------------------------------------------------ Tipos de entrada y salida (V4)
/** Fecha calendario YYYY-MM-DD. */
export type FechaISO = string;
/** Monto como string decimal con 2 cifras ("255000.00"), como viaja en los reportes. */
export type MontoDecimal = string;

export interface ResumenEntrada {
    corte: FechaISO;
    periodo: { desde: FechaISO; hasta: FechaISO };
    inventario: {
        ofrecibles: number;
        /** Cantidad de lotes por EstadoLote (DISPONIBLE, EN_PROMOCION, RESERVADO, VENDIDO...). */
        porEstado: Record<string, number>;
    };
    ventas: {
        iniciadas: { cantidad: number; montoUSD: MontoDecimal; cantidadAnterior: number };
        escrituradas: { cantidad: number };
        canceladas: { cantidad: number };
    };
    cuotasVencidas: {
        moneda: 'ARS' | 'USD';
        saldo: MontoDecimal;
        cuotas: number;
        /** Saldo vencido por número de fracción ("2": "4800.00"). */
        porFraccion: Record<string, MontoDecimal>;
    };
}

export const TEMAS_RESUMEN = ['Comercial', 'Cobranzas', 'Inventario'] as const;
export type TemaResumen = (typeof TEMAS_RESUMEN)[number];

/** Forma esperada de la salida. El servicio NO la valida (40.3): devuelve el objeto JSON tal cual. */
export interface ResumenSalida {
    texto: string;
    puntos: Array<{ tema: TemaResumen; detalle: string; enlace: string }>;
    datosFaltantes: string[];
}

export interface ResumenTokens {
    entrada: number | null;
    salida: number | null;
    /** Tokens de razonamiento del modelo, si los informa. Cuentan dentro de maxOutputTokens. */
    razonamiento: number | null;
    total: number | null;
}

export interface ResumenGenerado {
    /** Objeto JSON parseado, sin validar contra ResumenSalida. */
    resumen: Record<string, unknown>;
    /** Modelo configurado (AI_SUMMARY_MODEL). */
    modelo: string;
    /** Versión exacta que informó Vertex AI, si vino en la respuesta. */
    versionModelo: string | null;
    tokens: ResumenTokens;
}

// ------------------------------------------------------------------ Prompt y schema de salida
export const AI_SUMMARY_SYSTEM_INSTRUCTION = [
    'Redactás el resumen para una reunión de gestión de un loteo, a partir de los agregados de tres reportes (inventario, ventas y cuotas vencidas) que recibís en JSON.',
    'Reglas:',
    '- Usá solo cifras que aparezcan en la entrada, escritas tal cual. No calcules cifras nuevas (porcentajes, diferencias, promedios ni sumas) ni redondees.',
    '- No infieras causas ni hagas predicciones: describí lo que muestran los datos, no por qué pasa.',
    '- Si falta un dato para describir algo, no lo inventes: indicá en datosFaltantes qué dato falta.',
    '- Escribí en español rioplatense, con tono neutro y profesional.',
    '- El campo texto tiene entre 4 y 6 oraciones.',
    '- No des consejos ni opiniones sobre personas (clientes, compradores, inmobiliarias ni empleados) y no las nombres.',
    '- Cada punto tiene un tema (Comercial, Cobranzas o Inventario), un detalle breve con cifras de la entrada y un enlace. Usá como enlace solo rutas que vengan en la entrada; si no viene ninguna, usá /reportes.',
    '- Respondé solo con el JSON pedido.',
].join('\n');

export const AI_SUMMARY_RESPONSE_SCHEMA: Schema = {
    type: Type.OBJECT,
    properties: {
        texto: { type: Type.STRING, description: 'Resumen de 4 a 6 oraciones.' },
        puntos: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    tema: { type: Type.STRING, enum: [...TEMAS_RESUMEN] },
                    detalle: { type: Type.STRING },
                    enlace: { type: Type.STRING },
                },
                required: ['tema', 'detalle', 'enlace'],
                propertyOrdering: ['tema', 'detalle', 'enlace'],
            },
        },
        datosFaltantes: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['texto', 'puntos', 'datosFaltantes'],
    propertyOrdering: ['texto', 'puntos', 'datosFaltantes'],
};

// ------------------------------------------------------------------ Dependencias inyectables
/** Lo que el servicio lee de la respuesta del SDK. GenerateContentResponse lo cumple. */
export type AiSummaryResponse = Pick<GenerateContentResponse, 'text' | 'usageMetadata' | 'modelVersion' | 'candidates'>;

/** Subconjunto del cliente GoogleGenAI que usa el servicio (permite mockearlo en tests). */
export interface AiSummaryClient {
    models: { generateContent(params: GenerateContentParameters): Promise<AiSummaryResponse> };
}

export interface AiSummaryLogger {
    error(message: string, detail: Record<string, unknown>): void;
}

export interface AiSummaryDeps {
    client: AiSummaryClient;
    config: AiSummaryConfig;
    logger?: AiSummaryLogger;
}

type MotivoFalla =
    | 'config'
    | 'timeout'
    | 'permisos'
    | 'cuota'
    | 'api'
    | 'red'
    | 'respuesta_vacia'
    | 'json_invalido'
    | 'json_no_objeto';

const LOG_PREFIX = '[AI_SUMMARY] No se pudo generar el resumen:';
const consoleLogger: AiSummaryLogger = { error: (message, detail) => console.error(message, detail) };

class AiTimeoutError extends Error {
    constructor() {
        super(`Vertex AI no respondió en ${AI_SUMMARY_TIMEOUT_MS} ms`);
        this.name = 'AiTimeoutError';
    }
}

function motivoDeErrorSdk(err: unknown): MotivoFalla {
    if (err instanceof AiTimeoutError) return 'timeout';
    if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403) return 'permisos';
        if (err.status === 429) return 'cuota';
        return 'api';
    }
    return 'red';
}

function tokensDe(response: AiSummaryResponse): ResumenTokens {
    const u = response.usageMetadata;
    return {
        entrada: u?.promptTokenCount ?? null,
        salida: u?.candidatesTokenCount ?? null,
        razonamiento: u?.thoughtsTokenCount ?? null,
        total: u?.totalTokenCount ?? null,
    };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Corre la llamada con un plazo total de AI_SUMMARY_TIMEOUT_MS y cancela la request al vencer. */
async function conTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const vencimiento = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(new AiTimeoutError());
        }, AI_SUMMARY_TIMEOUT_MS);
    });
    try {
        return await Promise.race([run(controller.signal), vencimiento]);
    } finally {
        clearTimeout(timer);
    }
}

/** Servicio con dependencias explícitas. La app usa generarResumen, que lo arma desde el entorno. */
export function createAiSummaryService({ client, config, logger = consoleLogger }: AiSummaryDeps) {
    // Solo metadatos técnicos: nunca la entrada ni el texto generado.
    const fallar = (motivo: MotivoFalla, detail: Record<string, unknown> = {}): never => {
        logger.error(LOG_PREFIX, { motivo, modelo: config.model, ...detail });
        throw new AiUnavailableError();
    };

    async function generarResumen(entrada: ResumenEntrada): Promise<ResumenGenerado> {
        let response: AiSummaryResponse;
        try {
            response = await conTimeout((abortSignal) =>
                client.models.generateContent({
                    model: config.model,
                    contents: JSON.stringify(entrada),
                    config: {
                        systemInstruction: AI_SUMMARY_SYSTEM_INSTRUCTION,
                        temperature: AI_SUMMARY_TEMPERATURE,
                        maxOutputTokens: AI_SUMMARY_MAX_OUTPUT_TOKENS,
                        responseMimeType: AI_SUMMARY_RESPONSE_MIME_TYPE,
                        responseSchema: AI_SUMMARY_RESPONSE_SCHEMA,
                        abortSignal,
                    },
                }),
            );
        } catch (err) {
            const motivo = motivoDeErrorSdk(err);
            return fallar(motivo, {
                ...(err instanceof ApiError && { status: err.status }),
                error: safeErrorForLog(err),
            });
        }

        const finishReason = response.candidates?.[0]?.finishReason ?? null;
        const tokens = tokensDe(response);
        const text = response.text?.trim();
        if (!text) return fallar('respuesta_vacia', { finishReason, tokens });

        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            // El mensaje de SyntaxError cita un fragmento del texto generado: no se loguea.
            return fallar('json_invalido', { finishReason, tokens, largo: text.length });
        }
        if (!isPlainObject(parsed)) {
            return fallar('json_no_objeto', { finishReason, tokens, tipo: Array.isArray(parsed) ? 'array' : typeof parsed });
        }

        return {
            resumen: parsed,
            modelo: config.model,
            versionModelo: response.modelVersion ?? null,
            tokens,
        };
    }

    return { generarResumen };
}

// ------------------------------------------------------------------ Instancia por defecto (ADC)
export type AiSummaryService = ReturnType<typeof createAiSummaryService>;

/** Cliente de Vertex AI con Application Default Credentials: sin API key. */
export function createVertexClient(config: AiSummaryConfig): AiSummaryClient {
    return new GoogleGenAI({ vertexai: true, project: config.project, location: config.location });
}

let cachedService: AiSummaryService | null = null;

function defaultService(): AiSummaryService {
    if (cachedService) return cachedService;
    try {
        const config = parseAiSummaryConfig(process.env);
        cachedService = createAiSummaryService({ client: createVertexClient(config), config });
        return cachedService;
    } catch (err) {
        // Sin caché: si se corrige el entorno, el próximo pedido vuelve a intentar.
        const detail = err instanceof AiSummaryConfigError ? { issues: err.issues } : { error: safeErrorForLog(err) };
        consoleLogger.error(LOG_PREFIX, { motivo: 'config', ...detail });
        throw new AiUnavailableError();
    }
}

/** Genera el resumen con la configuración del entorno. Rechaza con AiUnavailableError ante cualquier falla. */
export async function generarResumen(entrada: ResumenEntrada): Promise<ResumenGenerado> {
    return defaultService().generarResumen(entrada);
}

export function resetAiSummaryServiceForTests(): void {
    cachedService = null;
}
