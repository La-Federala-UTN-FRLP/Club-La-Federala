import prisma from '../config/prisma';
import { Venta, EstadoReserva, EstadoPrioridad, EstadoLote } from '../generated/prisma';
import { PostVentaRequest, PutVentaRequest, DeleteVentaResponse } from '../types/interfacesCCLF'; 
import { updateLoteState } from './lote.service';
import { ESTADO_LOTE_OP } from '../domain/loteState/loteState.types';
import { assertLoteOperableFor } from '../domain/loteState/loteState.rules';
import { 
    assertTransicionEstadoValida, 
    assertCamposObligatoriosPorEstado,
    assertVentaEliminable
} from '../domain/ventaState/ventaState.rules';
import { isFederalaInmobiliaria } from '../utils/inmobiliaria.utils';
import {
    montoVentaEsperadoDesdeReserva,
    MONTO_VENTA_RESERVA_TOLERANCIA,
} from '../domain/reserva/reservaMontoVenta.utils';

const VENTA_INCLUDE = {
    comprador: true,
    compradores: true,
    lote: { include: { propietario: true, fraccion: { select: { numero: true } } } },
    inmobiliaria: true,
    /** Plan vigente (tabla ventas: Con plan / Sin plan; acceso Pagos en canceladas) */
    planPagos: {
        where: { esVigente: true },
        select: { id: true },
    },
    _count: {
        select: {
            planPagos: true,
            pagosRegistrados: true,
        },
    },
} as const;

type VentaActor = {
    role: string;
    inmobiliariaId?: number | null;
};

function forbidVenta(message: string): never {
    const err: any = new Error(message);
    err.status = 403;
    err.statusCode = 403;
    throw err;
}

function requireVentaActor(user: VentaActor | undefined): VentaActor {
    if (user == null) {
        forbidVenta('No tienes permisos para esta acción');
    }
    return user;
}

function requireInmobiliariaContext(actor: VentaActor): number {
    if (actor.inmobiliariaId == null) {
        forbidVenta('El usuario INMOBILIARIA no tiene una inmobiliaria asociada');
    }
    return actor.inmobiliariaId;
}

function assertVentaOwnership(
    actor: VentaActor,
    venta: { inmobiliariaId?: number | null },
    message = 'No tienes permiso para operar esta venta',
): void {
    if (actor.role !== 'INMOBILIARIA') {
        return;
    }
    const tenantId = requireInmobiliariaContext(actor);
    if (venta.inmobiliariaId !== tenantId) {
        forbidVenta(message);
    }
}

/** Unifica legacy compradorId y nuevo compradores[] en una lista de IDs */
function resolveCompradorIds(data: { compradorId?: number; compradores?: { personaId: number }[] }): number[] {
    if (data.compradores && data.compradores.length > 0) {
        return data.compradores.map(c => c.personaId);
    }
    if (data.compradorId != null) {
        return [data.compradorId];
    }
    return [];
}

export async function getAllVentas(
  query?: { estadoOperativo?: string },
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<Venta[]> {
    const whereClause: any = {};

    if (user?.role === 'INMOBILIARIA' && user?.inmobiliariaId != null) {
      whereClause.inmobiliariaId = user.inmobiliariaId;
    }

    whereClause.estadoOperativo = query?.estadoOperativo || 'OPERATIVO';

    return prisma.venta.findMany({
        where: whereClause,
        include: VENTA_INCLUDE,
        orderBy: { id: 'asc' },
    });
}

export async function getVentaById(id: number): Promise<Venta> {
    const venta = await prisma.venta.findUnique({
        where: { id },
        include: VENTA_INCLUDE,
    });

    if (!venta) {
        const error = new Error('Venta no encontrada');
        (error as any).statusCode = 404;
        throw error;
    }

    return venta;
}

export async function getVentasByInmobiliaria(
  inmobiliariaId: number,
  query: { estadoOperativo?: string } | undefined,
  user: VentaActor | undefined,
): Promise<Venta[]> {
    const actor = requireVentaActor(user);

    if (actor.role === 'INMOBILIARIA') {
        const tenantId = requireInmobiliariaContext(actor);
        if (tenantId !== inmobiliariaId) {
            forbidVenta('No tienes permiso para ver las ventas de esta inmobiliaria');
        }
    }

    const whereClause: any = { inmobiliariaId };
    whereClause.estadoOperativo = query?.estadoOperativo || 'OPERATIVO';

    const ventas = await prisma.venta.findMany({
        where: whereClause,
        include: VENTA_INCLUDE,
        orderBy: { fechaVenta: 'desc' },
    });
    if (ventas.length === 0) {
        const error = new Error('No se registran ventas para la inmobiliaria indicada') as any;
        error.statusCode = 404;
        throw error;
    }
    return ventas;
}

export async function createVenta(data: PostVentaRequest): Promise<Venta> {
    const loteExists = await prisma.lote.findUnique({
        where: { id: data.loteId },
    });

    if (!loteExists) {
        const error = new Error('Lote no encontrado');
        (error as any).statusCode = 404;
        throw error;
    }
    if (loteExists.estado === 'VENDIDO') {
        const error = new Error('El lote ya está vendido');
        (error as any).statusCode = 400;
        throw error;
    }
    assertLoteOperableFor('crear venta', loteExists.estado);

    const compradorIds = resolveCompradorIds(data);
    if (compradorIds.length === 0) {
        const error = new Error('Debe especificar al menos un comprador');
        (error as any).statusCode = 400;
        throw error;
    }

    for (const personaId of compradorIds) {
        const personaExists = await prisma.persona.findUnique({ where: { id: personaId } });
        if (!personaExists) {
            const error = new Error(`Comprador no encontrado (personaId: ${personaId})`);
            (error as any).statusCode = 404;
            throw error;
        }
    }

    const compradorIdPrincipal = compradorIds[0];

    // Reserva vigente del lote: ACEPTADA o ACTIVA, operativa, no consumida por otra venta
    const reservasVigentes = await prisma.reserva.findMany({
        where: {
            loteId: data.loteId,
            estadoOperativo: 'OPERATIVO',
            estado: { in: [EstadoReserva.ACEPTADA, EstadoReserva.ACTIVA] },
            ventaId: null,
        },
    });

    if (reservasVigentes.length > 1) {
        const error = new Error(
            `Conflicto: se encontraron ${reservasVigentes.length} reservas vigentes para el lote ${data.loteId}. Resolver manualmente.`
        );
        (error as any).statusCode = 409;
        throw error;
    }

    const reserva = reservasVigentes[0] ?? null;

    if (reserva) {
        // Si la reserva pertenece a una inmobiliaria externa (no Federala), la venta debe coincidir
        if (!isFederalaInmobiliaria(reserva.inmobiliariaId)) {
            if (data.inmobiliariaId !== reserva.inmobiliariaId) {
                const error = new Error(
                    `La inmobiliaria de la venta debe coincidir con la de la reserva (inmobiliariaId esperado: ${reserva.inmobiliariaId})`
                );
                (error as any).statusCode = 400;
                throw error;
            }
        }

        // Warning de trazabilidad (no bloquea la venta)
        if (!compradorIds.includes(reserva.clienteId)) {
            console.warn(
                `[Venta-Reserva] Cliente de reserva no coincide con compradores.`,
                { reservaId: reserva.id, clienteId: reserva.clienteId, compradorIds }
            );
        }

        const montoEsperado = montoVentaEsperadoDesdeReserva(reserva);
        if (Math.abs(Number(data.monto) - montoEsperado) > MONTO_VENTA_RESERVA_TOLERANCIA) {
            const error = new Error(
                `El monto de la venta debe coincidir con el monto de la reserva (esperado: ${montoEsperado.toFixed(2)})`
            );
            (error as any).statusCode = 400;
            throw error;
        }
    }

    const estadoInicial = data.estado || 'INICIADA';
    assertCamposObligatoriosPorEstado(estadoInicial as any, {
        fechaEscrituraReal: data.fechaEscrituraReal ? new Date(data.fechaEscrituraReal) : null,
        fechaCancelacion: data.fechaCancelacion ? new Date(data.fechaCancelacion) : null,
        motivoCancelacion: data.motivoCancelacion,
    } as any);

    // Transacción atómica: crear venta, marcar lote VENDIDO, finalizar prioridad, consumir reserva
    const newVenta = await prisma.$transaction(async (tx) => {
        const venta = await tx.venta.create({
            data: {
                loteId: data.loteId,
                fechaVenta: new Date(data.fechaVenta),
                monto: data.monto,
                estado: estadoInicial,
                estadoCobro: data.estadoCobro || 'PENDIENTE',
                plazoEscritura: data.plazoEscritura ? new Date(data.plazoEscritura) : null,
                fechaEscrituraReal: data.fechaEscrituraReal ? new Date(data.fechaEscrituraReal) : null,
                fechaCancelacion: data.fechaCancelacion ? new Date(data.fechaCancelacion) : null,
                motivoCancelacion: data.motivoCancelacion || null,
                tipoPago: data.tipoPago,
                compradorId: compradorIdPrincipal,
                inmobiliariaId: data.inmobiliariaId || null,
                numero: data.numero,
                createdAt: new Date(),
                compradores: {
                    connect: compradorIds.map(id => ({ id })),
                },
            },
            include: VENTA_INCLUDE,
        });

        await tx.lote.update({
            where: { id: data.loteId },
            data: { estado: EstadoLote.VENDIDO },
        });

        const prioridadActiva = await tx.prioridad.findFirst({
            where: { loteId: data.loteId, estado: EstadoPrioridad.ACTIVA },
        });
        if (prioridadActiva) {
            await tx.prioridad.update({
                where: { id: prioridadActiva.id },
                data: { estado: EstadoPrioridad.FINALIZADA },
            });
        }

        if (reserva) {
            await tx.reserva.update({
                where: { id: reserva.id },
                data: {
                    ventaId: venta.id,
                    ...(reserva.estado === EstadoReserva.ACTIVA
                        ? { estado: EstadoReserva.ACEPTADA }
                        : {}),
                },
            });
        }

        return venta;
    });

    return newVenta;
}

export async function updateVenta(id: number, updateData: PutVentaRequest): Promise<Venta> {
    const ventaActual = await prisma.venta.findUnique({
        where: { id },
        select: { 
            estado: true, 
            estadoCobro: true, 
            loteId: true,
            estadoOperativo: true,
            fechaEscrituraReal: true,
            fechaCancelacion: true,
            motivoCancelacion: true
        }
    });

    if (!ventaActual) {
        const error = new Error('Venta no encontrada');
        (error as any).statusCode = 404;
        throw error;
    }

    if (updateData.estado && updateData.estado !== ventaActual.estado) {
        assertTransicionEstadoValida(ventaActual.estado, updateData.estado as any);
    }

    // Compradores solo editables en estados no-terminales y operativos
    if (updateData.compradores !== undefined) {
        const estadoActual = ventaActual.estado;
        const esTerminal = estadoActual === 'ESCRITURADO' || estadoActual === 'CANCELADA';
        const esEliminado = ventaActual.estadoOperativo === 'ELIMINADO';
        
        if (esTerminal || esEliminado) {
            const error = new Error(`No se puede modificar los compradores: la venta está en estado ${estadoActual}`);
            (error as any).statusCode = 409;
            throw error;
        }
    }

    // Merge DB + payload para validar campos obligatorios según el estado final
    const estadoFinal = updateData.estado || ventaActual.estado;
    const dataValidacion = {
        fechaEscrituraReal: updateData.fechaEscrituraReal
            ? new Date(updateData.fechaEscrituraReal)
            : ventaActual.fechaEscrituraReal,
        fechaCancelacion: updateData.fechaCancelacion
            ? new Date(updateData.fechaCancelacion)
            : ventaActual.fechaCancelacion,
        motivoCancelacion: updateData.motivoCancelacion !== undefined
            ? updateData.motivoCancelacion
            : ventaActual.motivoCancelacion,
    };

    assertCamposObligatoriosPorEstado(estadoFinal as any, dataValidacion as any);

    if (updateData.loteId) {
        const loteExists = await prisma.lote.findUnique({
            where: { id: updateData.loteId },
        });
        if (!loteExists) {
            const error = new Error('Lote no encontrado');
            (error as any).statusCode = 404;
            throw error;
        }
    }

    if (updateData.compradorId) {
        const compradorExists = await prisma.persona.findUnique({
            where: { id: updateData.compradorId },
        });
        if (!compradorExists) {
            const error = new Error('Comprador no encontrado');
            (error as any).statusCode = 404;
            throw error;
        }
    }

    if (updateData.compradores && updateData.compradores.length > 0) {
        for (const c of updateData.compradores) {
            const personaExists = await prisma.persona.findUnique({ where: { id: c.personaId } });
            if (!personaExists) {
                const error = new Error(`Comprador no encontrado (personaId: ${c.personaId})`);
                (error as any).statusCode = 404;
                throw error;
            }
        }
    }

    if (updateData.inmobiliariaId) {
        const inmobiliariaExists = await prisma.inmobiliaria.findUnique({
            where: { id: updateData.inmobiliariaId },
        });
        if (!inmobiliariaExists) {
            const error = new Error('Inmobiliaria no encontrada');
            (error as any).statusCode = 404;
            throw error;
        }
    }

    try {
        // compradores se maneja aparte con set() en la relación implícita
        const { compradores: compradoresPayload, ...restUpdateData } = updateData as any;
        const prismaUpdateData: any = { ...restUpdateData };

        if (updateData.fechaVenta) {
            prismaUpdateData.fechaVenta = new Date(updateData.fechaVenta);
        }
        if (updateData.plazoEscritura) {
            prismaUpdateData.plazoEscritura = new Date(updateData.plazoEscritura);
        }
        if (updateData.fechaEscrituraReal) {
            prismaUpdateData.fechaEscrituraReal = new Date(updateData.fechaEscrituraReal);
        }
        if (updateData.fechaCancelacion) {
            prismaUpdateData.fechaCancelacion = new Date(updateData.fechaCancelacion);
        }

        if (compradoresPayload && compradoresPayload.length > 0) {
            prismaUpdateData.compradores = {
                set: compradoresPayload.map((c: { personaId: number }) => ({ id: c.personaId })),
            };
            prismaUpdateData.compradorId = compradoresPayload[0].personaId; // legacy sync
        }

        const updatedVenta = await prisma.venta.update({
            where: { id }, 
            data: prismaUpdateData,
            include: VENTA_INCLUDE,
        });

        // Cancelación → restaurar lote a DISPONIBLE
        if (updateData.estado === 'CANCELADA') {
            await updateLoteState(ventaActual.loteId, ESTADO_LOTE_OP.DISPONIBLE);
        }

        return updatedVenta;
    } catch (e: any) {
        if (e.code === 'P2025') {
            const error = new Error('Venta no encontrada');
            (error as any).statusCode = 404;
            throw error;
        }
        throw e;
    }
}

export async function deleteVenta(id: number): Promise<DeleteVentaResponse> {
    try {
        await prisma.venta.delete({
            where: { id },
        });
        return { message: 'Venta eliminada correctamente' };
    } catch (e: any) {
        if (e.code === 'P2025') { 
            const error = new Error('Venta no encontrada');
            (error as any).statusCode = 404;
            throw error;
        }
        throw e;
    }
}

export async function eliminarVenta(
  id: number,
  user: VentaActor | undefined,
): Promise<Venta> {
    const venta = await prisma.venta.findUnique({ 
      where: { id },
      include: VENTA_INCLUDE,
    });
    
    if (!venta) {
        const error = new Error('Venta no encontrada') as any;
        error.statusCode = 404;
        throw error;
    }

    const actor = requireVentaActor(user);
    if (actor.role === 'INMOBILIARIA') {
        assertVentaOwnership(actor, venta, 'No tienes permiso para eliminar esta venta');
    }

    if (venta.estadoOperativo === 'ELIMINADO') {
        const error = new Error('La venta ya está eliminada.') as any;
        error.statusCode = 409;
        throw error;
    }

    const ventaData = {
        estado: venta.estado,
        estadoCobro: venta.estadoCobro,
        fechaEscrituraReal: venta.fechaEscrituraReal,
        fechaCancelacion: venta.fechaCancelacion,
        motivoCancelacion: venta.motivoCancelacion,
    };

    try {
        assertVentaEliminable(ventaData);
    } catch (err: any) {
        if (!err.statusCode && !err.status) {
            err.statusCode = 409;
        }
        throw err;
    }

    return await prisma.venta.update({
        where: { id },
        data: {
            estadoOperativo: 'ELIMINADO',
            fechaBaja: new Date(),
        },
        include: VENTA_INCLUDE,
    });
}

export async function reactivarVenta(
  id: number,
  user: VentaActor | undefined,
): Promise<Venta> {
    const venta = await prisma.venta.findUnique({ 
      where: { id },
      include: VENTA_INCLUDE,
    });
    
    if (!venta) {
        const error = new Error('Venta no encontrada') as any;
        error.statusCode = 404;
        throw error;
    }

    const actor = requireVentaActor(user);
    if (actor.role === 'INMOBILIARIA') {
        assertVentaOwnership(actor, venta, 'No tienes permiso para reactivar esta venta');
    }

    if (venta.estadoOperativo === 'OPERATIVO') {
        const error = new Error('La venta ya está operativa.') as any;
        error.statusCode = 409;
        throw error;
    }

    return await prisma.venta.update({
        where: { id },
        data: {
            estadoOperativo: 'OPERATIVO',
        },
        include: VENTA_INCLUDE,
    });
}

