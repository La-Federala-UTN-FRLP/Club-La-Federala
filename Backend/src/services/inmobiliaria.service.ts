import {
    Inmobiliaria,
    GetInmobiliariasResponse,
    GetInmobiliariaRequest,
    GetInmobiliariaResponse, 
    PutInmobiliariaRequest,
    PutInmobiliariaResponse,
    PostInmobiliariaRequest,
    PostInmobiliariaResponse,
} from '../types/interfacesCCLF';
import { Inmobiliaria as PrismaInmobiliaria, EstadoVenta, EstadoReserva, EstadoPrioridad, OwnerPrioridad } from '../generated/prisma';
import prisma from '../config/prisma';
import { Prisma } from '../generated/prisma';

// ==============================
// Helper: Calcular conteos operativos para inmobiliarias
// ==============================
interface InmobiliariaMetrics {
  ventasTotales: number;
  ventasActivas: number;
  reservasTotales: number;
  reservasActivas: number;
  prioridadesTotales: number;
  prioridadesActivas: number;
}

async function calcularMetricasInmobiliarias(): Promise<Map<number, InmobiliariaMetrics>> {
  // Ejecutar todos los groupBy en paralelo para optimizar
  const [ventasTotalesData,ventasActivasData,reservasTotalesData,reservasActivasData,prioridadesTotalesData,prioridadesActivasData
  ] = await Promise.all([
    // Ventas totales (operativas)
    prisma.venta.groupBy({
      by: ['inmobiliariaId'],
      where: { estadoOperativo: 'OPERATIVO' },
      _count: { id: true }
    }),
    // Ventas activas (operativas + estados activos)
    prisma.venta.groupBy({
      by: ['inmobiliariaId'],
      where: {
        estadoOperativo: 'OPERATIVO',
        estado: { in: [EstadoVenta.INICIADA, EstadoVenta.CON_BOLETO, EstadoVenta.ESCRITURADO] }
      },
      _count: { id: true }
    }),
    // Reservas totales (operativas)
    prisma.reserva.groupBy({
      by: ['inmobiliariaId'],
      where: { estadoOperativo: 'OPERATIVO' },
      _count: { id: true }
    }),
    // Reservas activas (operativas + estado ACTIVA)
    prisma.reserva.groupBy({
      by: ['inmobiliariaId'],
      where: {
        estadoOperativo: 'OPERATIVO',
        estado: EstadoReserva.ACTIVA
      },
      _count: { id: true }
    }),
    // Prioridades totales (operativas + ownerType INMOBILIARIA)
    prisma.prioridad.groupBy({
      by: ['inmobiliariaId'],
      where: {
        estadoOperativo: 'OPERATIVO',
        ownerType: OwnerPrioridad.INMOBILIARIA
      },
      _count: { id: true }
    }),
    // Prioridades activas (operativas + ownerType INMOBILIARIA + estado ACTIVA)
    prisma.prioridad.groupBy({
      by: ['inmobiliariaId'],
      where: {
        estadoOperativo: 'OPERATIVO',
        ownerType: OwnerPrioridad.INMOBILIARIA,
        estado: EstadoPrioridad.ACTIVA
      },
      _count: { id: true }
    })
  ]);

  // Construir mapa de métricas por inmobiliariaId
  const metricsMap = new Map<number, InmobiliariaMetrics>();

  // Inicializar con ceros
  const allInmobiliariaIds = new Set<number>();
  [ventasTotalesData, reservasTotalesData, prioridadesTotalesData].forEach(data => {
    data.forEach(item => {
      if (item.inmobiliariaId) allInmobiliariaIds.add(item.inmobiliariaId);
    });
  });

  allInmobiliariaIds.forEach(id => {
    metricsMap.set(id, { ventasTotales: 0,ventasActivas: 0,reservasTotales: 0,reservasActivas: 0,prioridadesTotales: 0,prioridadesActivas: 0 });
  });

  // Mapear conteos
  ventasTotalesData.forEach(item => {
    if (item.inmobiliariaId) {
      const metrics = metricsMap.get(item.inmobiliariaId) || {
        ventasTotales: 0, ventasActivas: 0, reservasTotales: 0, 
        reservasActivas: 0, prioridadesTotales: 0, prioridadesActivas: 0
      };
      metrics.ventasTotales = item._count.id;
      metricsMap.set(item.inmobiliariaId, metrics);
    }
  });

  ventasActivasData.forEach(item => {
    if (item.inmobiliariaId) {
      const metrics = metricsMap.get(item.inmobiliariaId) || {
        ventasTotales: 0, ventasActivas: 0, reservasTotales: 0, 
        reservasActivas: 0, prioridadesTotales: 0, prioridadesActivas: 0
      };
      metrics.ventasActivas = item._count.id;
      metricsMap.set(item.inmobiliariaId, metrics);
    }
  });

  reservasTotalesData.forEach(item => {
    if (item.inmobiliariaId) {
      const metrics = metricsMap.get(item.inmobiliariaId) || {
        ventasTotales: 0, ventasActivas: 0, reservasTotales: 0, 
        reservasActivas: 0, prioridadesTotales: 0, prioridadesActivas: 0
      };
      metrics.reservasTotales = item._count.id;
      metricsMap.set(item.inmobiliariaId, metrics);
    }
  });

  reservasActivasData.forEach(item => {
    if (item.inmobiliariaId) {
      const metrics = metricsMap.get(item.inmobiliariaId) || {
        ventasTotales: 0, ventasActivas: 0, reservasTotales: 0, 
        reservasActivas: 0, prioridadesTotales: 0, prioridadesActivas: 0
      };
      metrics.reservasActivas = item._count.id;
      metricsMap.set(item.inmobiliariaId, metrics);
    }
  });

  prioridadesTotalesData.forEach(item => {
    if (item.inmobiliariaId) {
      const metrics = metricsMap.get(item.inmobiliariaId) || {
        ventasTotales: 0, ventasActivas: 0, reservasTotales: 0, 
        reservasActivas: 0, prioridadesTotales: 0, prioridadesActivas: 0
      };
      metrics.prioridadesTotales = item._count.id;
      metricsMap.set(item.inmobiliariaId, metrics);
    }
  });

  prioridadesActivasData.forEach(item => {
    if (item.inmobiliariaId) {
      const metrics = metricsMap.get(item.inmobiliariaId) || {
        ventasTotales: 0, ventasActivas: 0, reservasTotales: 0, 
        reservasActivas: 0, prioridadesTotales: 0, prioridadesActivas: 0
      };
      metrics.prioridadesActivas = item._count.id;
      metricsMap.set(item.inmobiliariaId, metrics);
    }
  });

  return metricsMap;
}

// Helper para calcular métricas de una sola inmobiliaria
async function calcularMetricasInmobiliaria(inmobiliariaId: number): Promise<InmobiliariaMetrics> {
  const [ventasTotales, ventasActivas, reservasTotales, reservasActivas, prioridadesTotales, prioridadesActivas] = await Promise.all([
    prisma.venta.count({ where: { inmobiliariaId, estadoOperativo: 'OPERATIVO' } }),
    prisma.venta.count({ where: { inmobiliariaId, estadoOperativo: 'OPERATIVO', estado: { in: [EstadoVenta.INICIADA, EstadoVenta.CON_BOLETO, EstadoVenta.ESCRITURADO] } } }),
    prisma.reserva.count({ where: { inmobiliariaId, estadoOperativo: 'OPERATIVO' } }),
    prisma.reserva.count({ where: { inmobiliariaId, estadoOperativo: 'OPERATIVO', estado: EstadoReserva.ACTIVA } }),
    prisma.prioridad.count({ where: { inmobiliariaId, estadoOperativo: 'OPERATIVO', ownerType: OwnerPrioridad.INMOBILIARIA } }),
    prisma.prioridad.count({ where: { inmobiliariaId, estadoOperativo: 'OPERATIVO', ownerType: OwnerPrioridad.INMOBILIARIA, estado: EstadoPrioridad.ACTIVA } })
  ]);

  return { ventasTotales,ventasActivas,reservasTotales,reservasActivas,prioridadesTotales,prioridadesActivas };
}

// 2. Mapeamos los nuevos campos en el helper
const toInmobiliaria = (i: PrismaInmobiliaria & { _count?: { ventas?: number; reservas?: number } }): Inmobiliaria => ({
    idInmobiliaria: i.id,
    nombre: i.nombre,
    razonSocial: i.razonSocial,
    contacto: i.contacto ?? undefined,
    comxventa: i.comxventa ? parseFloat(i.comxventa.toString()) : undefined,
    maxPrioridadesActivas: i.maxPrioridadesActivas ?? undefined,
    // Nuevos campos:
    estado: i.estadoOperativo, 
    fechaBaja: i.fechaBaja ? i.fechaBaja.toISOString() : undefined,
});

// ==============================
// Obtener todas las Inmobiliarias
// ==============================
export async function getAllInmobiliarias(filters?: { estadoOperativo?: string }): Promise<GetInmobiliariasResponse> {
  const whereClause: any = {};
  
  // Filtro estadoOperativo: default OPERATIVO si no viene
  if (filters?.estadoOperativo) {
    whereClause.estadoOperativo = filters.estadoOperativo;
  } else {
    whereClause.estadoOperativo = 'OPERATIVO'; // Default: solo operativas
  }
  
  const [rows, total, metricsMap] = await Promise.all([
    prisma.inmobiliaria.findMany({
      where: whereClause,
      orderBy: { id: 'asc' },
    }),
    prisma.inmobiliaria.count(),
    calcularMetricasInmobiliarias()
  ]);
  
  const inmobiliarias = rows.map((i) => {
    const base = toInmobiliaria(i);
    const metrics = metricsMap.get(i.id) || {
      ventasTotales: 0,
      ventasActivas: 0,
      reservasTotales: 0,
      reservasActivas: 0,
      prioridadesTotales: 0,
      prioridadesActivas: 0
    };
    
    return {
      ...base,
      // Mantener campos legacy para compatibilidad con frontend
      cantidadVentas: metrics.ventasTotales,
      cantidadReservas: metrics.reservasTotales,
      // Nuevos campos con métricas detalladas
      ventasTotales: metrics.ventasTotales,
      ventasActivas: metrics.ventasActivas,
      reservasTotales: metrics.reservasTotales,
      reservasActivas: metrics.reservasActivas,
      prioridadesTotales: metrics.prioridadesTotales,
      prioridadesActivas: metrics.prioridadesActivas,
      createdAt: i.createdAt,
      updateAt: i.updateAt,
    };
  });
  
  return { inmobiliarias, total };
}

// ==============================
// Obtener una Inmobiliaria por ID
// ==============================
export async function getInmobiliariaById(req: GetInmobiliariaRequest): Promise<GetInmobiliariaResponse> {
    const [inmobiliaria, metrics] = await Promise.all([
        prisma.inmobiliaria.findUnique({
            where: { id: req.idInmobiliaria }
        }),
        calcularMetricasInmobiliaria(req.idInmobiliaria)
    ]);
    
    if (!inmobiliaria) {
        return { inmobiliaria: null, message: 'Inmobiliaria no encontrada' };
    }
    
    const mapped = toInmobiliaria(inmobiliaria);
    return { 
        inmobiliaria: {
            ...mapped,
            // Mantener campos legacy para compatibilidad
            cantidadVentas: metrics.ventasTotales,
            cantidadReservas: metrics.reservasTotales,
            // Nuevos campos con métricas detalladas
            ventasTotales: metrics.ventasTotales,
            ventasActivas: metrics.ventasActivas,
            reservasTotales: metrics.reservasTotales,
            reservasActivas: metrics.reservasActivas,
            prioridadesTotales: metrics.prioridadesTotales,
            prioridadesActivas: metrics.prioridadesActivas,
            createdAt: inmobiliaria.createdAt,
            updateAt: inmobiliaria.updateAt,
        } as any
    };
}


// ==============================
// Crear nueva Inmobiliaria
// ==============================
export async function createInmobiliaria(req: PostInmobiliariaRequest): Promise<PostInmobiliariaResponse> {
    const inmobiliaria = await prisma.inmobiliaria.findFirst({
        where: { nombre: req.nombre }
    });
    
    if (inmobiliaria) {
        const error = new Error('Advertencia: Ya existe una inmobiliaria con ese nombre');
        (error as any).statusCode = 400;
        throw error;
    }

    const newInmobiliaria = await prisma.inmobiliaria.create({
        data: {
            nombre: req.nombre,
            razonSocial: req.razonSocial,
            contacto: req.contacto ?? undefined,
            comxventa: req.comxventa != null ? new Prisma.Decimal(req.comxventa) : undefined,
            user: req.userId != null ? { connect: { id: req.userId } } : undefined,
            maxPrioridadesActivas: req.maxPrioridadesActivas ?? undefined,
            createdAt: new Date(),
            // Por defecto nace OPERATIVA (aunque Prisma lo hace por default, es bueno ser explícito)
            estadoOperativo: 'OPERATIVO', 
            fechaBaja: null
        }
    });
    return { inmobiliaria: toInmobiliaria(newInmobiliaria), message: 'Inmobiliaria creada exitosamente' };
}

// ==============================
// Actualizar Inmobiliaria existente
// ==============================
export async function updateInmobiliaria(idActual: number, updateData: PutInmobiliariaRequest): Promise<PutInmobiliariaResponse> {
  // Verificamos existencia
  const existing = await prisma.inmobiliaria.findUnique({ where: { id: idActual } });
  if (!existing) {
    const e = new Error('Inmobiliaria no encontrada'); (e as any).statusCode = 404; throw e;
  }

  // Bloquear updates si está eliminado
  if (existing.estadoOperativo === 'ELIMINADO') {
    const e = new Error('No se puede editar una inmobiliaria eliminada') as any;
    e.statusCode = 409;
    throw e;
  }

  // Verificamos duplicados de nombre
  if (updateData.nombre) {
    const dup = await prisma.inmobiliaria.findFirst({
      where: { nombre: updateData.nombre, NOT: { id: idActual } },
      select: { id: true },
    });
    if (dup) {
      const e = new Error('El nombre ya existe'); (e as any).statusCode = 400; throw e;
    }
  }

  // IMPORTANTE: NO permitir cambios de estadoOperativo desde update
  // Solo endpoints de desactivar/reactivar pueden cambiar estadoOperativo
  // Ignorar cualquier campo estado/estadoOperativo que venga en updateData

  // Construir data object dinámicamente
  const updatePayload: any = { updateAt: new Date() };
  if (updateData.nombre !== undefined) updatePayload.nombre = updateData.nombre;
  if (updateData.razonSocial !== undefined) updatePayload.razonSocial = updateData.razonSocial;
  if (updateData.contacto !== undefined) updatePayload.contacto = updateData.contacto;
  if (updateData.comxventa !== undefined) updatePayload.comxventa = new Prisma.Decimal(updateData.comxventa);
  if (updateData.userId !== undefined) updatePayload.userId = updateData.userId;
  if (updateData.maxPrioridadesActivas !== undefined) updatePayload.maxPrioridadesActivas = updateData.maxPrioridadesActivas;

  const [updated, metrics] = await Promise.all([
    prisma.inmobiliaria.update({
      where: { id: idActual },
      data: updatePayload
    }),
    calcularMetricasInmobiliaria(idActual)
  ]);

  const mapped = toInmobiliaria(updated);
  return { 
    inmobiliaria: {
      ...mapped,
      cantidadVentas: metrics.ventasTotales,
      cantidadReservas: metrics.reservasTotales,
      ventasTotales: metrics.ventasTotales,
      ventasActivas: metrics.ventasActivas,
      reservasTotales: metrics.reservasTotales,
      reservasActivas: metrics.reservasActivas,
      prioridadesTotales: metrics.prioridadesTotales,
      prioridadesActivas: metrics.prioridadesActivas,
      createdAt: updated.createdAt,
      updateAt: updated.updateAt,
    } as any,
    message: 'Inmobiliaria actualizada correctamente' 
  };
}

// ==============================
// Eliminar Inmobiliaria (Hard Delete)
// ==============================
// Eliminar Inmobiliaria (soft delete - estadoOperativo)
// ==============================
export async function eliminarInmobiliaria(id: number): Promise<PutInmobiliariaResponse> {
  try {
    const existing = await prisma.inmobiliaria.findUnique({
      where: { id },
    });

    if (!existing) {
      const error = new Error('Inmobiliaria no encontrada') as any;
      error.statusCode = 404;
      throw error;
    }

    if (existing.estadoOperativo === 'ELIMINADO') {
      const error = new Error('La inmobiliaria ya está eliminada.') as any;
      error.statusCode = 409;
      throw error;
    }

    const [updated, metrics] = await Promise.all([
      prisma.inmobiliaria.update({
        where: { id },
        data: {
          estadoOperativo: 'ELIMINADO',
          fechaBaja: new Date(),
          updateAt: new Date(),
        }
      }),
      calcularMetricasInmobiliaria(id)
    ]);

    const mapped = toInmobiliaria(updated);
    return { 
      inmobiliaria: {
        ...mapped,
        cantidadVentas: metrics.ventasTotales,
        cantidadReservas: metrics.reservasTotales,
        ventasTotales: metrics.ventasTotales,
        ventasActivas: metrics.ventasActivas,
        reservasTotales: metrics.reservasTotales,
        reservasActivas: metrics.reservasActivas,
        prioridadesTotales: metrics.prioridadesTotales,
        prioridadesActivas: metrics.prioridadesActivas,
        createdAt: updated.createdAt,
        updateAt: updated.updateAt,
      } as any,
      message: 'Inmobiliaria eliminada correctamente' 
    };
  } catch (error) {
    throw error;
  }
}

// ==============================
// Reactivar Inmobiliaria (estadoOperativo)
// ==============================
export async function reactivarInmobiliaria(id: number): Promise<PutInmobiliariaResponse> {
  try {
    const existing = await prisma.inmobiliaria.findUnique({
      where: { id },
    });

    if (!existing) {
      const error = new Error('Inmobiliaria no encontrada') as any;
      error.statusCode = 404;
      throw error;
    }

    if (existing.estadoOperativo === 'OPERATIVO') {
      const error = new Error('La inmobiliaria ya está operativa.') as any;
      error.statusCode = 409;
      throw error;
    }

    const [updated, metrics] = await Promise.all([
      prisma.inmobiliaria.update({
        where: { id },
        data: {
          estadoOperativo: 'OPERATIVO',
          fechaBaja: null,
          updateAt: new Date(),
        }
      }),
      calcularMetricasInmobiliaria(id)
    ]);

    const mapped = toInmobiliaria(updated);
    return { 
      inmobiliaria: {
        ...mapped,
        cantidadVentas: metrics.ventasTotales,
        cantidadReservas: metrics.reservasTotales,
        ventasTotales: metrics.ventasTotales,
        ventasActivas: metrics.ventasActivas,
        reservasTotales: metrics.reservasTotales,
        reservasActivas: metrics.reservasActivas,
        prioridadesTotales: metrics.prioridadesTotales,
        prioridadesActivas: metrics.prioridadesActivas,
        createdAt: updated.createdAt,
        updateAt: updated.updateAt,
      } as any,
      message: 'Inmobiliaria reactivada correctamente' 
    };
  } catch (error) {
    throw error;
  }
}
