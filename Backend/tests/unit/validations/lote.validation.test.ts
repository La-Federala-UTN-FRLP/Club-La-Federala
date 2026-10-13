import { createLoteSchema, updateLoteSchema } from '../../../src/validations/lote.validation';

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
