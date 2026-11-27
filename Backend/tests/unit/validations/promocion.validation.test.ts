// aplicarPromocionSchema: precioPromocional con hasta 2 decimales.
// Revisión de la PR 368: la columna es Decimal(12,2) y Postgres redondeaba los decimales de más
// (999.995 se guardaba como 1000.00, que además ya no es menor al precio actual).
import { aplicarPromocionSchema } from '../../../src/validations/promocion.validation';

const MENSAJE_DECIMALES = 'El precio promocional puede tener hasta 2 decimales';

describe('aplicarPromocionSchema — decimales de precioPromocional', () => {
    test.each([999.995, '999.995', 100.001, 0.015])('%j (3 decimales) → error en precioPromocional', (valor) => {
        const result = aplicarPromocionSchema.safeParse({ precioPromocional: valor });

        expect(result.success).toBe(false);
        expect(result.error?.issues).toEqual([
            expect.objectContaining({ path: ['precioPromocional'], message: MENSAJE_DECIMALES }),
        ]);
    });

    test.each([
        [999.99, 999.99],
        ['999.99', 999.99],
        [100.5, 100.5],
        [800, 800],
        [0.07, 0.07],
        [0.01, 0.01],
    ])('%j (hasta 2 decimales) → OK', (valor, esperado) => {
        const result = aplicarPromocionSchema.safeParse({ precioPromocional: valor });

        expect(result.success).toBe(true);
        expect(result.data?.precioPromocional).toBe(esperado);
    });
});
