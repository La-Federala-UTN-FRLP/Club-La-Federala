// Adopción de la política de IDs del body (idDelBody) en cada módulo.
// El helper se prueba exhaustivamente en body.validation.test.ts; acá cada campo demuestra que
// lo usa: rechaza las coerciones peligrosas de z.coerce.number() y los fuera de rango int4,
// acepta el formato canónico entregando un number, y conserva su optional/nullable de antes.
import { createLoteSchema, updateLoteSchema } from '../../../src/validations/lote.validation';
import { createReservaSchema, updateReservaSchema } from '../../../src/validations/reserva.validation';
import { createPrioridadSchema, updatePrioridadSchema } from '../../../src/validations/prioridad.validation';
import { registrarPagoSchema, aplicarRecargoSchema } from '../../../src/validations/pago.validation';
import { createInmobiliariaSchema, updateInmobiliariaSchema } from '../../../src/validations/inmobiliaria.validation';
import { createPersonaSchema, updatePersonaSchema } from '../../../src/validations/persona.validation';
import { createVentaSchema, updateVentaSchema } from '../../../src/validations/venta.validation';

type Schema = { safeParse: (input: unknown) => { success: boolean; data?: any; error?: { issues: { path: PropertyKey[] }[] } } };

interface CampoId {
    nombre: string;
    schema: Schema;
    /** Arma el body con el valor bajo prueba en el campo. */
    build: (valor: unknown) => Record<string, unknown>;
    /** Lee el valor entregado por Zod. */
    leer: (data: any) => unknown;
    /** El campo acepta null (y entonces null no es un inválido). */
    nullable?: boolean;
    /** Ruta esperada del issue de error. */
    path: (string | number)[];
}

function campo(nombre: string, schema: Schema, base: Record<string, unknown>, key: string, opts: { nullable?: boolean } = {}): CampoId {
    return {
        nombre,
        schema,
        build: (valor) => ({ ...base, [key]: valor }),
        leer: (data) => data[key],
        nullable: opts.nullable,
        path: [key],
    };
}

const loteBase = { numero: 1, fraccionId: 1, subestado: 'No Construido', tipo: 'Lote Venta', propietarioId: 1 };
const reservaBase = {
    fechaReserva: '2030-01-01T00:00:00.000Z',
    loteId: 1,
    clienteId: 1,
    numero: 'RES-001',
    ofertaInicial: 1000,
    fechaFinReserva: '2030-02-01T00:00:00.000Z',
};
const prioridadBase = { numero: 'P-1', loteId: 1, fechaInicio: '2030-01-01T00:00:00.000Z', fechaFin: '2030-02-01T00:00:00.000Z' };
const pagoBase = { cuotaId: 1, fechaPago: '2026-01-01T00:00:00.000Z', monto: 100, medioPago: 'EFECTIVO' };
const inmobBase = { nombre: 'Inmo', razonSocial: 'Inmo SA' };
const personaBase = { identificadorTipo: 'DNI', identificadorValor: '12345678', nombre: 'Ana', apellido: 'Paz' };
const ventaBase = { loteId: 1, fechaVenta: '2025-12-01T18:00:00.000Z', monto: 100_000, tipoPago: 'CONTADO', compradorId: 10, numero: 'VENTA-001' };

const CAMPOS: CampoId[] = [
    // Lote: FKs obligatorias en create, todas opcionales en update (partial).
    campo('lote.create fraccionId', createLoteSchema, loteBase, 'fraccionId'),
    campo('lote.create propietarioId', createLoteSchema, loteBase, 'propietarioId'),
    campo('lote.create inquilinoId', createLoteSchema, loteBase, 'inquilinoId'),
    campo('lote.create ubicacionId', createLoteSchema, loteBase, 'ubicacionId'),
    campo('lote.update fraccionId', updateLoteSchema, {}, 'fraccionId'),
    campo('lote.update propietarioId', updateLoteSchema, {}, 'propietarioId'),
    campo('lote.update inquilinoId', updateLoteSchema, {}, 'inquilinoId'),
    campo('lote.update ubicacionId', updateLoteSchema, {}, 'ubicacionId'),
    // Reserva: inmobiliariaId es nullable (la vendió el club de campo, sin inmobiliaria).
    campo('reserva.create loteId', createReservaSchema, reservaBase, 'loteId'),
    campo('reserva.create clienteId', createReservaSchema, reservaBase, 'clienteId'),
    campo('reserva.create inmobiliariaId', createReservaSchema, reservaBase, 'inmobiliariaId', { nullable: true }),
    campo('reserva.update loteId', updateReservaSchema, { numero: 'RES-001' }, 'loteId'),
    campo('reserva.update clienteId', updateReservaSchema, { numero: 'RES-001' }, 'clienteId'),
    campo('reserva.update inmobiliariaId', updateReservaSchema, { numero: 'RES-001' }, 'inmobiliariaId', { nullable: true }),
    // Prioridad
    campo('prioridad.create loteId', createPrioridadSchema, prioridadBase, 'loteId'),
    campo('prioridad.create inmobiliariaId', createPrioridadSchema, prioridadBase, 'inmobiliariaId', { nullable: true }),
    campo('prioridad.update inmobiliariaId', updatePrioridadSchema, { numero: 'P-1' }, 'inmobiliariaId', { nullable: true }),
    // Pagos: cuotaId es una PK (numeroCuota y cantidadCuotas son contadores y se prueban aparte).
    campo('pago.registrar cuotaId', registrarPagoSchema, pagoBase, 'cuotaId'),
    campo('pago.recargo cuotaId', aplicarRecargoSchema, { montoRecargo: 10 }, 'cuotaId'),
    // Inmobiliaria: userId no es nullable.
    campo('inmobiliaria.create userId', createInmobiliariaSchema, inmobBase, 'userId'),
    campo('inmobiliaria.update userId', updateInmobiliariaSchema, { nombre: 'Inmo' }, 'userId'),
    // Persona: la nulabilidad actual se preserva (jefeDeFamiliaId no acepta null; inmobiliariaId sí).
    campo('persona.create jefeDeFamiliaId', createPersonaSchema, personaBase, 'jefeDeFamiliaId'),
    campo('persona.create inmobiliariaId', createPersonaSchema, personaBase, 'inmobiliariaId', { nullable: true }),
    campo('persona.update jefeDeFamiliaId', updatePersonaSchema, { nombre: 'Ana' }, 'jefeDeFamiliaId'),
    campo('persona.update inmobiliariaId', updatePersonaSchema, { nombre: 'Ana' }, 'inmobiliariaId', { nullable: true }),
    // Venta (#252): la política compartida no cambia su contrato; reservaId era la excepción (z.number()).
    campo('venta.create loteId', createVentaSchema, ventaBase, 'loteId'),
    campo('venta.create compradorId', createVentaSchema, ventaBase, 'compradorId'),
    campo('venta.create inmobiliariaId', createVentaSchema, ventaBase, 'inmobiliariaId'),
    campo('venta.create reservaId', createVentaSchema, ventaBase, 'reservaId', { nullable: true }),
    campo('venta.update loteId', updateVentaSchema, {}, 'loteId'),
    campo('venta.update compradorId', updateVentaSchema, {}, 'compradorId'),
    campo('venta.update inmobiliariaId', updateVentaSchema, {}, 'inmobiliariaId'),
    {
        nombre: 'venta.create compradores[].personaId',
        schema: createVentaSchema,
        build: (valor) => ({ ...ventaBase, compradorId: undefined, compradores: [{ personaId: valor }] }),
        leer: (data) => data.compradores?.[0]?.personaId,
        path: ['compradores', 0, 'personaId'],
    },
    {
        nombre: 'venta.update compradores[].personaId',
        schema: updateVentaSchema,
        build: (valor) => ({ compradores: [{ personaId: valor }] }),
        leer: (data) => data.compradores?.[0]?.personaId,
        path: ['compradores', 0, 'personaId'],
    },
];

// Representaciones que z.coerce.number() convertía en un ID "válido" o que desbordan un Int de Postgres.
const PELIGROSOS: unknown[] = [true, false, '', ' ', [], [7], {}, '1e2', '0x10', '007', '+5', '1.5', 0, -1, 1.5, NaN, 2147483648, '2147483648'];
const VALIDOS: [unknown, number][] = [[1, 1], [12, 12], ['1', 1], ['12', 12], [2147483647, 2147483647], ['2147483647', 2147483647]];

const etiqueta = (valor: unknown) => (typeof valor === 'string' ? JSON.stringify(valor) : Array.isArray(valor) ? JSON.stringify(valor) : typeof valor === 'object' && valor !== null ? '{}' : String(valor));

describe.each(CAMPOS)('$nombre', (c) => {
    test('rechaza coerciones peligrosas y fuera de rango int4', () => {
        const invalidos = c.nullable ? PELIGROSOS : [...PELIGROSOS, null];
        const aceptados = invalidos.filter((valor) => c.schema.safeParse(c.build(valor)).success).map(etiqueta);
        expect(aceptados).toEqual([]);
    });

    test('el error apunta al campo', () => {
        const result = c.schema.safeParse(c.build(true));
        expect(result.success).toBe(false);
        expect(result.error?.issues.some((i) => c.path.every((p, idx) => i.path[idx] === p))).toBe(true);
    });

    test('acepta el formato canónico y entrega un number', () => {
        const fallidos: string[] = [];
        for (const [entrada, esperado] of VALIDOS) {
            const result = c.schema.safeParse(c.build(entrada));
            if (!result.success || c.leer(result.data) !== esperado) fallidos.push(etiqueta(entrada));
        }
        expect(fallidos).toEqual([]);
    });

    if (c.nullable) {
        test('null sigue siendo válido (nullable preservado)', () => {
            const result = c.schema.safeParse(c.build(null));
            expect(result.success).toBe(true);
            expect(result.success && c.leer(result.data)).toBeNull();
        });
    }
});
