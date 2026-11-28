import { z } from 'zod';
import { TEMAS_RESUMEN, type ResumenEntrada, type ResumenSalida } from './aiSummary.service';

/**
 * Validación de la salida del resumen con IA (CCLF-37, tarea 40.3). El servicio aiSummary (40.2) solo
 * garantiza un objeto JSON; acá se comprueba el esquema y que el modelo no haya inventado cifras.
 * Cualquier regla que falle hace que el endpoint responda 502 AI_UNAVAILABLE.
 *
 * Reglas de cifras (V4: "cada número del texto presente en la entrada"):
 *  - Se revisan `texto`, cada `puntos[].detalle` y cada `datosFaltantes[]`. `tema` es un enum y
 *    `enlace` tiene su propia regla (ruta interna de /reportes).
 *  - Primero se reconocen las fechas completas (2026-11-20, 20/11/2026): tienen que ser una de las
 *    fechas de la entrada (corte, desde, hasta).
 *  - Después, cada número que queda (dígitos con separadores . o ,) se normaliza y se compara con el
 *    conjunto de números de la entrada, sin ceros sobrantes: "255000.00" = "255.000,00" = "255000".
 *  - Un número con un solo separador y 3 dígitos después ("7.200", "1,500") es ambiguo entre miles y
 *    decimales: se acepta si cualquiera de las dos lecturas está en la entrada.
 *  - Día, mes y año sueltos de las fechas de la entrada se aceptan ("del 1 al 20 de noviembre de
 *    2026"). Costo asumido: un número inventado que coincida con uno de esos (p. ej. 20) pasa.
 *  - Se rechaza cualquier porcentaje ("%" o "por ciento"): la IA no calcula cifras nuevas.
 *  - Se rechaza cualquier email: es un dato personal y la entrada no tiene ninguno.
 */

// ------------------------------------------------------------------ Esquema
// Ruta interna del módulo Reportes, con filtros opcionales: "/reportes", "/reportes?moneda=USD".
// Sin esquema, host, "//", "\", ".." ni espacios: no puede salir del frontend ni del módulo.
const ENLACE_REPORTES = /^\/reportes(?:[/?#][^\s\\]*)?$/;
const enlaceInterno = z
    .string()
    .regex(ENLACE_REPORTES)
    .refine((e) => !e.includes('//') && !e.includes('..'));

const textoNoVacio = z.string().trim().min(1);

export const resumenSalidaSchema = z.object({
    texto: textoNoVacio,
    puntos: z.array(
        z.object({
            tema: z.enum(TEMAS_RESUMEN),
            detalle: textoNoVacio,
            enlace: enlaceInterno,
        }),
    ),
    datosFaltantes: z.array(textoNoVacio),
}) satisfies z.ZodType<ResumenSalida>;

// ------------------------------------------------------------------ Normalización de cifras
const SOLO_DIGITOS = /^\d+$/;

/** Forma canónica de un decimal "123.4500" → "123.45", "007" → "7", "5.00" → "5". */
export function canonica(entero: string, decimales = ''): string {
    const e = entero.replace(/^0+(?=\d)/, '');
    const d = decimales.replace(/0+$/, '');
    return d ? `${e}.${d}` : e;
}

/** Grupos de miles válidos: el primero de 1 a 3 dígitos y los demás de exactamente 3. */
function gruposDeMiles(grupos: string[]): boolean {
    return grupos[0].length >= 1 && grupos[0].length <= 3 && grupos.slice(1).every((g) => g.length === 3);
}

/**
 * Lecturas canónicas posibles de un número escrito con "." o "," como separadores ("255.000,00",
 * "255000.00", "7.200"). Devuelve [] si no es un número bien formado en ningún formato.
 */
export function lecturasDeCifra(token: string): string[] {
    if (SOLO_DIGITOS.test(token)) return [canonica(token)];
    if (!/^\d+(?:[.,]\d+)+$/.test(token)) return [];

    const puntos = (token.match(/\./g) ?? []).length;
    const comas = (token.match(/,/g) ?? []).length;

    if (puntos > 0 && comas > 0) {
        // Los dos separadores: el último es el decimal y el otro, el de miles (una sola vez el decimal).
        const decimal = token.lastIndexOf('.') > token.lastIndexOf(',') ? '.' : ',';
        const miles = decimal === '.' ? ',' : '.';
        const [parteEntera, parteDecimal, ...resto] = token.split(decimal);
        if (resto.length > 0 || parteDecimal.includes(miles)) return [];
        const grupos = parteEntera.split(miles);
        return gruposDeMiles(grupos) ? [canonica(grupos.join(''), parteDecimal)] : [];
    }

    const sep = puntos > 0 ? '.' : ',';
    const partes = token.split(sep);
    if (partes.length > 2) {
        // Varias veces el mismo separador: solo puede ser de miles ("1.234.567").
        return gruposDeMiles(partes) ? [canonica(partes.join(''))] : [];
    }
    const [entero, fraccion] = partes;
    const comoDecimal = canonica(entero, fraccion);
    // "7.200" / "1,500": miles o decimal; se aceptan las dos lecturas.
    if (fraccion.length === 3 && entero.length <= 3) return [...new Set([canonica(entero + fraccion), comoDecimal])];
    return [comoDecimal];
}

// ------------------------------------------------------------------ Fechas
const FECHA_ISO = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const FECHA_AR = /(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/g;
const NUMERO = /\d+(?:[.,]\d+)*/g;

const dosDigitos = (v: string) => v.padStart(2, '0');

/** Reemplaza las fechas completas por un espacio y devuelve las encontradas como YYYY-MM-DD. */
function extraerFechas(texto: string): { resto: string; fechas: string[] } {
    const fechas: string[] = [];
    const resto = texto
        .replace(FECHA_ISO, (_m, a: string, me: string, d: string) => {
            fechas.push(`${a}-${me}-${d}`);
            return ' ';
        })
        .replace(FECHA_AR, (_m, d: string, me: string, a: string) => {
            fechas.push(`${a}-${dosDigitos(me)}-${dosDigitos(d)}`);
            return ' ';
        });
    return { resto, fechas };
}

// ------------------------------------------------------------------ Conjunto permitido
export interface CifrasPermitidas {
    numeros: Set<string>;
    fechas: Set<string>;
}

const FECHA_ENTRADA = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECIMAL_ENTRADA = /^(\d+)(?:\.(\d+))?$/;

/** Números y fechas de la entrada: valores numéricos, montos, claves de porFraccion y partes de fechas. */
export function cifrasDeEntrada(entrada: ResumenEntrada): CifrasPermitidas {
    const numeros = new Set<string>();
    const fechas = new Set<string>();

    const agregarTexto = (valor: string) => {
        const fecha = FECHA_ENTRADA.exec(valor);
        if (fecha) {
            fechas.add(valor);
            // Día, mes y año sueltos ("del 1 al 20 de noviembre de 2026").
            for (const parte of fecha.slice(1)) numeros.add(canonica(parte));
            return;
        }
        const decimal = DECIMAL_ENTRADA.exec(valor);
        if (decimal) numeros.add(canonica(decimal[1], decimal[2]));
    };

    const recorrer = (valor: unknown) => {
        if (typeof valor === 'number') {
            if (Number.isFinite(valor)) agregarTexto(String(Math.abs(valor)));
        } else if (typeof valor === 'string') {
            agregarTexto(valor);
        } else if (valor && typeof valor === 'object') {
            for (const [clave, v] of Object.entries(valor)) {
                // Claves numéricas: los números de fracción de porFraccion.
                if (SOLO_DIGITOS.test(clave)) numeros.add(canonica(clave));
                recorrer(v);
            }
        }
    };
    recorrer(entrada);
    return { numeros, fechas };
}

// ------------------------------------------------------------------ Validación
export type MotivoSalidaInvalida = 'esquema' | 'email' | 'porcentaje' | 'cifras';

export type ResultadoValidacionSalida =
    | { ok: true; salida: ResumenSalida; cifrasRechazadas: 0 }
    | { ok: false; motivo: MotivoSalidaInvalida; cifrasRechazadas: number };

const PORCENTAJE = /%|por\s*ciento/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/** Cantidad de fechas y números del texto que no están en la entrada. */
export function contarCifrasAjenas(texto: string, permitidas: CifrasPermitidas): number {
    const { resto, fechas } = extraerFechas(texto);
    let ajenas = fechas.filter((f) => !permitidas.fechas.has(f)).length;
    for (const token of resto.match(NUMERO) ?? []) {
        const lecturas = lecturasDeCifra(token);
        if (!lecturas.some((l) => permitidas.numeros.has(l))) ajenas += 1;
    }
    return ajenas;
}

/**
 * Valida la salida del modelo contra el esquema y las reglas de cifras. El resultado nunca incluye
 * las cifras rechazadas, solo cuántas fueron: el log no guarda contenido de la salida.
 */
export function validarSalidaResumen(salidaCruda: unknown, entrada: ResumenEntrada): ResultadoValidacionSalida {
    const parsed = resumenSalidaSchema.safeParse(salidaCruda);
    if (!parsed.success) return { ok: false, motivo: 'esquema', cifrasRechazadas: 0 };
    const salida = parsed.data;

    const textos = [salida.texto, ...salida.puntos.map((p) => p.detalle), ...salida.datosFaltantes];
    const permitidas = cifrasDeEntrada(entrada);
    const cifrasRechazadas = textos.reduce((total, t) => total + contarCifrasAjenas(t, permitidas), 0);

    if (textos.some((t) => EMAIL.test(t))) return { ok: false, motivo: 'email', cifrasRechazadas };
    if (textos.some((t) => PORCENTAJE.test(t))) return { ok: false, motivo: 'porcentaje', cifrasRechazadas };
    if (cifrasRechazadas > 0) return { ok: false, motivo: 'cifras', cifrasRechazadas };
    return { ok: true, salida, cifrasRechazadas: 0 };
}
