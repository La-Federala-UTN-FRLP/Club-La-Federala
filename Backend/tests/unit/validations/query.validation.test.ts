import { z } from 'zod';
import { booleanQuery } from '../../../src/validations/query.validation';

// Contrato HTTP de los booleanos de query: solo "true" o "false", en minúscula.
// z.coerce.boolean() no sirve para esto: convierte "false" y "0" en true.
describe('booleanQuery', () => {
    test.each([
        ['true', true],
        ['false', false],
    ])('%j → %s (boolean)', (entrada, esperado) => {
        const result = booleanQuery.safeParse(entrada);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toBe(esperado);
            expect(typeof result.data).toBe('boolean');
        }
    });

    test.each([
        ['1'], ['0'], ['yes'], ['no'], ['on'], ['off'], ['y'], ['n'],
        ['TRUE'], ['True'], ['FALSE'], ['False'],
        [''], [' true'], ['true '], ['verdadero'],
    ])('rechaza %j', (entrada) => {
        expect(booleanQuery.safeParse(entrada).success).toBe(false);
    });

    test.each([
        [['true']], [['true', 'false']], [[]],
    ])('rechaza arrays (query repetida) %j', (entrada) => {
        expect(booleanQuery.safeParse(entrada).success).toBe(false);
    });

    test.each([[true], [false], [1], [0], [null], [undefined]])('rechaza el valor no string %p', (entrada) => {
        expect(booleanQuery.safeParse(entrada).success).toBe(false);
    });

    test('dentro de un objeto con .optional(): ausente no agrega la clave; presente se convierte', () => {
        const schema = z.object({ flag: booleanQuery.optional() });
        expect(schema.parse({})).toEqual({});
        expect(schema.parse({})).not.toHaveProperty('flag');
        expect(schema.parse({ flag: 'false' })).toEqual({ flag: false });
        expect(schema.parse({ flag: 'true' })).toEqual({ flag: true });
        expect(schema.safeParse({ flag: 'yes' }).success).toBe(false);
    });
});
