// Contrato HTTP de los números del body (política de body.validation.ts) y de los IDs multipart.
// Regresión: z.coerce.number() y Number(...) convertían true, [7], "1e2" o "0x10" en IDs/montos
// "válidos", y un ID mayor a int4 llegaba hasta Prisma y terminaba en 500.
jest.mock('../../../src/services/lote.service', () => ({ createLote: jest.fn(), updatedLote: jest.fn() }));
jest.mock('../../../src/services/reserva.service', () => ({ createReserva: jest.fn(), updateReserva: jest.fn() }));
jest.mock('../../../src/services/prioridad.service', () => ({ createPrioridad: jest.fn(), updatePrioridad: jest.fn() }));
jest.mock('../../../src/services/pago.service', () => ({
    registrarPagoEnVenta: jest.fn(),
    aplicarRecargoManualEnVenta: jest.fn(),
    createPlanPagoInicial: jest.fn(),
}));
jest.mock('../../../src/services/inmobiliaria.service', () => ({ createInmobiliaria: jest.fn(), updateInmobiliaria: jest.fn() }));
jest.mock('../../../src/services/venta.service', () => ({ createVenta: jest.fn(), updateVenta: jest.fn() }));
jest.mock('../../../src/services/ubicacion.service', () => ({ createUbicacion: jest.fn(), updateUbicacion: jest.fn() }));
jest.mock('../../../src/services/file.service', () => ({ uploadFileToSupabase: jest.fn(), saveFileMetadata: jest.fn() }));
jest.mock('../../../src/utils/file.validation.utils', () => ({ ensureVentaPerteneceALote: jest.fn() }));

import request from 'supertest';
import app from '../../../src/app';
import * as loteService from '../../../src/services/lote.service';
import * as reservaService from '../../../src/services/reserva.service';
import * as prioridadService from '../../../src/services/prioridad.service';
import * as pagoService from '../../../src/services/pago.service';
import * as inmobiliariaService from '../../../src/services/inmobiliaria.service';
import * as ventaService from '../../../src/services/venta.service';
import * as ubicacionService from '../../../src/services/ubicacion.service';
import * as fileService from '../../../src/services/file.service';
import { ensureVentaPerteneceALote } from '../../../src/utils/file.validation.utils';
import { PersonaService } from '../../../src/services/persona.service';
import { authHeader, useTestWebEnv } from '../../support/http';

const m = (fn: unknown) => fn as jest.Mock;
const personaCreateSpy = jest.spyOn(PersonaService.prototype, 'create');

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');

const MOCKS = [
    loteService.createLote,
    loteService.updatedLote,
    reservaService.createReserva,
    reservaService.updateReserva,
    prioridadService.createPrioridad,
    pagoService.registrarPagoEnVenta,
    pagoService.aplicarRecargoManualEnVenta,
    pagoService.createPlanPagoInicial,
    inmobiliariaService.createInmobiliaria,
    inmobiliariaService.updateInmobiliaria,
    ventaService.createVenta,
    ubicacionService.createUbicacion,
    fileService.uploadFileToSupabase,
    fileService.saveFileMetadata,
    ensureVentaPerteneceALote,
];

beforeEach(() => {
    MOCKS.forEach((fn) => m(fn).mockReset().mockResolvedValue({ id: 1 }));
    personaCreateSpy.mockReset().mockResolvedValue({ id: 1 } as any);
});

afterAll(() => {
    jest.restoreAllMocks();
});

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

type Metodo = 'post' | 'put';
interface RutaBody {
    nombre: string;
    metodo: Metodo;
    url: string;
    base: Record<string, unknown>;
    campo: string;
    servicio: () => jest.Mock;
}

// Una ruta por módulo con ID de body (los esquemas se prueban campo por campo en validations/).
const RUTAS_ID: RutaBody[] = [
    { nombre: 'POST /lotes propietarioId', metodo: 'post', url: '/api/lotes', base: loteBase, campo: 'propietarioId', servicio: () => m(loteService.createLote) },
    { nombre: 'POST /lotes fraccionId', metodo: 'post', url: '/api/lotes', base: loteBase, campo: 'fraccionId', servicio: () => m(loteService.createLote) },
    { nombre: 'PUT /lotes/:id inquilinoId', metodo: 'put', url: '/api/lotes/1', base: {}, campo: 'inquilinoId', servicio: () => m(loteService.updatedLote) },
    { nombre: 'POST /reservas loteId', metodo: 'post', url: '/api/reservas', base: reservaBase, campo: 'loteId', servicio: () => m(reservaService.createReserva) },
    { nombre: 'POST /reservas clienteId', metodo: 'post', url: '/api/reservas', base: reservaBase, campo: 'clienteId', servicio: () => m(reservaService.createReserva) },
    { nombre: 'POST /reservas inmobiliariaId', metodo: 'post', url: '/api/reservas', base: reservaBase, campo: 'inmobiliariaId', servicio: () => m(reservaService.createReserva) },
    { nombre: 'POST /prioridades loteId', metodo: 'post', url: '/api/prioridades', base: prioridadBase, campo: 'loteId', servicio: () => m(prioridadService.createPrioridad) },
    { nombre: 'POST /ventas/:id/pagos cuotaId', metodo: 'post', url: '/api/ventas/5/pagos', base: pagoBase, campo: 'cuotaId', servicio: () => m(pagoService.registrarPagoEnVenta) },
    { nombre: 'POST /ventas/:id/pagos/recargo cuotaId', metodo: 'post', url: '/api/ventas/5/pagos/recargo', base: { montoRecargo: 10 }, campo: 'cuotaId', servicio: () => m(pagoService.aplicarRecargoManualEnVenta) },
    { nombre: 'POST /inmobiliarias userId', metodo: 'post', url: '/api/inmobiliarias', base: inmobBase, campo: 'userId', servicio: () => m(inmobiliariaService.createInmobiliaria) },
    { nombre: 'PUT /inmobiliarias/:id userId', metodo: 'put', url: '/api/inmobiliarias/5', base: { nombre: 'Inmo' }, campo: 'userId', servicio: () => m(inmobiliariaService.updateInmobiliaria) },
    { nombre: 'POST /personas jefeDeFamiliaId', metodo: 'post', url: '/api/personas', base: personaBase, campo: 'jefeDeFamiliaId', servicio: () => personaCreateSpy as unknown as jest.Mock },
    { nombre: 'POST /personas inmobiliariaId', metodo: 'post', url: '/api/personas', base: personaBase, campo: 'inmobiliariaId', servicio: () => personaCreateSpy as unknown as jest.Mock },
    { nombre: 'POST /ventas loteId', metodo: 'post', url: '/api/ventas', base: ventaBase, campo: 'loteId', servicio: () => m(ventaService.createVenta) },
    { nombre: 'POST /ventas reservaId', metodo: 'post', url: '/api/ventas', base: ventaBase, campo: 'reservaId', servicio: () => m(ventaService.createVenta) },
];

describe.each(RUTAS_ID)('$nombre', (r) => {
    // true, [7] y "1e2" eran IDs válidos con z.coerce.number(); 2147483648 y "2147483648" desbordan int4.
    test.each([[true], [[7]], ['1e2'], ['0x10'], [2147483648], ['2147483648']])('%j responde 400 sin llamar al service', async (valor) => {
        const res = await request(app)[r.metodo](r.url).set(ADMIN).send({ ...r.base, [r.campo]: valor });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Datos inválidos');
        expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: expect.stringContaining(r.campo) })]));
        expect(r.servicio()).not.toHaveBeenCalled();
    });
});

describe('IDs válidos del body llegan al service como number', () => {
    test('POST /lotes: "7" → 7 y montos decimales → number', async () => {
        const res = await request(app).post('/api/lotes').set(ADMIN).send({ ...loteBase, propietarioId: '7', precio: '1500.5', superficie: 300 });
        expect(res.status).toBe(201);
        expect(m(loteService.createLote)).toHaveBeenCalledWith(expect.objectContaining({ propietarioId: 7, precio: 1500.5, superficie: 300 }));
    });

    test('POST /reservas conserva inmobiliariaId: null (nullable)', async () => {
        await request(app).post('/api/reservas').set(ADMIN).send({ ...reservaBase, inmobiliariaId: null, sena: null });
        expect(m(reservaService.createReserva)).toHaveBeenCalledWith(
            expect.objectContaining({ loteId: 1, clienteId: 1, inmobiliariaId: null, sena: null }),
            expect.anything(),
        );
    });

    test('POST /personas: IDs numéricos como string llegan como number y null se conserva', async () => {
        await request(app).post('/api/personas').set(ADMIN).send({ ...personaBase, jefeDeFamiliaId: '9', inmobiliariaId: null });
        expect(personaCreateSpy).toHaveBeenCalledWith(
            expect.objectContaining({ jefeDeFamiliaId: 9, inmobiliariaId: null }),
            expect.anything(),
        );
    });

    test('POST /ventas: reservaId "5" → 5 y null se conserva', async () => {
        await request(app).post('/api/ventas').set(ADMIN).send({ ...ventaBase, reservaId: '5' });
        expect(m(ventaService.createVenta)).toHaveBeenCalledWith(expect.objectContaining({ reservaId: 5, loteId: 1, compradorId: 10 }));
        m(ventaService.createVenta).mockClear();
        await request(app).post('/api/ventas').set(ADMIN).send({ ...ventaBase, reservaId: null });
        expect(m(ventaService.createVenta)).toHaveBeenCalledWith(expect.objectContaining({ reservaId: null }));
    });
});

describe('números no-ID del body', () => {
    test.each([
        ['precio', null],
        ['superficie', ''],
        ['capacidad', false],
        ['precio', true],
        ['capacidad', [7]],
        ['superficie', '1e2'],
    ])('PUT /lotes/:id %s=%j responde 400 en vez de convertirse en 0/1/N', async (campo, valor) => {
        const res = await request(app).put('/api/lotes/1').set(ADMIN).send({ [campo]: valor });
        expect(res.status).toBe(400);
        expect(m(loteService.updatedLote)).not.toHaveBeenCalled();
    });

    // Lote.capacidad es Int en Prisma: un decimal no puede persistirse, se rechaza antes del service.
    test.each([[2.5], ['2.5']])('PUT /lotes/:id capacidad=%j responde 400 (Int en Prisma)', async (valor) => {
        const res = await request(app).put('/api/lotes/1').set(ADMIN).send({ capacidad: valor });
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'capacidad' })]));
        expect(m(loteService.updatedLote)).not.toHaveBeenCalled();
    });

    test.each([[2], ['2']])('PUT /lotes/:id capacidad=%j llega al service como 2', async (valor) => {
        await request(app).put('/api/lotes/1').set(ADMIN).send({ capacidad: valor });
        expect(m(loteService.updatedLote)).toHaveBeenCalledWith(1, { capacidad: 2 }, 'ADMINISTRADOR');
    });

    // Overflow int4 de los Int no-ID de Lote (capacidad, numPartido): 2147483648 no llega al service/Prisma.
    test.each([['capacidad'], ['numPartido']])('PUT /lotes/:id %s: INT4_MAX es válido y INT4_MAX + 1 responde 400', async (campo) => {
        const ok = await request(app).put('/api/lotes/1').set(ADMIN).send({ [campo]: 2147483647 });
        expect(ok.status).toBe(200);
        expect(m(loteService.updatedLote)).toHaveBeenCalledWith(1, { [campo]: 2147483647 }, 'ADMINISTRADOR');
        m(loteService.updatedLote).mockClear();

        for (const desbordado of [2147483648, '2147483648']) {
            const res = await request(app).put('/api/lotes/1').set(ADMIN).send({ [campo]: desbordado });
            expect(res.status).toBe(400);
            expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: campo })]));
        }
        expect(m(loteService.updatedLote)).not.toHaveBeenCalled();
    });

    // precio vacío en los formularios vivos (LoteCrearCard/LoteEditarCard) significa "no informar":
    // el frontend omite la clave. Ausente se mantiene ausente (no se convierte en 0 ni en null).
    test('PUT /lotes/:id sin precio no envía la clave al service', async () => {
        await request(app).put('/api/lotes/1').set(ADMIN).send({ subestado: 'Construido' });
        const [, data] = m(loteService.updatedLote).mock.calls[0];
        expect(data).not.toHaveProperty('precio');
    });

    test('POST /lotes de Espacio Comun sin precio no envía la clave al service', async () => {
        await request(app)
            .post('/api/lotes')
            .set(ADMIN)
            .send({ ...loteBase, tipo: 'Espacio Comun', nombreEspacioComun: 'SUM', capacidad: 100 });
        const [data] = m(loteService.createLote).mock.calls[0];
        expect(data).not.toHaveProperty('precio');
        expect(data.capacidad).toBe(100);
    });

    test('PUT /lotes/:id conserva 0 y los decimales válidos', async () => {
        await request(app).put('/api/lotes/1').set(ADMIN).send({ precio: 0, superficie: '250.75', capacidad: 0 });
        expect(m(loteService.updatedLote)).toHaveBeenCalledWith(1, { precio: 0, superficie: 250.75, capacidad: 0 }, 'ADMINISTRADOR');
    });

    test('POST /reservas: ofertaInicial true no se convierte en 1', async () => {
        const res = await request(app).post('/api/reservas').set(ADMIN).send({ ...reservaBase, ofertaInicial: true });
        expect(res.status).toBe(400);
        expect(m(reservaService.createReserva)).not.toHaveBeenCalled();
    });

    test('POST /ventas/:id/pagos: monto "1e2" no se convierte en 100', async () => {
        const res = await request(app).post('/api/ventas/5/pagos').set(ADMIN).send({ ...pagoBase, monto: '1e2' });
        expect(res.status).toBe(400);
        expect(m(pagoService.registrarPagoEnVenta)).not.toHaveBeenCalled();
    });

    test('POST /ubicaciones: numero null no se convierte en 0 (ni llega al service)', async () => {
        const res = await request(app).post('/api/ubicaciones').set(ADMIN).send({ calle: 'Maca', numero: null });
        expect(res.status).toBe(400);
        expect(m(ubicacionService.createUbicacion)).not.toHaveBeenCalled();
    });
});

describe('inmobiliaria: comxventa', () => {
    test('POST con comxventa null llega al service como 0 explícito', async () => {
        const res = await request(app).post('/api/inmobiliarias').set(ADMIN).send({ ...inmobBase, comxventa: null });
        expect(res.status).toBe(201);
        expect(m(inmobiliariaService.createInmobiliaria)).toHaveBeenCalledWith(expect.objectContaining({ comxventa: 0 }));
    });

    test('PUT con comxventa null llega como 0 (limpiar la comisión)', async () => {
        await request(app).put('/api/inmobiliarias/5').set(ADMIN).send({ comxventa: null });
        expect(m(inmobiliariaService.updateInmobiliaria)).toHaveBeenCalledWith(5, { comxventa: 0 });
    });

    test.each([[7.5, 7.5], ['7.5', 7.5], ['0', 0]])('PUT con comxventa %j llega como %j', async (entrada, esperado) => {
        await request(app).put('/api/inmobiliarias/5').set(ADMIN).send({ comxventa: entrada });
        expect(m(inmobiliariaService.updateInmobiliaria)).toHaveBeenCalledWith(5, { comxventa: esperado });
    });

    test.each([[''], [true], [false], [[]], [{}], ['1e2'], ['abc'], [101], [-1]])('PUT con comxventa %j responde 400 sin llamar al service', async (valor) => {
        const res = await request(app).put('/api/inmobiliarias/5').set(ADMIN).send({ comxventa: valor });
        expect(res.status).toBe(400);
        expect(m(inmobiliariaService.updateInmobiliaria)).not.toHaveBeenCalled();
    });
});

// En multipart todo llega como string. Number()/parseInt() aceptaban "1e2" (100), "0x10" (16) y
// "007" (7); ahora se exige el decimal canónico y el controller recibe numbers.
describe('POST /api/files — IDs multipart', () => {
    const PDF = { buffer: Buffer.from('%PDF-1.4'), filename: 'doc.pdf', contentType: 'application/pdf' };
    const upload = (campos: Record<string, string>) => {
        let req = request(app).post('/api/files').set(ADMIN);
        for (const [k, v] of Object.entries(campos)) req = req.field(k, v);
        return req.attach('file', PDF.buffer, { filename: PDF.filename, contentType: PDF.contentType });
    };

    test.each([['1e2'], ['0x10'], ['007'], ['+5'], ['1.5'], ['0'], ['-1'], ['2147483648'], [''], ['abc']])(
        'idLoteAsociado=%j responde 400 sin subir el archivo',
        async (valor) => {
            const res = await upload({ tipo: 'IMAGEN', idLoteAsociado: valor });
            expect(res.status).toBe(400);
            expect(m(fileService.uploadFileToSupabase)).not.toHaveBeenCalled();
            expect(m(fileService.saveFileMetadata)).not.toHaveBeenCalled();
        },
    );

    test.each([['1e2'], ['0x10'], ['007'], ['+5'], ['1.5'], ['0'], ['-1'], ['2147483648']])(
        'ventaId=%j responde 400 sin subir el archivo',
        async (valor) => {
            const res = await upload({ tipo: 'BOLETO', idLoteAsociado: '5', ventaId: valor });
            expect(res.status).toBe(400);
            expect(m(ensureVentaPerteneceALote)).not.toHaveBeenCalled();
            expect(m(fileService.uploadFileToSupabase)).not.toHaveBeenCalled();
        },
    );

    test('idLoteAsociado canónico llega como number al service', async () => {
        const res = await upload({ tipo: 'IMAGEN', idLoteAsociado: '5' });
        expect(res.status).toBe(201);
        expect(m(fileService.saveFileMetadata)).toHaveBeenCalledWith(
            expect.objectContaining({ idLoteAsociado: 5, ventaId: null, tipo: 'IMAGEN' }),
        );
        expect(typeof m(fileService.saveFileMetadata).mock.calls[0][0].idLoteAsociado).toBe('number');
    });

    test('ventaId canónico llega como number y se valida contra el lote', async () => {
        const res = await upload({ tipo: 'BOLETO', idLoteAsociado: '5', ventaId: '7' });
        expect(res.status).toBe(201);
        expect(m(ensureVentaPerteneceALote)).toHaveBeenCalledWith(7, 5);
        expect(m(fileService.saveFileMetadata)).toHaveBeenCalledWith(expect.objectContaining({ idLoteAsociado: 5, ventaId: 7 }));
    });

    test('ventaId vacío se toma como ausente (comportamiento actual del multipart)', async () => {
        const res = await upload({ tipo: 'IMAGEN', idLoteAsociado: '5', ventaId: '' });
        expect(res.status).toBe(201);
        expect(m(fileService.saveFileMetadata)).toHaveBeenCalledWith(expect.objectContaining({ ventaId: null }));
    });

    // Reglas de dominio: siguen en el controller, no son validación estructural.
    test('BOLETO sin ventaId responde 400 con la regla de dominio', async () => {
        const res = await upload({ tipo: 'BOLETO', idLoteAsociado: '5' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Para tipo BOLETO se requiere ventaId');
    });

    test('PLANO con ventaId responde 400 con la regla de dominio', async () => {
        const res = await upload({ tipo: 'PLANO', idLoteAsociado: '5', ventaId: '7' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Para tipo PLANO no se permite ventaId');
    });

    test('un campo repetido (array) no es un ID', async () => {
        const res = await request(app)
            .post('/api/files')
            .set(ADMIN)
            .field('tipo', 'IMAGEN')
            .field('idLoteAsociado', '5')
            .field('idLoteAsociado', '6')
            .attach('file', PDF.buffer, { filename: PDF.filename, contentType: PDF.contentType });
        expect(res.status).toBe(400);
        expect(m(fileService.saveFileMetadata)).not.toHaveBeenCalled();
    });
});
