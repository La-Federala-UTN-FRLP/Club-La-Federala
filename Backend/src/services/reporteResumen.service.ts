// "Resumen para la reunión" (CCLF-37, tarea 40.3): arma la entrada con los agregados de los 3
// reportes, la pasa a Gemini (servicio aiSummary, 40.2), valida la salida y registra una línea de log
// con tokens, latencia y resultado. Nunca registra la entrada, la salida ni las cifras rechazadas.
import { Prisma } from '../generated/prisma';
import type { BodyResumen } from '../validations/reporte.validation';
import * as reporteService from './reporte.service';
import type { CuotaVencidaFila } from './reporte.service';
import {
    generarResumen as generarResumenVertex,
    type ResumenEntrada,
    type ResumenGenerado,
    type ResumenSalida,
    type ResumenTokens,
} from './aiSummary.service';
import { AiUnavailableError } from './aiSummary.errors';
import { validarSalidaResumen, type MotivoSalidaInvalida } from './reporteResumen.salida';

// ------------------------------------------------------------------ Entrada
/**
 * Saldo vencido por número visible de fracción ("2": "4800.00"), sumado en Decimal (nunca en float)
 * y con 2 decimales. Las claves quedan en orden numérico ascendente.
 */
export function saldoPorFraccion(filas: Pick<CuotaVencidaFila, 'fraccion' | 'saldoPendiente'>[]): Record<string, string> {
    const porFraccion = new Map<number, Prisma.Decimal>();
    for (const f of filas) {
        porFraccion.set(f.fraccion, (porFraccion.get(f.fraccion) ?? new Prisma.Decimal(0)).plus(f.saldoPendiente));
    }
    return Object.fromEntries(
        [...porFraccion.entries()].sort(([a], [b]) => a - b).map(([fraccion, saldo]) => [String(fraccion), saldo.toFixed(2)]),
    );
}

/**
 * Calcula los 3 reportes en paralelo con los filtros del body y arma la entrada del modelo solo con
 * agregados: sin filas, ids de venta ni datos personales.
 */
export async function armarEntradaResumen(filtros: BodyResumen): Promise<ResumenEntrada> {
    const { desde, hasta, fraccion, moneda } = filtros;
    const [inventario, ventas, cuotas] = await Promise.all([
        reporteService.getReporteInventario({ fraccion }),
        reporteService.getReporteVentas({ desde, hasta, fraccion }),
        reporteService.getReporteCuotasVencidas({ moneda, fraccion }),
    ]);

    return {
        corte: ventas.corte,
        periodo: ventas.periodo,
        inventario: {
            ofrecibles: inventario.totales.ofrecibles,
            porEstado: Object.fromEntries(inventario.totales.porEstado.map((e) => [e.estado, e.cantidad])),
        },
        ventas: {
            iniciadas: {
                cantidad: ventas.tarjetas.iniciadas.cantidad,
                montoUSD: ventas.tarjetas.iniciadas.montoUSD,
                cantidadAnterior: ventas.tarjetas.iniciadas.cantidadAnterior,
            },
            escrituradas: { cantidad: ventas.tarjetas.escrituradas.cantidad },
            canceladas: { cantidad: ventas.tarjetas.canceladas.cantidad },
        },
        cuotasVencidas: {
            moneda: cuotas.moneda,
            saldo: cuotas.saldoVencido,
            cuotas: cuotas.cuotas,
            porFraccion: saldoPorFraccion(cuotas.filas),
        },
    };
}

// ------------------------------------------------------------------ Log
export type ResultadoResumen = 'ok' | 'ai_unavailable' | 'salida_invalida' | 'error_reportes';

/** Línea de log por resumen. Cloud Logging la toma como jsonPayload. Sin entrada, salida ni cifras. */
export interface ResumenLog {
    severity: 'INFO' | 'ERROR';
    message: '[AI_SUMMARY] resumen';
    resultado: ResultadoResumen;
    /** Detalle técnico del resultado: regla de salida que falló o tipo de error. null si ok. */
    motivo: MotivoSalidaInvalida | string | null;
    /** Cuántas cifras de la salida no estaban en la entrada (nunca cuáles). */
    cifrasRechazadas: number;
    rol: string;
    modelo: string | null;
    versionModelo: string | null;
    tokens: ResumenTokens | null;
    /** Latencia total del pedido (reportes + IA + validación), en ms. */
    latenciaMs: number;
    /** Latencia de la llamada a la IA, en ms; null si no se llegó a llamarla. */
    latenciaIaMs: number | null;
}

export type ResumenLogger = (linea: ResumenLog) => void;

const LOG_MESSAGE = '[AI_SUMMARY] resumen';

/** Una línea JSON en stdout (ok) o stderr (error): Cloud Run la ingesta con su severity. */
export const consoleResumenLogger: ResumenLogger = (linea) => {
    const json = JSON.stringify(linea);
    if (linea.severity === 'ERROR') console.error(json);
    else console.log(json);
};

// ------------------------------------------------------------------ Servicio
export interface ResumenReunion extends ResumenSalida {
    modelo: string;
    corte: string;
}

export interface ResumenReunionDeps {
    armarEntrada?: (filtros: BodyResumen) => Promise<ResumenEntrada>;
    generar?: (entrada: ResumenEntrada) => Promise<ResumenGenerado>;
    logger?: ResumenLogger;
    /** Reloj en ms para las latencias. */
    reloj?: () => number;
}

export interface OpcionesResumen {
    rol: string;
    /** Se llama si el pedido no llega a la IA (fallan los reportes): devuelve el cupo diario. */
    liberarCupo?: () => void;
}

export function createReporteResumenService({
    armarEntrada = armarEntradaResumen,
    generar = generarResumenVertex,
    logger = consoleResumenLogger,
    reloj = () => performance.now(),
}: ResumenReunionDeps = {}) {
    async function resumirParaReunion(filtros: BodyResumen, { rol, liberarCupo }: OpcionesResumen): Promise<ResumenReunion> {
        const inicio = reloj();
        const registrar = (campos: Partial<ResumenLog> & Pick<ResumenLog, 'resultado'>) =>
            logger({
                severity: campos.resultado === 'ok' ? 'INFO' : 'ERROR',
                message: LOG_MESSAGE,
                motivo: null,
                cifrasRechazadas: 0,
                rol,
                modelo: null,
                versionModelo: null,
                tokens: null,
                latenciaIaMs: null,
                ...campos,
                latenciaMs: Math.round(reloj() - inicio),
            });

        let entrada: ResumenEntrada;
        try {
            entrada = await armarEntrada(filtros);
        } catch (err) {
            // No llegó a la IA: no consume cupo. El error sigue su camino (500 del middleware).
            liberarCupo?.();
            registrar({ resultado: 'error_reportes', motivo: err instanceof Error ? err.name : 'desconocido' });
            throw err;
        }

        const inicioIa = reloj();
        let generado: ResumenGenerado;
        try {
            generado = await generar(entrada);
        } catch (err) {
            // aiSummary ya registró el motivo técnico (timeout, red, permisos...). Cualquier otra
            // falla de la IA también es AI_UNAVAILABLE: los reportes no dependen de ella.
            registrar({
                resultado: 'ai_unavailable',
                motivo: err instanceof AiUnavailableError ? null : err instanceof Error ? err.name : 'desconocido',
                latenciaIaMs: Math.round(reloj() - inicioIa),
            });
            throw err instanceof AiUnavailableError ? err : new AiUnavailableError();
        }
        const latenciaIaMs = Math.round(reloj() - inicioIa);
        const metadatos = { modelo: generado.modelo, versionModelo: generado.versionModelo, tokens: generado.tokens, latenciaIaMs };

        const validacion = validarSalidaResumen(generado.resumen, entrada);
        if (!validacion.ok) {
            registrar({
                resultado: 'salida_invalida',
                motivo: validacion.motivo,
                cifrasRechazadas: validacion.cifrasRechazadas,
                ...metadatos,
            });
            throw new AiUnavailableError();
        }

        registrar({ resultado: 'ok', ...metadatos });
        const { texto, puntos, datosFaltantes } = validacion.salida;
        return { texto, puntos, datosFaltantes, modelo: generado.modelo, corte: entrada.corte };
    }

    return { resumirParaReunion };
}

const defaultService = createReporteResumenService();

/** Resumen para la reunión con la configuración del entorno (Vertex AI por ADC, log a consola). */
export const resumirParaReunion: ReturnType<typeof createReporteResumenService>['resumirParaReunion'] = (filtros, opciones) =>
    defaultService.resumirParaReunion(filtros, opciones);
