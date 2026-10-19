// Contrato de path params de todas las rutas con validateParams (salvo /api/files, cubierto
// en files.params.routes.test.ts): política única de IDs y valor validado hasta el service.
// Regresión: con z.coerce.number() + parseInt el ID validado no era el usado
// (DELETE /api/lotes/1e2 validaba 100 y borraba el lote 1).
jest.mock('../../../src/services/lote.service', () => ({
    getLoteById: jest.fn(),
    updatedLote: jest.fn(),
    deleteLote: jest.fn(),
}));

jest.mock('../../../src/services/promocion.service', () => ({
    aplicarPromocion: jest.fn(),
    quitarPromocion: jest.fn(),
    getPromocionActiva: jest.fn(),
}));

jest.mock('../../../src/services/reserva.service', () => ({
    getReservaById: jest.fn(),
    getReservaByImmobiliariaId: jest.fn(),
    updateReserva: jest.fn(),
    eliminarReserva: jest.fn(),
    reactivarReserva: jest.fn(),
    getOfertasByReservaId: jest.fn(),
    createOfertaReserva: jest.fn(),
}));

jest.mock('../../../src/services/venta.service', () => ({
    getVentasByInmobiliaria: jest.fn(),
    getVentaById: jest.fn(),
    updateVenta: jest.fn(),
    eliminarVenta: jest.fn(),
    reactivarVenta: jest.fn(),
}));

jest.mock('../../../src/services/pago.service', () => ({
    getPagosContextByVentaId: jest.fn(),
    aplicarRecargoManualEnVenta: jest.fn(),
    registrarPagoEnVenta: jest.fn(),
    reemplazarPlanPagoVigente: jest.fn(),
    createPlanPagoInicial: jest.fn(),
}));

jest.mock('../../../src/services/usuario.service', () => ({
    getUsuarioById: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
}));

jest.mock('../../../src/services/inmobiliaria.service', () => ({
    getInmobiliariaById: jest.fn(),
    updateInmobiliaria: jest.fn(),
    eliminarInmobiliaria: jest.fn(),
    reactivarInmobiliaria: jest.fn(),
    deleteInmobiliaria: jest.fn(),
}));

jest.mock('../../../src/services/prioridad.service', () => ({
    getPrioridadById: jest.fn(),
    updatePrioridad: jest.fn(),
    cancelPrioridad: jest.fn(),
    finalizePrioridad: jest.fn(),
    eliminarPrioridad: jest.fn(),
    reactivarPrioridad: jest.fn(),
}));

jest.mock('../../../src/services/fraccion.service', () => ({
    getFraccionById: jest.fn(),
    updateFraccion: jest.fn(),
    deleteFraccion: jest.fn(),
}));

jest.mock('../../../src/services/ubicacion.service', () => ({
    getUbicacionById: jest.fn(),
    updateUbicacion: jest.fn(),
    deleteUbicacion: jest.fn(),
}));

import request from 'supertest';
import app from '../../../src/app';
import * as loteService from '../../../src/services/lote.service';
import * as promocionService from '../../../src/services/promocion.service';
import * as reservaService from '../../../src/services/reserva.service';
import * as ventaService from '../../../src/services/venta.service';
import * as pagoService from '../../../src/services/pago.service';
import * as usuarioService from '../../../src/services/usuario.service';
import * as inmobiliariaService from '../../../src/services/inmobiliaria.service';
import * as prioridadService from '../../../src/services/prioridad.service';
import * as fraccionService from '../../../src/services/fraccion.service';
import * as ubicacionService from '../../../src/services/ubicacion.service';
import { PersonaService } from '../../../src/services/persona.service';
import { authHeader, INVALID_PATH_IDS, useTestWebEnv } from '../../support/http';

type Service = jest.MockInstance<any, any[]>;
const mock = (fn: unknown) => fn as Service;

const persona = {
    findById: jest.spyOn(PersonaService.prototype, 'findById'),
    update: jest.spyOn(PersonaService.prototype, 'update'),
    desactivarPersona: jest.spyOn(PersonaService.prototype, 'desactivarPersona'),
    reactivarPersona: jest.spyOn(PersonaService.prototype, 'reactivarPersona'),
    deletePersonaDefinitivo: jest.spyOn(PersonaService.prototype, 'deletePersonaDefinitivo'),
    getGrupoFamiliar: jest.spyOn(PersonaService.prototype, 'getGrupoFamiliar'),
    crearMiembroFamiliar: jest.spyOn(PersonaService.prototype, 'crearMiembroFamiliar'),
    eliminarMiembroFamiliar: jest.spyOn(PersonaService.prototype, 'eliminarMiembroFamiliar'),
};

useTestWebEnv();

afterAll(() => {
    jest.restoreAllMocks();
});

const ADMIN = authHeader('ADMINISTRADOR');
const get = (url: string) => request(app).get(url).set(ADMIN);
const del = (url: string) => request(app).delete(url).set(ADMIN);
const post = (url: string, body: object = {}) => request(app).post(url).set(ADMIN).send(body);
const put = (url: string, body: object) => request(app).put(url).set(ADMIN).send(body);
const patch = (url: string, body: object = {}) => request(app).patch(url).set(ADMIN).send(body);

// Bodies válidos: si la ruta responde 400 es por el param, no por el body.
const PLAN = {
    nombre: 'Plan',
    tipoFinanciacion: 'CONTADO',
    cantidadCuotas: 1,
    fechaInicio: '2026-10-01',
    cuotas: [{ numeroCuota: 1, tipoCuota: 'CUOTA', fechaVencimiento: '2026-11-01', montoOriginal: 1000 }],
};
const MIEMBRO = { nombre: 'Ana', apellido: 'Paz', identificadorTipo: 'DNI', identificadorValor: '12345678' };

type Ruta = {
    ruta: string;
    param?: string;
    // Recibe el id ya codificado para la URL.
    enviar: (id: string) => request.Test;
    service: Service;
    // Dónde recibe el service el id validado (por defecto, primer argumento).
    idRecibido?: (args: any[]) => unknown;
};

const RUTAS: Ruta[] = [
    // Lotes y promociones
    { ruta: 'GET /api/lotes/:id', enviar: (id) => get(`/api/lotes/${id}`), service: mock(loteService.getLoteById) },
    { ruta: 'PUT /api/lotes/:id', enviar: (id) => put(`/api/lotes/${id}`, { precio: 10 }), service: mock(loteService.updatedLote) },
    { ruta: 'DELETE /api/lotes/:id', enviar: (id) => del(`/api/lotes/${id}`), service: mock(loteService.deleteLote) },
    {
        ruta: 'POST /api/lotes/:id/promociones/aplicar',
        enviar: (id) => post(`/api/lotes/${id}/promociones/aplicar`, { precioPromocional: 100 }),
        service: mock(promocionService.aplicarPromocion),
    },
    { ruta: 'POST /api/lotes/:id/promociones/quitar', enviar: (id) => post(`/api/lotes/${id}/promociones/quitar`), service: mock(promocionService.quitarPromocion) },
    { ruta: 'GET /api/lotes/:id/promociones/activa', enviar: (id) => get(`/api/lotes/${id}/promociones/activa`), service: mock(promocionService.getPromocionActiva) },

    // Reservas
    { ruta: 'GET /api/reservas/:id', enviar: (id) => get(`/api/reservas/${id}`), service: mock(reservaService.getReservaById) },
    { ruta: 'GET /api/reservas/inmob/:id', enviar: (id) => get(`/api/reservas/inmob/${id}`), service: mock(reservaService.getReservaByImmobiliariaId) },
    { ruta: 'PUT /api/reservas/:id', enviar: (id) => put(`/api/reservas/${id}`, { estado: 'CANCELADA' }), service: mock(reservaService.updateReserva) },
    { ruta: 'DELETE /api/reservas/:id', enviar: (id) => del(`/api/reservas/${id}`), service: mock(reservaService.eliminarReserva) },
    { ruta: 'PATCH /api/reservas/:id/eliminar', enviar: (id) => patch(`/api/reservas/${id}/eliminar`), service: mock(reservaService.eliminarReserva) },
    { ruta: 'PATCH /api/reservas/:id/reactivar', enviar: (id) => patch(`/api/reservas/${id}/reactivar`), service: mock(reservaService.reactivarReserva) },
    { ruta: 'GET /api/reservas/:id/ofertas', enviar: (id) => get(`/api/reservas/${id}/ofertas`), service: mock(reservaService.getOfertasByReservaId) },
    { ruta: 'POST /api/reservas/:id/ofertas', enviar: (id) => post(`/api/reservas/${id}/ofertas`, { monto: 100 }), service: mock(reservaService.createOfertaReserva) },

    // Ventas
    { ruta: 'GET /api/ventas/inmobiliaria/:id', enviar: (id) => get(`/api/ventas/inmobiliaria/${id}`), service: mock(ventaService.getVentasByInmobiliaria) },
    { ruta: 'GET /api/ventas/:id', enviar: (id) => get(`/api/ventas/${id}`), service: mock(ventaService.getVentaById) },
    { ruta: 'PUT /api/ventas/:id', enviar: (id) => put(`/api/ventas/${id}`, { monto: 10 }), service: mock(ventaService.updateVenta) },
    { ruta: 'DELETE /api/ventas/:id', enviar: (id) => del(`/api/ventas/${id}`), service: mock(ventaService.eliminarVenta) },
    { ruta: 'PATCH /api/ventas/:id/eliminar', enviar: (id) => patch(`/api/ventas/${id}/eliminar`), service: mock(ventaService.eliminarVenta) },
    { ruta: 'PATCH /api/ventas/:id/reactivar', enviar: (id) => patch(`/api/ventas/${id}/reactivar`), service: mock(ventaService.reactivarVenta) },

    // Pagos (param ventaId)
    { ruta: 'GET /api/ventas/:ventaId/pagos', param: 'ventaId', enviar: (id) => get(`/api/ventas/${id}/pagos`), service: mock(pagoService.getPagosContextByVentaId) },
    {
        ruta: 'POST /api/ventas/:ventaId/pagos/recargo',
        param: 'ventaId',
        enviar: (id) => post(`/api/ventas/${id}/pagos/recargo`, { cuotaId: 3, montoRecargo: 10 }),
        service: mock(pagoService.aplicarRecargoManualEnVenta),
    },
    {
        ruta: 'POST /api/ventas/:ventaId/pagos',
        param: 'ventaId',
        enviar: (id) => post(`/api/ventas/${id}/pagos`, { cuotaId: 3, fechaPago: '2026-10-01', monto: 1000, medioPago: 'EFECTIVO' }),
        service: mock(pagoService.registrarPagoEnVenta),
    },
    {
        ruta: 'POST /api/ventas/:ventaId/pagos/plan/reemplazar',
        param: 'ventaId',
        enviar: (id) => post(`/api/ventas/${id}/pagos/plan/reemplazar`, PLAN),
        service: mock(pagoService.reemplazarPlanPagoVigente),
    },
    {
        ruta: 'POST /api/ventas/:ventaId/pagos/plan',
        param: 'ventaId',
        enviar: (id) => post(`/api/ventas/${id}/pagos/plan`, { ...PLAN, moneda: 'ARS', montoTotalPlanificado: 1000 }),
        service: mock(pagoService.createPlanPagoInicial),
    },

    // Usuarios
    { ruta: 'GET /api/usuarios/:id', enviar: (id) => get(`/api/usuarios/${id}`), service: mock(usuarioService.getUsuarioById) },
    { ruta: 'PUT /api/usuarios/:id', enviar: (id) => put(`/api/usuarios/${id}`, { username: 'nuevo' }), service: mock(usuarioService.updateUser) },
    {
        ruta: 'DELETE /api/usuarios/:id',
        enviar: (id) => del(`/api/usuarios/${id}`),
        service: mock(usuarioService.deleteUser),
        idRecibido: ([req]) => req.idUsuario,
    },

    // Inmobiliarias
    {
        ruta: 'GET /api/inmobiliarias/:id',
        enviar: (id) => get(`/api/inmobiliarias/${id}`),
        service: mock(inmobiliariaService.getInmobiliariaById),
        idRecibido: ([req]) => req.idInmobiliaria,
    },
    { ruta: 'PUT /api/inmobiliarias/:id', enviar: (id) => put(`/api/inmobiliarias/${id}`, { nombre: 'Nueva' }), service: mock(inmobiliariaService.updateInmobiliaria) },
    { ruta: 'PATCH /api/inmobiliarias/:id/eliminar', enviar: (id) => patch(`/api/inmobiliarias/${id}/eliminar`), service: mock(inmobiliariaService.eliminarInmobiliaria) },
    { ruta: 'PATCH /api/inmobiliarias/:id/reactivar', enviar: (id) => patch(`/api/inmobiliarias/${id}/reactivar`), service: mock(inmobiliariaService.reactivarInmobiliaria) },
    {
        ruta: 'DELETE /api/inmobiliarias/:id',
        enviar: (id) => del(`/api/inmobiliarias/${id}`),
        service: mock(inmobiliariaService.deleteInmobiliaria),
        idRecibido: ([req]) => req.idInmobiliaria,
    },

    // Prioridades
    { ruta: 'GET /api/prioridades/:id', enviar: (id) => get(`/api/prioridades/${id}`), service: mock(prioridadService.getPrioridadById) },
    { ruta: 'PATCH /api/prioridades/:id', enviar: (id) => patch(`/api/prioridades/${id}`, { numero: 'P-2' }), service: mock(prioridadService.updatePrioridad) },
    { ruta: 'PATCH /api/prioridades/:id/cancelar', enviar: (id) => patch(`/api/prioridades/${id}/cancelar`), service: mock(prioridadService.cancelPrioridad) },
    { ruta: 'PATCH /api/prioridades/:id/finalizar', enviar: (id) => patch(`/api/prioridades/${id}/finalizar`), service: mock(prioridadService.finalizePrioridad) },
    { ruta: 'PATCH /api/prioridades/:id/eliminar', enviar: (id) => patch(`/api/prioridades/${id}/eliminar`), service: mock(prioridadService.eliminarPrioridad) },
    { ruta: 'PATCH /api/prioridades/:id/reactivar', enviar: (id) => patch(`/api/prioridades/${id}/reactivar`), service: mock(prioridadService.reactivarPrioridad) },

    // Personas
    { ruta: 'GET /api/personas/:id', enviar: (id) => get(`/api/personas/${id}`), service: persona.findById },
    { ruta: 'PUT /api/personas/:id', enviar: (id) => put(`/api/personas/${id}`, { nombre: 'Ana' }), service: persona.update },
    { ruta: 'PATCH /api/personas/:id/desactivar', enviar: (id) => patch(`/api/personas/${id}/desactivar`), service: persona.desactivarPersona },
    { ruta: 'PATCH /api/personas/:id/reactivar', enviar: (id) => patch(`/api/personas/${id}/reactivar`), service: persona.reactivarPersona },
    { ruta: 'DELETE /api/personas/:id', enviar: (id) => del(`/api/personas/${id}`), service: persona.deletePersonaDefinitivo },
    { ruta: 'GET /api/personas/:id/grupo-familiar', enviar: (id) => get(`/api/personas/${id}/grupo-familiar`), service: persona.getGrupoFamiliar },
    {
        ruta: 'POST /api/personas/:id/grupo-familiar/miembros',
        enviar: (id) => post(`/api/personas/${id}/grupo-familiar/miembros`, MIEMBRO),
        service: persona.crearMiembroFamiliar,
    },
    {
        ruta: 'DELETE /api/personas/:id/grupo-familiar/miembros/:miembroId (id)',
        enviar: (id) => del(`/api/personas/${id}/grupo-familiar/miembros/9`),
        service: persona.eliminarMiembroFamiliar,
    },
    {
        ruta: 'DELETE /api/personas/:id/grupo-familiar/miembros/:miembroId (miembroId)',
        param: 'miembroId',
        enviar: (id) => del(`/api/personas/5/grupo-familiar/miembros/${id}`),
        service: persona.eliminarMiembroFamiliar,
        idRecibido: ([, miembroId]) => miembroId,
    },

    // Fracciones
    { ruta: 'GET /api/fracciones/:id', enviar: (id) => get(`/api/fracciones/${id}`), service: mock(fraccionService.getFraccionById) },
    { ruta: 'PUT /api/fracciones/:id', enviar: (id) => put(`/api/fracciones/${id}`, { numero: '7' }), service: mock(fraccionService.updateFraccion) },
    { ruta: 'DELETE /api/fracciones/:id', enviar: (id) => del(`/api/fracciones/${id}`), service: mock(fraccionService.deleteFraccion) },

    // Ubicaciones
    { ruta: 'GET /api/ubicaciones/:id', enviar: (id) => get(`/api/ubicaciones/${id}`), service: mock(ubicacionService.getUbicacionById) },
    { ruta: 'PUT /api/ubicaciones/:id', enviar: (id) => put(`/api/ubicaciones/${id}`, { numero: 3 }), service: mock(ubicacionService.updateUbicacion) },
    { ruta: 'DELETE /api/ubicaciones/:id', enviar: (id) => del(`/api/ubicaciones/${id}`), service: mock(ubicacionService.deleteUbicacion) },
];

beforeEach(() => {
    for (const { service } of RUTAS) service.mockResolvedValue({});
});

describe.each(RUTAS)('$ruta', ({ param = 'id', enviar, service, idRecibido = (args) => args[0] }) => {
    test.each(INVALID_PATH_IDS)('%j responde 400 sin llamar al service', async (id) => {
        const res = await enviar(encodeURIComponent(id));
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            success: false,
            message: 'Datos inválidos',
            errors: [{ field: param, message: expect.any(String) }],
        });
        expect(service).not.toHaveBeenCalled();
    });

    test('un id válido llega al service como number', async () => {
        const res = await enviar('12');
        expect(res.status).not.toBe(400);
        expect(res.status).toBeLessThan(500);
        expect(service).toHaveBeenCalledTimes(1);
        expect(idRecibido(service.mock.calls[0])).toBe(12);
    });
});

test('params múltiples: el service recibe ambos ids convertidos', async () => {
    const res = await del('/api/personas/5/grupo-familiar/miembros/9');
    expect(res.status).toBe(200);
    expect(persona.eliminarMiembroFamiliar).toHaveBeenCalledWith(5, 9);
});
