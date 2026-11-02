// Updates parciales (PUT/PATCH): un body que no modifica nada responde 400 antes de llegar al service.
// Regresión: PUT /lotes, /ventas, /usuarios, /ubicaciones, /personas y /fracciones aceptaban {} y lo
// pasaban al service (200 sin cambios, o un update vacío contra Prisma). También valía para un body con
// solo claves desconocidas: Zod las descarta (strip) y el resultado validado quedaba en {}.
// La política de claves desconocidas no cambia (no hay .strict()): una clave ajena junto a un campo
// real sigue siendo válida y se descarta.
jest.mock('../../../src/services/lote.service', () => ({ updatedLote: jest.fn() }));
jest.mock('../../../src/services/venta.service', () => ({ updateVenta: jest.fn() }));
jest.mock('../../../src/services/usuario.service', () => ({ updateUser: jest.fn() }));
jest.mock('../../../src/services/ubicacion.service', () => ({ updateUbicacion: jest.fn() }));
jest.mock('../../../src/services/fraccion.service', () => ({ updateFraccion: jest.fn() }));
jest.mock('../../../src/services/reserva.service', () => ({ updateReserva: jest.fn() }));
jest.mock('../../../src/services/inmobiliaria.service', () => ({ updateInmobiliaria: jest.fn() }));
jest.mock('../../../src/services/prioridad.service', () => ({ updatePrioridad: jest.fn() }));

import request from 'supertest';
import app from '../../../src/app';
import * as loteService from '../../../src/services/lote.service';
import * as ventaService from '../../../src/services/venta.service';
import * as usuarioService from '../../../src/services/usuario.service';
import * as ubicacionService from '../../../src/services/ubicacion.service';
import * as fraccionService from '../../../src/services/fraccion.service';
import * as reservaService from '../../../src/services/reserva.service';
import * as inmobiliariaService from '../../../src/services/inmobiliaria.service';
import * as prioridadService from '../../../src/services/prioridad.service';
import { PersonaService } from '../../../src/services/persona.service';
import { authHeader, useTestWebEnv } from '../../support/http';

const m = (fn: unknown) => fn as jest.Mock;
const personaUpdateSpy = jest.spyOn(PersonaService.prototype, 'update');

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');

const SERVICIOS = [
    loteService.updatedLote,
    ventaService.updateVenta,
    usuarioService.updateUser,
    ubicacionService.updateUbicacion,
    fraccionService.updateFraccion,
    reservaService.updateReserva,
    inmobiliariaService.updateInmobiliaria,
    prioridadService.updatePrioridad,
];

beforeEach(() => {
    SERVICIOS.forEach((fn) => m(fn).mockReset().mockResolvedValue({ id: 1 }));
    personaUpdateSpy.mockReset().mockResolvedValue({ persona: { id: 1 }, message: 'ok' } as any);
});

afterAll(() => {
    jest.restoreAllMocks();
});

type Metodo = 'put' | 'patch';
interface UpdateParcial {
    nombre: string;
    metodo: Metodo;
    url: string;
    /** Campo real del contrato: con él el update sigue llegando al service. */
    valido: Record<string, unknown>;
    servicio: () => jest.Mock;
}

const UPDATES: UpdateParcial[] = [
    // Antes aceptaban {}
    { nombre: 'PUT /lotes/:id', metodo: 'put', url: '/api/lotes/1', valido: { descripcion: 'Esquina' }, servicio: () => m(loteService.updatedLote) },
    { nombre: 'PUT /ventas/:id', metodo: 'put', url: '/api/ventas/1', valido: { numero: 'VENTA-002' }, servicio: () => m(ventaService.updateVenta) },
    { nombre: 'PUT /usuarios/:id', metodo: 'put', url: '/api/usuarios/1', valido: { username: 'nuevo' }, servicio: () => m(usuarioService.updateUser) },
    { nombre: 'PUT /ubicaciones/:id', metodo: 'put', url: '/api/ubicaciones/1', valido: { numero: 5 }, servicio: () => m(ubicacionService.updateUbicacion) },
    { nombre: 'PUT /personas/:id', metodo: 'put', url: '/api/personas/1', valido: { nombre: 'Ana' }, servicio: () => personaUpdateSpy as unknown as jest.Mock },
    { nombre: 'PUT /fracciones/:id', metodo: 'put', url: '/api/fracciones/1', valido: { numero: '12' }, servicio: () => m(fraccionService.updateFraccion) },
    // Ya exigían al menos un campo: se mantienen en la matriz para que no regresen
    { nombre: 'PUT /reservas/:id', metodo: 'put', url: '/api/reservas/1', valido: { numero: 'RES-002' }, servicio: () => m(reservaService.updateReserva) },
    { nombre: 'PUT /inmobiliarias/:id', metodo: 'put', url: '/api/inmobiliarias/1', valido: { nombre: 'Inmo' }, servicio: () => m(inmobiliariaService.updateInmobiliaria) },
    { nombre: 'PATCH /prioridades/:id', metodo: 'patch', url: '/api/prioridades/1', valido: { numero: 'P-2' }, servicio: () => m(prioridadService.updatePrioridad) },
];

describe.each(UPDATES)('$nombre', (u) => {
    test.each([
        ['{}', {}],
        ['solo claves desconocidas', { campoInventado: 123 }],
        ['varias claves desconocidas', { campoInventado: 123, otro: 'x' }],
    ])('%s responde 400 sin llamar al service', async (_nombre, body) => {
        const res = await request(app)[u.metodo](u.url).set(ADMIN).send(body);
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Datos inválidos');
        expect(u.servicio()).not.toHaveBeenCalled();
    });

    test('un campo real sigue llegando al service', async () => {
        const res = await request(app)[u.metodo](u.url).set(ADMIN).send(u.valido);
        expect(res.status).toBe(200);
        expect(u.servicio()).toHaveBeenCalledTimes(1);
    });

    test('una clave desconocida junto a un campo real se descarta (sin .strict())', async () => {
        const res = await request(app)[u.metodo](u.url).set(ADMIN).send({ ...u.valido, campoInventado: 123 });
        expect(res.status).toBe(200);
        const llamada = u.servicio().mock.calls[0];
        expect(JSON.stringify(llamada)).not.toContain('campoInventado');
    });
});
