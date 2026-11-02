import { z } from 'zod';
import { INT4_MAX } from './params.validation';

export { INT4_MAX };

// Política de números del body JSON.
//
// Reemplaza z.coerce.number(), que usa Number() sobre cualquier valor y por eso convertía input
// estructuralmente inválido en datos "válidos": null, "", "   ", false y [] → 0; true → 1;
// [7] → 7; "1e2" → 100; "0x10" → 16. El boundary HTTP no debe inventar valores.
//
// Cada medio tiene su propia política:
//   - JSON body  → este archivo (acepta number JSON o string decimal, entrega number)
//   - URL/query  → positiveIntString (params.validation.ts), solo strings canónicos
//   - multipart  → positiveIntString, porque todo campo de un form llega como string

const ID_CANONICO = /^[1-9]\d*$/;

/**
 * ID de una PK numérica en un body JSON: entero positivo dentro del rango int4 (1..2147483647).
 *
 * Acepta un number entero ("12" también, tal como lo envían los formularios) y entrega siempre
 * un number. Rechaza null, booleanos, arrays, objetos, "", " ", "0", "-1", "+5", "007", "1e2",
 * "0x10", "1.5", NaN, Infinity y todo lo que supere INT4_MAX (que de otro modo terminaría en un
 * error 500 de Prisma). Los espacios externos de un string se recortan ("  12 " → 12).
 *
 * No incluye nullable ni optional: cada campo conserva el suyo (`idDelBody('del lote').optional()`).
 * Para contadores y cantidades (que no son PK) usar numeroDelBody con sus reglas de dominio.
 */
export const idDelBody = (entidad: string) =>
    enteroPositivoDelBody(`El ID ${entidad} debe ser un entero positivo (máximo ${INT4_MAX})`);

/**
 * Entero positivo int4 (1..2147483647) de un body JSON, con mensaje propio. Es la regla de
 * idDelBody sin el texto "ID": sirve para columnas Int que no son PK pero tienen el mismo dominio
 * (p. ej. Fraccion.numero, que además es @unique). Acepta number o string decimal canónico
 * ("5"; no "05", "1e2", "+5", "5.5") y entrega siempre un number.
 */
export const enteroPositivoDelBody = (mensaje: string) => {
    return z.union([z.number(), z.string()], { message: mensaje }).transform((valor, ctx) => {
        const candidato = typeof valor === 'string' ? (ID_CANONICO.test(valor.trim()) ? Number(valor.trim()) : NaN) : valor;
        if (!Number.isInteger(candidato) || candidato < 1 || candidato > INT4_MAX) {
            ctx.addIssue({ code: 'custom', message: mensaje });
            return z.NEVER;
        }
        return candidato;
    });
};

/**
 * Número general del body JSON: number finito o string en notación decimal explícita
 * ("10", " 10.5 ", "-1", "007"). Entrega un number.
 *
 * Rechaza null, "", "   ", booleanos, arrays, objetos, NaN, Infinity, notación exponencial
 * ("1e2"), hexadecimal ("0x10"), "+5", ".5", "5." y separadores de miles o coma decimal.
 *
 * No impone int, positivo ni rangos: esas son reglas de dominio de cada campo y se agregan con
 * pipe, por ejemplo `numeroDelBody('Precio inválido').pipe(z.number().min(0))`.
 */
export const numeroDelBody = (mensaje: string) =>
    z
        .union([z.number(), z.string().trim().regex(/^-?\d+(\.\d+)?$/)], { message: mensaje })
        .transform(Number)
        // Un string de cientos de dígitos pasa el regex pero Number() lo vuelve Infinity.
        .pipe(z.number({ message: mensaje }));

/**
 * Regla de los updates parciales (PUT/PATCH): el body validado tiene que traer al menos un campo.
 * Se evalúa sobre el RESULTADO de Zod, así que un body con solo claves desconocidas (que Zod
 * descarta) también cuenta como vacío. No convierte el schema en .strict(): una clave ajena junto a
 * un campo real sigue siendo válida y se descarta.
 *
 * Uso: `z.object({...}).refine(tieneAlgunCampo, ACTUALIZAR_SIN_CAMPOS)`.
 */
export const tieneAlgunCampo = (data: object): boolean => Object.values(data).some((valor) => valor !== undefined);

export const ACTUALIZAR_SIN_CAMPOS = { message: 'Debes enviar al menos un campo para actualizar' } as const;
