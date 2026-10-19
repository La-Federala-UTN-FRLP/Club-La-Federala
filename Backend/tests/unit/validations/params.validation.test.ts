// Política única de IDs de path: entero decimal positivo canónico dentro de int4.
// Los schemas de params de cada módulo son alias de idParamsSchema/ventaIdParamsSchema o
// usan positiveIntString: si alguno vuelve a definir su propia regla, estos tests fallan.
import { positiveIntString, idParamsSchema, ventaIdParamsSchema } from '../../../src/validations/params.validation';
import { getLoteSchema, deleteLoteSchema } from '../../../src/validations/lote.validation';
import { quitarPromocionSchema, getPromocionActivaSchema } from '../../../src/validations/promocion.validation';
import { getReservaParamsSchema, deleteReservaParamsSchema, patchReservaParamsSchema } from '../../../src/validations/reserva.validation';
import { getVentaSchema, deleteVentaSchema, patchVentaParamsSchema } from '../../../src/validations/venta.validation';
import { ventaIdParamSchema } from '../../../src/validations/pago.validation';
import { getUsuarioSchema, deleteUsuarioSchema } from '../../../src/validations/usuario.validation';
import { idParamSchema, getInmobiliariaSchema, deleteInmobiliariaSchema } from '../../../src/validations/inmobiliaria.validation';
import { getPrioridadParamsSchema, patchPrioridadParamsSchema } from '../../../src/validations/prioridad.validation';
import { getPersonaSchema, deletePersonaSchema, miembroFamiliarParamsSchema } from '../../../src/validations/persona.validation';
import { getFraccionSchema, deleteFraccionSchema } from '../../../src/validations/fraccion.validation';
import { getUbicacionSchema, deleteUbicacionSchema } from '../../../src/validations/ubicacion.validation';
import { fileIdParamsSchema, fileVentaParamsSchema, fileLoteParamsSchema } from '../../../src/validations/filemeta.validation';
import { INVALID_PATH_IDS } from '../../support/http';

describe('positiveIntString', () => {
    test.each([
        ['1', 1],
        ['25', 25],
        ['2147483647', 2147483647],
    ])('"%s" es válido y se convierte a %d', (input, esperado) => {
        expect(positiveIntString.parse(input)).toBe(esperado);
    });

    test.each([...INVALID_PATH_IDS, ''])('%j es inválido', (input) => {
        expect(positiveIntString.safeParse(input).success).toBe(false);
    });

    test('un id con formato inválido produce un único error (sin "Fuera de rango")', () => {
        const result = positiveIntString.safeParse('abc');
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues.map((i) => i.message)).toEqual(['Debe ser un entero positivo']);
    });

    test('fuera de int4 se informa como fuera de rango', () => {
        const result = positiveIntString.safeParse('2147483648');
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues.map((i) => i.message)).toEqual(['Fuera de rango']);
    });

    test('un path param nunca es number: 12 sin comillas es inválido', () => {
        expect(positiveIntString.safeParse(12).success).toBe(false);
    });
});

describe('schemas de params de los módulos', () => {
    test.each([
        ['getLoteSchema', getLoteSchema],
        ['deleteLoteSchema', deleteLoteSchema],
        ['quitarPromocionSchema', quitarPromocionSchema],
        ['getPromocionActivaSchema', getPromocionActivaSchema],
        ['getReservaParamsSchema', getReservaParamsSchema],
        ['deleteReservaParamsSchema', deleteReservaParamsSchema],
        ['patchReservaParamsSchema', patchReservaParamsSchema],
        ['getVentaSchema', getVentaSchema],
        ['deleteVentaSchema', deleteVentaSchema],
        ['patchVentaParamsSchema', patchVentaParamsSchema],
        ['getUsuarioSchema', getUsuarioSchema],
        ['deleteUsuarioSchema', deleteUsuarioSchema],
        ['idParamSchema (inmobiliarias)', idParamSchema],
        ['getInmobiliariaSchema', getInmobiliariaSchema],
        ['deleteInmobiliariaSchema', deleteInmobiliariaSchema],
        ['getPrioridadParamsSchema', getPrioridadParamsSchema],
        ['patchPrioridadParamsSchema', patchPrioridadParamsSchema],
        ['getPersonaSchema', getPersonaSchema],
        ['deletePersonaSchema', deletePersonaSchema],
        ['getFraccionSchema', getFraccionSchema],
        ['deleteFraccionSchema', deleteFraccionSchema],
        ['getUbicacionSchema', getUbicacionSchema],
        ['deleteUbicacionSchema', deleteUbicacionSchema],
        ['fileIdParamsSchema', fileIdParamsSchema],
    ])('%s es idParamsSchema', (_nombre, schema) => {
        expect(schema).toBe(idParamsSchema);
    });

    test.each([
        ['ventaIdParamSchema (pagos)', ventaIdParamSchema],
        ['fileVentaParamsSchema', fileVentaParamsSchema],
    ])('%s es ventaIdParamsSchema', (_nombre, schema) => {
        expect(schema).toBe(ventaIdParamsSchema);
    });

    test('params con otro nombre usan positiveIntString', () => {
        expect(fileLoteParamsSchema.shape.idLoteAsociado).toBe(positiveIntString);
        expect(miembroFamiliarParamsSchema.shape.id).toBe(positiveIntString);
        expect(miembroFamiliarParamsSchema.shape.miembroId).toBe(positiveIntString);
    });

    test('params múltiples: todos los declarados llegan convertidos', () => {
        expect(miembroFamiliarParamsSchema.parse({ id: '5', miembroId: '9' })).toEqual({ id: 5, miembroId: 9 });
    });
});
