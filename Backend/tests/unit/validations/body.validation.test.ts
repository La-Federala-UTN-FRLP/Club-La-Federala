// Política de números del body JSON (src/validations/body.validation.ts).
// Antes cada módulo declaraba su propio z.coerce.number(), que convertía input estructuralmente
// inválido en datos válidos: null/""/false/[] → 0, true → 1, [7] → 7, "1e2" → 100, "0x10" → 16.
// Acá se prueba el helper una sola vez, de forma exhaustiva; los módulos solo demuestran que lo usan.
import { z } from 'zod';
import { idDelBody, enteroPositivoDelBody, numeroDelBody, INT4_MAX } from '../../../src/validations/body.validation';

const id = idDelBody('de prueba');
const numero = numeroDelBody('Debe ser un número');

describe('INT4_MAX', () => {
    test('es el máximo de un Int de PostgreSQL', () => {
        expect(INT4_MAX).toBe(2147483647);
    });
});

describe('idDelBody: ID de PK (entero positivo, 1..INT4_MAX)', () => {
    test.each([
        [1, 1],
        [12, 12],
        ['1', 1],
        ['12', 12],
        [2147483647, 2147483647],
        ['2147483647', 2147483647],
        // Espacios externos de un string: se toleran y recortan (contrato previo de Venta, #252).
        [' 12 ', 12],
        [12.0, 12],
    ])('acepta %p y entrega el number %p', (entrada, esperado) => {
        const result = id.safeParse(entrada);
        expect(result.success).toBe(true);
        expect(result.success && result.data).toBe(esperado);
        expect(result.success && typeof result.data).toBe('number');
    });

    const INVALIDOS: [string, unknown][] = [
        ['true', true],
        ['false', false],
        ['null', null],
        ['undefined', undefined],
        ['string vacío', ''],
        ['solo espacios', ' '],
        ['varios espacios', '   '],
        ['array vacío', []],
        ['array con número', [7]],
        ['array con string', ['7']],
        ['objeto', {}],
        ['notación exponencial', '1e2'],
        ['exponencial negativa', '10e-1'],
        ['hexadecimal', '0x10'],
        ['cero a la izquierda', '007'],
        ['signo positivo', '+5'],
        ['negativo string', '-1'],
        ['decimal string', '1.5'],
        ['decimal con cero', '12.0'],
        ['texto', 'abc'],
        ['número con texto', '12abc'],
        ['dígitos no ASCII', '١٢'],
        ['cero', 0],
        ['cero string', '0'],
        ['negativo', -1],
        ['decimal', 1.5],
        ['int4 + 1', 2147483648],
        ['int4 + 1 string', '2147483648'],
        ['entero enorme', Number.MAX_SAFE_INTEGER],
        ['string enorme', '9'.repeat(400)],
        ['NaN', NaN],
        ['Infinity', Infinity],
        ['-Infinity', -Infinity],
        ['bigint', BigInt(12)],
    ];

    test.each(INVALIDOS)('rechaza %s', (_label, entrada) => {
        expect(id.safeParse(entrada).success).toBe(false);
    });

    test('el error lleva un mensaje que nombra la entidad', () => {
        const result = idDelBody('del lote').safeParse(true);
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0].message).toContain('lote');
    });

    test('se compone con optional() y nullable(): conservan su semántica', () => {
        expect(id.optional().safeParse(undefined).success).toBe(true);
        expect(id.optional().safeParse(null).success).toBe(false);
        expect(id.nullable().safeParse(null)).toEqual({ success: true, data: null });
        expect(id.nullable().safeParse(undefined).success).toBe(false);
        expect(id.optional().nullable().safeParse(null)).toEqual({ success: true, data: null });
        expect(id.optional().nullable().safeParse('5')).toEqual({ success: true, data: 5 });
        expect(id.optional().nullable().safeParse('1e2').success).toBe(false);
    });

    test('dentro de un objeto el error apunta al campo', () => {
        const result = z.object({ loteId: id }).safeParse({ loteId: '007' });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0].path).toEqual(['loteId']);
    });
});

describe('numeroDelBody: número general (decimal explícito, sin restricciones de dominio)', () => {
    test.each([
        [0, 0],
        [10.5, 10.5],
        [-1, -1],
        ['10', 10],
        [' 10 ', 10],
        ['10.50', 10.5],
        ['0', 0],
        ['-1', -1],
        ['-2.5', -2.5],
        ['007', 7],
    ])('acepta %p como el number %p', (entrada, esperado) => {
        const result = numero.safeParse(entrada);
        expect(result.success).toBe(true);
        expect(result.success && result.data).toBe(esperado);
    });

    test.each([
        ['null', null],
        ['undefined', undefined],
        ['string vacío', ''],
        ['solo espacios', '   '],
        ['false', false],
        ['true', true],
        ['array vacío', []],
        ['array con número', [5]],
        ['objeto', {}],
        ['NaN', NaN],
        ['Infinity', Infinity],
        ['-Infinity', -Infinity],
        ['texto', 'abc'],
        ['número con texto', '5abc'],
        ['notación exponencial', '1e3'],
        ['exponencial con signo', '1e-2'],
        ['hexadecimal', '0x10'],
        ['binario', '0b11'],
        ['signo positivo', '+5'],
        ['sin parte entera', '.5'],
        ['sin parte decimal', '5.'],
        ['coma decimal', '1,5'],
        ['separador de miles', '1.000,5'],
        ['dígitos no ASCII', '١٢'],
        ['string que desborda a Infinity', '9'.repeat(400)],
        ['bigint', BigInt(5)],
    ])('rechaza %s', (_label, entrada) => {
        expect(numero.safeParse(entrada).success).toBe(false);
    });

    test('se compone con restricciones de dominio vía pipe: las reglas de cada campo se conservan', () => {
        const precio = numeroDelBody('Precio inválido').pipe(z.number().min(0, 'No puede ser negativo'));
        expect(precio.safeParse('10.5')).toEqual({ success: true, data: 10.5 });
        expect(precio.safeParse(0)).toEqual({ success: true, data: 0 });
        expect(precio.safeParse(-1).success).toBe(false);
        expect(precio.safeParse('-1').success).toBe(false);
        expect(precio.safeParse(null).success).toBe(false);
        expect(precio.optional().safeParse(undefined).success).toBe(true);
    });

    test('no impone int ni positivo por sí mismo (eso es del dominio de cada campo)', () => {
        expect(numero.safeParse(1.5).success).toBe(true);
        expect(numero.safeParse(-3).success).toBe(true);
        expect(numero.safeParse(0).success).toBe(true);
    });
});

describe('enteroPositivoDelBody: entero positivo int4 con mensaje propio (columnas Int que no son PK)', () => {
    const MENSAJE = 'Valor inválido de prueba';
    const schema = enteroPositivoDelBody(MENSAJE);

    test.each([
        [1, 1],
        [5, 5],
        ['5', 5],
        ['  12 ', 12],
        [INT4_MAX, INT4_MAX],
        [String(INT4_MAX), INT4_MAX],
    ])('acepta %j y entrega el number %s', (entrada, esperado) => {
        const result = schema.safeParse(entrada);
        expect(result.success).toBe(true);
        expect(result.success && result.data).toBe(esperado);
    });

    test.each([
        ['05'], ['007'], ['1e2'], ['0x10'], ['+5'], ['5.5'], ['-1'], ['0'], [0], [-1], [5.5],
        [''], ['   '], [null], [undefined], [true], [false], [[5]], [{}], [NaN], [Infinity],
        [INT4_MAX + 1], [String(INT4_MAX + 1)],
    ])('rechaza %j con el mensaje recibido', (entrada) => {
        const result = schema.safeParse(entrada);
        expect(result.success).toBe(false);
        expect(!result.success && result.error.issues.map((i) => i.message)).toEqual([MENSAJE]);
    });

    test('idDelBody delega en la misma regla pero conserva su mensaje "ID …"', () => {
        const result = idDelBody('del lote').safeParse('05');
        expect(result.success).toBe(false);
        expect(!result.success && result.error.issues[0].message).toBe(
            `El ID del lote debe ser un entero positivo (máximo ${INT4_MAX})`,
        );
    });
});
