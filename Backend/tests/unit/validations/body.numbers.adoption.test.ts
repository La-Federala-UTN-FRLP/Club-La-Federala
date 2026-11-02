// Números del body que NO son IDs (montos, cantidades, contadores).
// Regresión: z.coerce.number() los aceptaba como 0/1/N a partir de null, "", false, true, [7],
// "1e2" o "0x10". Cada campo conserva sus reglas de dominio (min, int, positive, max) pero deja
// de convertir input estructuralmente inválido en un valor.
import { createLoteSchema, updateLoteSchema } from '../../../src/validations/lote.validation';
import { createReservaSchema, updateReservaSchema, createOfertaSchema } from '../../../src/validations/reserva.validation';
import {
    registrarPagoSchema,
    aplicarRecargoSchema,
    createPlanPagoSchema,
    reemplazarPlanPagoSchema,
} from '../../../src/validations/pago.validation';
import { createInmobiliariaSchema, updateInmobiliariaSchema } from '../../../src/validations/inmobiliaria.validation';
import { createUbicacionSchema, updateUbicacionSchema } from '../../../src/validations/ubicacion.validation';
import { aplicarPromocionSchema } from '../../../src/validations/promocion.validation';

type Schema = { safeParse: (input: unknown) => { success: boolean; data?: any; error?: { issues: { path: PropertyKey[] }[] } } };

interface CampoNumerico {
    nombre: string;
    schema: Schema;
    build: (valor: unknown) => Record<string, unknown>;
    leer: (data: any) => unknown;
    path: (string | number)[];
    /** null es un valor aceptado (y conserva su valor). */
    nullable?: boolean;
    /** Formatos válidos y el number que Zod debe entregar. */
    validos: [unknown, unknown][];
    /** Valores que violan la regla de dominio del campo y deben seguir rechazándose. */
    dominio: unknown[];
}

function campo(
    nombre: string,
    schema: Schema,
    base: Record<string, unknown>,
    key: string,
    reglas: Pick<CampoNumerico, 'validos' | 'dominio' | 'nullable'>,
): CampoNumerico {
    return { nombre, schema, build: (valor) => ({ ...base, [key]: valor }), leer: (data) => data[key], path: [key], ...reglas };
}

const NO_NEGATIVO: Pick<CampoNumerico, 'validos' | 'dominio'> = {
    validos: [[0, 0], [10, 10], [10.5, 10.5], ['10', 10], ['10.50', 10.5], ['0', 0]],
    dominio: [-1, '-1', -0.01],
};
// Lote.capacidad es Int en Prisma: sin decimales (2 y "2" válidos; 2.5 y "2.5" no). Sin máximo nuevo.
const ENTERO_NO_NEGATIVO: Pick<CampoNumerico, 'validos' | 'dominio'> = {
    validos: [[0, 0], [2, 2], ['2', 2], ['0', 0], [2147483647, 2147483647]],
    dominio: [-1, '-1', 2.5, '2.5', 0.1, 2147483648, '2147483648'],
};
const POSITIVO: Pick<CampoNumerico, 'validos' | 'dominio'> = {
    validos: [[1, 1], [10.5, 10.5], ['10', 10], ['10.50', 10.5]],
    dominio: [0, '0', -1, '-1'],
};
const ENTERO_POSITIVO: Pick<CampoNumerico, 'validos' | 'dominio'> = {
    validos: [[1, 1], [12, 12], ['12', 12], [2147483647, 2147483647]],
    dominio: [0, '0', -1, '-1', 1.5, '1.5', 2147483648, '2147483648'],
};

const loteBase = { numero: 1, fraccionId: 1, subestado: 'No Construido', tipo: 'Lote Venta', propietarioId: 1 };
const reservaBase = {
    fechaReserva: '2030-01-01T00:00:00.000Z',
    loteId: 1,
    clienteId: 1,
    numero: 'RES-001',
    ofertaInicial: 1000,
    fechaFinReserva: '2030-02-01T00:00:00.000Z',
};
const pagoBase = { cuotaId: 1, fechaPago: '2026-01-01T00:00:00.000Z', monto: 100, medioPago: 'EFECTIVO' };
const planBase = {
    nombre: 'Plan',
    tipoFinanciacion: 'CUOTAS_FIJAS',
    cantidadCuotas: 1,
    fechaInicio: '2026-11-01T00:00:00.000Z',
    cuotas: [{ numeroCuota: 1, tipoCuota: 'CUOTA', fechaVencimiento: '2026-12-01T00:00:00.000Z', montoOriginal: 100 }],
    moneda: 'ARS',
    montoTotalPlanificado: 100,
};
const cuotaDelPlan = (key: string) => (valor: unknown) => ({ ...planBase, cuotas: [{ ...planBase.cuotas[0], [key]: valor }] });

const CAMPOS: CampoNumerico[] = [
    // --- Lote ---
    campo('lote.create precio', createLoteSchema, loteBase, 'precio', NO_NEGATIVO),
    campo('lote.update precio', updateLoteSchema, {}, 'precio', NO_NEGATIVO),
    campo('lote.create superficie', createLoteSchema, loteBase, 'superficie', NO_NEGATIVO),
    campo('lote.update superficie', updateLoteSchema, {}, 'superficie', NO_NEGATIVO),
    campo('lote.create capacidad', createLoteSchema, loteBase, 'capacidad', ENTERO_NO_NEGATIVO),
    campo('lote.update capacidad', updateLoteSchema, {}, 'capacidad', ENTERO_NO_NEGATIVO),
    campo('lote.create numero', createLoteSchema, loteBase, 'numero', ENTERO_POSITIVO),
    campo('lote.update numero', updateLoteSchema, {}, 'numero', ENTERO_POSITIVO),
    campo('lote.create numeroCalle', createLoteSchema, loteBase, 'numeroCalle', ENTERO_POSITIVO),
    campo('lote.update numeroCalle', updateLoteSchema, {}, 'numeroCalle', ENTERO_POSITIVO),
    // numPartido hoy solo exige entero (sin positive): no se inventa un mínimo.
    campo('lote.create numPartido', createLoteSchema, loteBase, 'numPartido', {
        validos: [[62, 62], [70, 70], ['70', 70], [0, 0], [-5, -5], [2147483647, 2147483647]],
        dominio: [1.5, '1.5', 2147483648, '2147483648'],
    }),
    campo('lote.update numPartido', updateLoteSchema, {}, 'numPartido', {
        validos: [[62, 62], ['70', 70], [2147483647, 2147483647]],
        dominio: [1.5, '1.5', 2147483648, '2147483648'],
    }),
    // --- Reserva ---
    campo('reserva.create sena', createReservaSchema, reservaBase, 'sena', { ...NO_NEGATIVO, nullable: true }),
    campo('reserva.update sena', updateReservaSchema, { numero: 'RES-001' }, 'sena', { ...NO_NEGATIVO, nullable: true }),
    campo('reserva.create ofertaInicial', createReservaSchema, reservaBase, 'ofertaInicial', POSITIVO),
    campo('reserva.oferta monto', createOfertaSchema, {}, 'monto', POSITIVO),
    // --- Pagos: montos, y contadores (no son IDs: se conservan sus reglas de entero/positivo) ---
    campo('pago.registrar monto', registrarPagoSchema, pagoBase, 'monto', POSITIVO),
    campo('pago.recargo montoRecargo', aplicarRecargoSchema, { cuotaId: 1 }, 'montoRecargo', POSITIVO),
    campo('pago.plan montoTotalPlanificado', createPlanPagoSchema, planBase, 'montoTotalPlanificado', {
        validos: [[100, 100], ['100', 100], ['100.00', 100]],
        dominio: [0, '0', -1],
    }),
    campo('pago.plan montoAnticipo', createPlanPagoSchema, planBase, 'montoAnticipo', {
        validos: [[0, 0], ['0', 0]],
        dominio: [-1, '-1'],
    }),
    campo('pago.plan cantidadCuotas', createPlanPagoSchema, planBase, 'cantidadCuotas', {
        validos: [[1, 1], ['1', 1]],
        dominio: [0, '0', -1, 1.5, '1.5', 2147483648],
    }),
    campo('pago.reemplazar cantidadCuotas', reemplazarPlanPagoSchema, planBase, 'cantidadCuotas', {
        validos: [[1, 1], ['1', 1]],
        dominio: [0, '0', -1, 1.5],
    }),
    {
        nombre: 'pago.plan cuotas[].numeroCuota',
        schema: createPlanPagoSchema,
        build: cuotaDelPlan('numeroCuota'),
        leer: (data) => data.cuotas[0].numeroCuota,
        path: ['cuotas', 0, 'numeroCuota'],
        validos: [[1, 1], ['1', 1]],
        dominio: [0, '0', -1, 1.5, '1.5', 2147483648],
    },
    {
        nombre: 'pago.plan cuotas[].montoOriginal',
        schema: createPlanPagoSchema,
        build: cuotaDelPlan('montoOriginal'),
        leer: (data) => data.cuotas[0].montoOriginal,
        path: ['cuotas', 0, 'montoOriginal'],
        validos: [[100, 100], ['100', 100]],
        dominio: [0, '0', -1],
    },
    // --- Inmobiliaria (comxventa y userId tienen su describe propio) ---
    campo('inmobiliaria.create maxPrioridadesActivas', createInmobiliariaSchema, { nombre: 'Inmo', razonSocial: 'Inmo SA' }, 'maxPrioridadesActivas', {
        validos: [[0, 0], [5, 5], ['5', 5], [2147483647, 2147483647]],
        dominio: [-1, 1.5, '1.5', 2147483648],
        nullable: true,
    }),
    campo('inmobiliaria.update maxPrioridadesActivas', updateInmobiliariaSchema, { nombre: 'Inmo' }, 'maxPrioridadesActivas', {
        validos: [[0, 0], [5, 5], ['5', 5]],
        dominio: [-1, 1.5, '1.5', 2147483648],
        nullable: true,
    }),
    // --- Ubicación ---
    campo('ubicacion.create numero', createUbicacionSchema, { calle: 'Maca' }, 'numero', {
        validos: [[1, 1], [12, 12], ['12', 12]],
        dominio: [0, '0', -1, 1.5, '1.5', 2147483648],
    }),
    campo('ubicacion.update numero', updateUbicacionSchema, { calle: 'Maca' }, 'numero', {
        validos: [[1, 1], ['12', 12]],
        dominio: [0, '0', -1, 1.5, 2147483648],
    }),
    // --- Promoción ---
    campo('promocion precioPromocional', aplicarPromocionSchema, {}, 'precioPromocional', {
        validos: [[100, 100], [0.01, 0.01], ['100.5', 100.5]],
        dominio: [0, '0', -1, 0.001, '0.001'],
    }),
];

// Lo que z.coerce.number() convertía en 0, 1 o N.
const COERCIONES: unknown[] = [true, false, '', ' ', [], [7], {}, '1e2', '0x10', 'abc', NaN, Infinity];

const etiqueta = (valor: unknown) => (typeof valor === 'string' || Array.isArray(valor) ? JSON.stringify(valor) : typeof valor === 'object' && valor !== null ? '{}' : String(valor));

describe.each(CAMPOS)('$nombre', (c) => {
    test('rechaza las coerciones peligrosas (null, "", booleanos, arrays, exponencial, hex)', () => {
        const invalidos = c.nullable ? COERCIONES : [...COERCIONES, null];
        const aceptados = invalidos.filter((valor) => c.schema.safeParse(c.build(valor)).success).map(etiqueta);
        expect(aceptados).toEqual([]);
    });

    test('el error apunta al campo', () => {
        const result = c.schema.safeParse(c.build(true));
        expect(result.success).toBe(false);
        expect(result.error?.issues.some((i) => c.path.every((p, idx) => i.path[idx] === p))).toBe(true);
    });

    test('conserva su regla de dominio', () => {
        const aceptados = c.dominio.filter((valor) => c.schema.safeParse(c.build(valor)).success).map(etiqueta);
        expect(aceptados).toEqual([]);
    });

    test('acepta los formatos válidos y entrega un number', () => {
        const fallidos: string[] = [];
        for (const [entrada, esperado] of c.validos) {
            const result = c.schema.safeParse(c.build(entrada));
            if (!result.success || c.leer(result.data) !== esperado) fallidos.push(etiqueta(entrada));
        }
        expect(fallidos).toEqual([]);
    });

    if (c.nullable) {
        test('null conserva su semántica actual (nullable)', () => {
            const result = c.schema.safeParse(c.build(null));
            expect(result.success).toBe(true);
            expect(result.success && c.leer(result.data)).toBeNull();
        });
    }
});

// comxventa: decisión cerrada. null significa "sin comisión" y sale como 0 explícito; ya no
// depende de que z.coerce.number() convierta null en 0 por accidente.
describe.each([
    ['create', createInmobiliariaSchema, { nombre: 'Inmo', razonSocial: 'Inmo SA' }],
    ['update', updateInmobiliariaSchema, { nombre: 'Inmo' }],
] as [string, Schema, Record<string, unknown>][])('inmobiliaria.%s comxventa', (_modo, schema, base) => {
    const parse = (comxventa: unknown) => schema.safeParse({ ...base, comxventa });

    test('null significa "sin comisión": sale como 0 explícito', () => {
        const result = parse(null);
        expect(result.success).toBe(true);
        expect(result.data.comxventa).toBe(0);
    });

    test('ausente sigue siendo ausente (no se inventa un 0)', () => {
        const result = schema.safeParse(base);
        expect(result.success).toBe(true);
        expect(result.data).not.toHaveProperty('comxventa');
    });

    test.each([[0, 0], [5, 5], [5.5, 5.5], [100, 100], ['5', 5], ['5.5', 5.5], [' 7 ', 7], ['0', 0], ['100', 100]])(
        'acepta %p como %p (formatos que envía el frontend)',
        (entrada, esperado) => {
            const result = parse(entrada);
            expect(result.success).toBe(true);
            expect(result.data.comxventa).toBe(esperado);
        },
    );

    test.each([
        ['string vacío', ''],
        ['solo espacios', '   '],
        ['true', true],
        ['false', false],
        ['array vacío', []],
        ['array con número', [5]],
        ['objeto', {}],
        ['exponencial', '1e2'],
        ['hexadecimal', '0x10'],
        ['texto', 'abc'],
        ['NaN', NaN],
        ['negativo', -1],
        ['negativo string', '-1'],
        ['mayor a 100', 101],
        ['mayor a 100 string', '100.5'],
    ])('rechaza %s', (_label, entrada) => {
        const result = parse(entrada);
        expect(result.success).toBe(false);
        expect(result.error?.issues.some((i) => i.path[0] === 'comxventa')).toBe(true);
    });
});
