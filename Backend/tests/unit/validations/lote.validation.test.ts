import { createLoteSchema, updateLoteSchema, queryLoteSchema } from '../../../src/validations/lote.validation';

const baseLote = {
    numero: 1,
    fraccionId: 1,
    subestado: 'No Construido',
    tipo: 'Lote Venta',
    propietarioId: 1,
};

describe('numPartido: el default aplica solo al crear', () => {
    test('create sin numPartido usa 62', () => {
        expect(createLoteSchema.parse(baseLote).numPartido).toBe(62);
    });

    test('create respeta el numPartido enviado', () => {
        expect(createLoteSchema.parse({ ...baseLote, numPartido: '70' }).numPartido).toBe(70);
    });

    test('update parcial no agrega numPartido', () => {
        const parsed = updateLoteSchema.parse({ precio: 10 });
        expect(parsed).toEqual({ precio: 10 });
        expect(parsed).not.toHaveProperty('numPartido');
    });

    test('update conserva el numPartido enviado', () => {
        expect(updateLoteSchema.parse({ numPartido: '70' })).toEqual({ numPartido: 70 });
    });
});

// Política: deuda y alquiler son booleanos JSON. No se acepta coerción desde strings
// ("false" con z.coerce.boolean() se convertía en true) ni desde números.
describe.each([['deuda'], ['alquiler']])('%s: solo booleanos JSON', (campo) => {
    test.each([[true], [false]])('acepta %s y lo conserva (update y create)', (valor) => {
        expect(updateLoteSchema.parse({ [campo]: valor })).toEqual({ [campo]: valor });
        expect(createLoteSchema.parse({ ...baseLote, [campo]: valor })[campo as 'deuda']).toBe(valor);
    });

    test.each([['true'], ['false'], [1], [0], ['']])('rechaza %p', (valor) => {
        expect(updateLoteSchema.safeParse({ [campo]: valor }).success).toBe(false);
        expect(createLoteSchema.safeParse({ ...baseLote, [campo]: valor }).success).toBe(false);
    });

    test('sigue siendo opcional', () => {
        expect(createLoteSchema.parse(baseLote)).not.toHaveProperty(campo);
    });
});

// Query de GET /api/lotes: la representación HTTP (strings) se valida y se convierte una sola vez.
// deudor lo lee el service, así que tiene que estar declarado: Zod descarta lo que el schema no declara.
describe('queryLoteSchema', () => {
    test('acepta query vacía', () => {
        expect(queryLoteSchema.parse({})).toEqual({});
    });

    test.each([
        ['true', true],
        ['false', false],
    ])('deudor=%j se convierte al boolean %s', (entrada, esperado) => {
        const result = queryLoteSchema.safeParse({ deudor: entrada });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.deudor).toBe(esperado);
    });

    test.each([['yes'], ['1'], ['0'], [''], ['TRUE'], [['true', 'false']], [true]])('rechaza deudor=%p', (entrada) => {
        const result = queryLoteSchema.safeParse({ deudor: entrada });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0].path).toEqual(['deudor']);
    });

    test.each([['propietarioId'], ['ubicacionId']])('%s: ID canónico se convierte a number', (campo) => {
        const result = queryLoteSchema.parse({ [campo]: '2147483647' });
        expect(result[campo as 'propietarioId']).toBe(2147483647);
    });

    test.each([['propietarioId'], ['ubicacionId']])('%s rechaza formatos no canónicos', (campo) => {
        for (const valor of ['0', '-1', '007', '+5', '1e2', '0x10', '1.5', ' 12', '2147483648', 'abc', '']) {
            expect(queryLoteSchema.safeParse({ [campo]: valor }).success).toBe(false);
        }
    });

    test('descarta las claves que no declara', () => {
        expect(queryLoteSchema.parse({ estado: 'Disponible', foo: 'bar', 'estado[]': 'Vendido' })).toEqual({ estado: 'Disponible' });
    });
});
