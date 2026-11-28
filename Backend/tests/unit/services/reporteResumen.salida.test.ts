// Validación de la salida del resumen con IA (CCLF-37, tarea 40.3): esquema, normalización de cifras
// y reglas de porcentajes, emails y enlaces. Funciones puras, sin red ni Prisma.
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { ResumenEntrada } from '../../../src/services/aiSummary.service';
import {
    canonica,
    cifrasDeEntrada,
    contarCifrasAjenas,
    lecturasDeCifra,
    validarSalidaResumen,
} from '../../../src/services/reporteResumen.salida';

// Ejemplo de entrada de la especificación V4.
const ENTRADA: ResumenEntrada = {
    corte: '2026-11-20',
    periodo: { desde: '2026-11-01', hasta: '2026-11-20' },
    inventario: { ofrecibles: 41, porEstado: { DISPONIBLE: 38, EN_PROMOCION: 3, RESERVADO: 7, VENDIDO: 112 } },
    ventas: {
        iniciadas: { cantidad: 3, montoUSD: '255000.00', cantidadAnterior: 5 },
        escrituradas: { cantidad: 2 },
        canceladas: { cantidad: 1 },
    },
    cuotasVencidas: { moneda: 'USD', saldo: '7200.00', cuotas: 10, porFraccion: { '2': '4800.00', '3': '1800.00', '1': '600.00' } },
};

const PERMITIDAS = cifrasDeEntrada(ENTRADA);
const ajenas = (texto: string) => contarCifrasAjenas(texto, PERMITIDAS);

const salida = (texto: string, extra: Record<string, unknown> = {}) => ({
    texto,
    puntos: [{ tema: 'Comercial', detalle: 'Se iniciaron 3 ventas.', enlace: '/reportes' }],
    datosFaltantes: ['No hay ventas en ARS en la entrada.'],
    ...extra,
});

describe('canonica', () => {
    test.each([
        [['255000', '00'], '255000'],
        [['007', ''], '7'],
        [['0', '01'], '0.01'],
        [['0', ''], '0'],
        [['4051', '090'], '4051.09'],
    ])('%j → %s', ([entero, decimales], esperado) => {
        expect(canonica(entero, decimales)).toBe(esperado);
    });
});

describe('lecturasDeCifra: los dos formatos y sin ceros sobrantes', () => {
    test.each([
        ['255000.00', ['255000']],
        ['255.000,00', ['255000']],
        ['255,000.00', ['255000']],
        ['1.234.567', ['1234567']],
        ['1.234.567,89', ['1234567.89']],
        ['4051.09', ['4051.09']],
        ['4051,09', ['4051.09']],
        ['0.01', ['0.01']],
        ['41', ['41']],
        ['007', ['7']],
    ])('%s → %j', (token, esperado) => {
        expect(lecturasDeCifra(token)).toEqual(esperado);
    });

    test.each([
        ['7.200', ['7200', '7.2']],
        ['1,500', ['1500', '1.5']],
    ])('ambiguo %s: miles o decimal → %j', (token, esperado) => {
        expect(lecturasDeCifra(token).sort()).toEqual([...esperado].sort());
    });

    test.each(['1.23.4', '12.34,5.6', '1,2,3', '1234.567.89'])('mal formado %s → sin lecturas', (token) => {
        expect(lecturasDeCifra(token)).toEqual([]);
    });
});

describe('cifrasDeEntrada', () => {
    test('toma valores, montos, claves de porFraccion y partes de las fechas', () => {
        for (const n of ['41', '38', '3', '7', '112', '255000', '5', '2', '1', '7200', '10', '4800', '1800', '600']) {
            expect(PERMITIDAS.numeros.has(n)).toBe(true);
        }
        expect([...PERMITIDAS.fechas].sort()).toEqual(['2026-11-01', '2026-11-20']);
        // Día, mes y año sueltos de las fechas.
        for (const n of ['2026', '11', '20']) expect(PERMITIDAS.numeros.has(n)).toBe(true);
    });
});

describe('contarCifrasAjenas', () => {
    test('cifras de la entrada en cualquier formato → 0', () => {
        expect(ajenas('Se iniciaron 3 ventas por USD 255.000,00 y antes 5.')).toBe(0);
        expect(ajenas('Saldo vencido: 7200.00 (7.200 en total), 4800,00 en la fracción 2.')).toBe(0);
        expect(ajenas('Hay 41 lotes ofrecibles y 112 vendidos.')).toBe(0);
    });

    test('fechas completas: tienen que ser de la entrada', () => {
        expect(ajenas('Corte al 2026-11-20, período desde 01/11/2026.')).toBe(0);
        expect(ajenas('Al 20/11/2026 hay 41 lotes.')).toBe(0);
        expect(ajenas('Al 2026-11-21 hay 41 lotes.')).toBe(1);
        expect(ajenas('Al 21/11/2026 hay 41 lotes.')).toBe(1);
    });

    test('día, mes y año sueltos de las fechas de la entrada se aceptan', () => {
        expect(ajenas('Del 1 al 20 de noviembre de 2026 se iniciaron 3 ventas.')).toBe(0);
    });

    test('cifras inventadas se cuentan (sin devolverlas)', () => {
        expect(ajenas('Se iniciaron 4 ventas por USD 260000.00.')).toBe(2);
        expect(ajenas('El saldo bajó 2400.00 respecto del mes anterior.')).toBe(1);
        expect(ajenas('Del 1 al 25 de noviembre.')).toBe(1);
    });

    test('el punto final de una oración no es separador decimal', () => {
        expect(ajenas('Se canceló 1. Se escrituraron 2.')).toBe(0);
    });
});

describe('validarSalidaResumen', () => {
    test('salida válida → ok con la salida parseada', () => {
        const r = validarSalidaResumen(salida('Se iniciaron 3 ventas por USD 255000.00.'), ENTRADA);
        expect(r).toEqual({ ok: true, salida: salida('Se iniciaron 3 ventas por USD 255000.00.'), cifrasRechazadas: 0 });
    });

    test('cifra inventada en texto, detalle o datosFaltantes → cifras', () => {
        expect(validarSalidaResumen(salida('Se iniciaron 9 ventas.'), ENTRADA)).toEqual({ ok: false, motivo: 'cifras', cifrasRechazadas: 1 });
        expect(
            validarSalidaResumen(salida('Ok.', { puntos: [{ tema: 'Cobranzas', detalle: 'Vencido 999.99', enlace: '/reportes' }] }), ENTRADA),
        ).toMatchObject({ ok: false, motivo: 'cifras', cifrasRechazadas: 1 });
        expect(validarSalidaResumen(salida('Ok.', { datosFaltantes: ['Faltan 13 cuotas'] }), ENTRADA)).toMatchObject({
            ok: false,
            motivo: 'cifras',
        });
    });

    test.each(['Las ventas cayeron un 40%.', 'Las ventas cayeron 40 por ciento.', 'Cayeron un 40 %.'])(
        'porcentaje "%s" → porcentaje',
        (texto) => {
            expect(validarSalidaResumen(salida(texto), ENTRADA)).toMatchObject({ ok: false, motivo: 'porcentaje' });
        },
    );

    test('porcentaje con una cifra que sí está en la entrada también se rechaza', () => {
        expect(validarSalidaResumen(salida('El 3% de los lotes.'), ENTRADA)).toEqual({ ok: false, motivo: 'porcentaje', cifrasRechazadas: 0 });
    });

    test('email → email', () => {
        expect(validarSalidaResumen(salida('Contactar a cliente@example.com.'), ENTRADA)).toMatchObject({ ok: false, motivo: 'email' });
    });

    test.each([
        ['sin texto', { texto: '' }],
        ['texto solo con espacios', { texto: '   ' }],
        ['sin puntos', { puntos: undefined }],
        ['tema fuera del enum', { puntos: [{ tema: 'Ventas', detalle: 'x', enlace: '/reportes' }] }],
        ['detalle vacío', { puntos: [{ tema: 'Comercial', detalle: '', enlace: '/reportes' }] }],
        ['sin datosFaltantes', { datosFaltantes: undefined }],
        ['datosFaltantes con no string', { datosFaltantes: [3] }],
    ])('esquema: %s → esquema', (_caso, extra) => {
        expect(validarSalidaResumen(salida('Ok.', extra), ENTRADA)).toEqual({ ok: false, motivo: 'esquema', cifrasRechazadas: 0 });
    });

    test.each(['/reportes', '/reportes?moneda=USD&fraccion=7', '/reportes/ventas', '/reportes#cuotas'])('enlace interno %s → ok', (enlace) => {
        const r = validarSalidaResumen(salida('Ok.', { puntos: [{ tema: 'Inventario', detalle: 'Hay 41.', enlace }] }), ENTRADA);
        expect(r.ok).toBe(true);
    });

    test.each([
        'https://example.com/reportes',
        '//example.com/reportes',
        '/reportesx',
        '/ventas?openId=1',
        '/reportes/../usuarios',
        '/reportes//x',
        '/reportes\\x',
        '/reportes con espacio',
        'javascript:alert(1)',
        '',
    ])('enlace %s → esquema', (enlace) => {
        const r = validarSalidaResumen(salida('Ok.', { puntos: [{ tema: 'Inventario', detalle: 'Hay 41.', enlace }] }), ENTRADA);
        expect(r).toEqual({ ok: false, motivo: 'esquema', cifrasRechazadas: 0 });
    });

    test('no es un objeto → esquema', () => {
        expect(validarSalidaResumen(null, ENTRADA)).toMatchObject({ ok: false, motivo: 'esquema' });
        expect(validarSalidaResumen([], ENTRADA)).toMatchObject({ ok: false, motivo: 'esquema' });
    });

    test('el ejemplo 200 de la OpenAPI pasa la validación con la entrada de la V4', () => {
        const spec = YAML.parse(fs.readFileSync(path.resolve(__dirname, '../../../documents/documentacionApi.yaml'), 'utf8'));
        const ejemplo = spec.paths['/reportes/resumen'].post.responses['200'].content['application/json'].example.data;
        const { texto, puntos, datosFaltantes } = ejemplo;
        expect(validarSalidaResumen({ texto, puntos, datosFaltantes }, ENTRADA)).toMatchObject({ ok: true });
    });
});
