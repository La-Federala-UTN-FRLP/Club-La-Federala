import prisma from '../config/prisma';
import type { Persona as PrismaPersona, IdentificadorTipo, PersonaCategoria, EstadoLote } from "../generated/prisma";
import type { Identificador, Persona, DeletePersonaResponse, GetPersonaRequest, GetPersonasResponse, PutPersonaResponse, PostPersonaRequest, PostPersonaResponse } from '../types/interfacesCCLF';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// Tipos para views
export type PersonaView = 'ALL' | 'PROPIETARIOS' | 'INQUILINOS' | 'CLIENTES' | 'MIS_CLIENTES';

// DTOs
export interface CreatePersonaDto {
  identificadorTipo: IdentificadorTipo;
  identificadorValor: string;
  nombre?: string;
  apellido?: string;
  razonSocial?: string;
  telefono?: number;
  email?: string;
  jefeDeFamiliaId?: number;
  inmobiliariaId?: number | null; // Opcional, solo para ADMIN/GESTOR
}

export interface UpdatePersonaDto {
  identificadorTipo?: IdentificadorTipo;
  identificadorValor?: string;
  nombre?: string;
  apellido?: string;
  razonSocial?: string;
  telefono?: number;
  email?: string;
  jefeDeFamiliaId?: number;
  estadoOperativo?: 'OPERATIVO' | 'ELIMINADO';
  inmobiliariaId?: number | null;
}

// Tipo local para incluir relaciones y conteos
type PersonaWithRelations = PrismaPersona & {
  _count?: { lotesPropios?: number; lotesAlquilados?: number; alquileres?: number; Reserva?: number; Venta?: number };
  jefeDeFamilia?: Pick<PrismaPersona, 'id' | 'nombre' | 'apellido' | 'identificadorValor'> | null;
  miembrosFamilia?: Array<Pick<PrismaPersona, 'id' | 'nombre' | 'apellido' | 'identificadorValor'>>;
  inmobiliaria?: { id: number; nombre: string } | null;
  lotesPropios?: Array<{ id: number; numero: number | null; mapId: string | null; fraccion: { numero: number } }>;
  lotesAlquilados?: Array<{ id: number; numero: number | null; mapId: string | null; estado: EstadoLote; fraccion: { numero: number } }>;
  Reserva?: Array<{ id: number; numero: string; createdAt: Date; loteId: number }>;
  Venta?: Array<{ id: number; numero: string }>;
};

// Helper para formatear contacto
const formatContacto = (email?: string | null, telefono?: number | null): string | null => {
  if (email && telefono) {
    return `${email},${telefono}`;
  }
  if (email) {
    return email;
  }
  if (telefono) {
    return telefono.toString();
  }
  return null;
};

// Helper para parsear contacto
const parseEmail = (contacto: string | null): string | undefined => {
  if (!contacto) return undefined;
  const emailMatch = contacto.match(/^[^\s@]+@[^\s@]+\.[^\s@]+/);
  return emailMatch ? emailMatch[0] : undefined;
};

const parseTelefono = (contacto: string | null): number | undefined => {
  if (!contacto) return undefined;
  const phoneMatch = contacto.match(/\d+/g);
  if (phoneMatch) {
    return parseInt(phoneMatch.join(''));
  }
  return undefined;
};

// Helper para normalizar identificadorValor (garantiza consistencia antes de persistir)
function normalizeIdentificador(tipo: IdentificadorTipo, valor: string): string {
  let normalized = valor.trim();
  
  // Para CUIL/CUIT, eliminar guiones, espacios y puntos
  if (tipo === 'CUIL' || tipo === 'CUIT') {
    normalized = normalized.replace(/[-.\s]/g, '');
  }
  
  // Para otros tipos, solo trim
  return normalized;
}

// Helper para mapear IdentificadorTipo a Identificador (DTO)
const getTipoIdentificador = (tipo: IdentificadorTipo): Identificador => {
  switch (tipo) {
    case 'DNI':
      return 'DNI';
    case 'CUIL':
      return 'CUIL';
    case 'CUIT':
      return 'CUIT';
    case 'PASAPORTE':
      return 'Pasaporte';
    case 'OTRO':
      return 'CUIL'; // Por defecto para compatibilidad
    default:
      return 'CUIL';
  }
};

// Mapeo de PrismaPersona a Persona (DTO)
// Nota: El tipo de retorno incluye campos adicionales para mini detalles
const toPersona = (p: PersonaWithRelations, telefonoOverride?: number, emailOverride?: string): Persona => {
  const contacto = p.contacto;
  // Usar email del campo propio primero, luego override, luego parsear de contacto
  const email = emailOverride || p.email || parseEmail(contacto);
  const telefono = telefonoOverride || parseTelefono(contacto);

  const esPropietario = (p._count?.lotesPropios ?? 0) > 0;
  // Cambiar lógica: esInquilino se determina por alquileres ACTIVOS
  // Los alquileres ya vienen filtrados por estado='ACTIVO' en el include, así que contar directamente
  const alquileresActivosCount = ((p as any).alquileres || []).length;
  const esInquilino = alquileresActivosCount > 0;

  const jefeDeFamilia = p.jefeDeFamilia
    ? {
        idPersona: p.jefeDeFamilia.id,
        nombre: p.jefeDeFamilia.nombre || '',
        apellido: p.jefeDeFamilia.apellido || '',
        cuil: p.jefeDeFamilia.identificadorValor || '',
      }
    : null;

  const miembrosFamilia = (p.miembrosFamilia ?? []).map((m) => ({
    idPersona: m.id,
    nombre: m.nombre || '',
    apellido: m.apellido || '',
    cuil: m.identificadorValor || '',
  }));

  const esJefeDeFamilia = (p.miembrosFamilia?.length ?? 0) > 0;

  return {
    idPersona: p.id,
    nombre: p.nombre || '',
    apellido: p.apellido || '',
    razonSocial: p.razonSocial || '',
    identificador: getTipoIdentificador(p.identificadorTipo),
    identificadorTipo: p.identificadorTipo,
    identificadorValor: p.identificadorValor || '',
    email: email,
    telefono: telefono,
    contacto: p.contacto || '',
    estado: p.estadoOperativo || 'OPERATIVO',
    createdAt: p.createdAt,
    inmobiliariaId: p.inmobiliariaId || null,
    inmobiliaria: p.inmobiliaria || null,
    esPropietario,
    esInquilino,
    jefeDeFamilia,
    miembrosFamilia,
    esJefeDeFamilia,
    _count: p._count ? {
      lotesPropios: p._count.lotesPropios ?? 0,
      lotesAlquilados: p._count.lotesAlquilados ?? 0,
      alquileres: ((p as any).alquileres || []).length,
      Reserva: p._count.Reserva ?? 0,
      Venta: p._count.Venta ?? 0,
    } : { lotesPropios: 0, lotesAlquilados: 0, alquileres: 0, Reserva: 0, Venta: 0 },
    // Arrays mínimos para mini detalles (campos adicionales al tipo Persona)
    lotesPropios: (p.lotesPropios || []).map(l => ({
      id: l.id,
      numero: l.numero,
      mapId: (l as any).mapId ?? null,
      fraccionNumero: l.fraccion?.numero ?? 0,
    })),
    lotesAlquilados: (p.lotesAlquilados || []).map(l => ({
      id: l.id,
      numero: l.numero,
      mapId: (l as any).mapId ?? null,
      fraccionNumero: l.fraccion?.numero ?? 0,
      estado: l.estado,
    })),
    alquileresActivos: ((p as any).alquileres || []).map((a: any) => ({
      id: a.lote?.id,
      numero: a.lote?.numero,
      mapId: a.lote?.mapId ?? null,
      fraccionNumero: a.lote?.fraccion?.numero ?? 0,
      estado: 'ALQUILADO',
    })),
    reservas: (p.Reserva || []).map(r => ({
      id: r.id,
      numero: r.numero,
      createdAt: r.createdAt,
      loteId: r.loteId,
    })),
    ventas: (p.Venta || []).map(v => ({
      id: v.id,
      numero: v.numero,
    })),
  } as Persona & { lotesPropios?: any[]; lotesAlquilados?: any[]; reservas?: any[]; ventas?: any[] };
};

// Construir where clause según view
function buildWhereClause(
  view: PersonaView,
  user?: { role: string; inmobiliariaId?: number | null },
  q?: string,
  includeInactive?: boolean,
  estadoOperativo?: 'OPERATIVO' | 'ELIMINADO'
) {
  const where: any = {};

  // Excluir MIEMBRO_FAMILIAR por defecto (solo mostrar personas operativas)
  (where as any).categoria = 'OPERATIVA';

  // Filtro estadoOperativo: default OPERATIVO si no viene
  if (estadoOperativo) {
    where.estadoOperativo = estadoOperativo;
  } else if (!includeInactive) {
    // Por defecto, solo operativas si no se especifica estadoOperativo
    where.estadoOperativo = 'OPERATIVO';
  }

  // Filtro por view
  switch (view) {
    case 'PROPIETARIOS':
      where.lotesPropios = { some: {} };
      break;

    case 'INQUILINOS':
      where.alquileres = {
        some: {
          estado: 'ACTIVO',
        },
      };
      break;

    case 'CLIENTES':
      where.lotesPropios = { none: {} };
      where.alquileres = {
        none: {
          estado: 'ACTIVO',
        },
      };
      break;

    case 'MIS_CLIENTES':
      // CLIENTES + filtro por inmobiliariaId
      where.lotesPropios = { none: {} };
      where.alquileres = {
        none: {
          estado: 'ACTIVO',
        },
      };
      if (user?.inmobiliariaId) {
        where.inmobiliariaId = user.inmobiliariaId;
      } else {
        // Si no tiene inmobiliariaId, no devolver nada
        where.id = -1; // Imposible
      }
      break;

    case 'ALL':
    default:
      // Sin filtro adicional de view
      break;
  }

  // Buscador q
  if (q && q.trim()) {
    const searchTerm = q.trim();
    where.OR = [
      { nombre: { contains: searchTerm, mode: 'insensitive' } },
      { apellido: { contains: searchTerm, mode: 'insensitive' } },
      { razonSocial: { contains: searchTerm, mode: 'insensitive' } },
      { identificadorValor: { contains: searchTerm, mode: 'insensitive' } },
      { contacto: { contains: searchTerm, mode: 'insensitive' } },
    ];
  }

  return where;
}

// ------------------------------------------------------
// Aca comienza el crud
// ------------------------------------------------------

// Obtener todas las personas con filtros
export async function getAllPersonas(
  user?: { role: string; inmobiliariaId?: number | null },
  query?: {
    view?: PersonaView;
    q?: string;
    includeInactive?: boolean;
    estadoOperativo?: 'OPERATIVO' | 'ELIMINADO';
    limit?: number;
  }
): Promise<GetPersonasResponse> {
  const view = query?.view || 'ALL';
  const q = query?.q;
  const includeInactive = query?.includeInactive === true;
  const estadoOperativo = query?.estadoOperativo;
  const limit = query?.limit || 100;

  // RBAC: INMOBILIARIA solo puede ver MIS_CLIENTES (forzar view, ignorar query)
  if (user?.role === 'INMOBILIARIA') {
    // Validar que tenga inmobiliariaId
    if (!user.inmobiliariaId) {
      const error = new Error('INMOBILIARIA debe tener inmobiliariaId asociado') as any;
      error.statusCode = 403;
      throw error;
    }
    // Forzar view = MIS_CLIENTES (ignorar lo que venga en query)
    const effectiveView = 'MIS_CLIENTES';
    // includeInactive solo para ADMIN/GESTOR
    const effectiveIncludeInactive = false;
    // INMOBILIARIA no puede filtrar por estadoOperativo específico, solo ve operativas
    const where = buildWhereClause(effectiveView, user, q, effectiveIncludeInactive);

    const personas = await prisma.persona.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, username: true, email: true, role: true, createdAt: true } },
        _count: { 
          select: { 
            lotesPropios: true, 
            lotesAlquilados: true,
            alquileres: true,
            Reserva: true, 
            Venta: true
          } 
        },
        alquileres: {
          where: { estado: 'ACTIVO' },
          select: { id: true, estado: true },
        },
        jefeDeFamilia: { select: { id: true, nombre: true, apellido: true, identificadorValor: true } },
        miembrosFamilia: { select: { id: true, nombre: true, apellido: true, identificadorValor: true } },
        inmobiliaria: { select: { id: true, nombre: true } },
      },
    });

    return {
      personas: personas.map((p) => toPersona(p as PersonaWithRelations)),
      total: await prisma.persona.count({ where }),
    };
  }

  // ADMINISTRADOR/GESTOR/TECNICO pueden ver todas las views
  // includeInactive solo para ADMIN/GESTOR
  const effectiveIncludeInactive = (user?.role === 'ADMINISTRADOR' || user?.role === 'GESTOR') 
    ? includeInactive 
    : false;
  // Solo ADMIN/GESTOR pueden filtrar por estadoOperativo específico
  const effectiveEstadoOperativo = (user?.role === 'ADMINISTRADOR' || user?.role === 'GESTOR') 
    ? estadoOperativo 
    : undefined;
  const where = buildWhereClause(view, user, q, effectiveIncludeInactive, effectiveEstadoOperativo);

  const personas = await prisma.persona.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: { select: { id: true, username: true, email: true, role: true } },
      _count: { 
        select: { 
          lotesPropios: true, 
          lotesAlquilados: true,
          alquileres: true,
          Reserva: true, 
          Venta: true 
        } 
      },
      // Incluir alquileres activos para obtener los lotes alquilados actuales
      alquileres: {
        where: { estado: 'ACTIVO' },
        select: {
          id: true,
          estado: true,
          lote: {
            select: {
              id: true,
              numero: true,
              mapId: true,
              fraccion: { select: { numero: true } }
            }
          }
        },
        take: 10,
      },
      jefeDeFamilia: { select: { id: true, nombre: true, apellido: true, identificadorValor: true } },
      miembrosFamilia: { select: { id: true, nombre: true, apellido: true, identificadorValor: true } },
      inmobiliaria: { select: { id: true, nombre: true } },
    },
  });

  return {
    personas: personas.map((p) => toPersona(p as PersonaWithRelations)),
    total: await prisma.persona.count({ where }),
  };
}

// Obtener persona por ID
export async function getPersonaById(
  id: number,
  user?: { role: string }
): Promise<Persona> {
  const persona = await prisma.persona.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, email: true, role: true } },
      _count: { 
        select: { 
          lotesPropios: true, 
          lotesAlquilados: true, 
          Reserva: true, 
          Venta: true,
          alquileres: true
        } 
      },
      // Incluir alquileres activos para obtener los lotes alquilados actuales
      alquileres: {
        where: { estado: 'ACTIVO' },
        select: {
          id: true,
          estado: true,
          lote: {
            select: {
              id: true,
              numero: true,
              mapId: true,
              fraccion: { select: { numero: true } }
            }
          }
        },
        take: 10,
      },
      jefeDeFamilia: { select: { id: true, nombre: true, apellido: true, identificadorValor: true } },
      miembrosFamilia: { select: { id: true, nombre: true, apellido: true, identificadorValor: true } },
      inmobiliaria: { select: { id: true, nombre: true } },
      // Arrays mínimos para mini detalles
      lotesPropios: {
        select: { id: true, numero: true, mapId: true, fraccion: { select: { numero: true } } },
        take: 10, // Límite razonable para el mini detalle
      },
      lotesAlquilados: {
        select: { id: true, numero: true, mapId: true, estado: true, fraccion: { select: { numero: true } } },
        where: { estado: 'ALQUILADO' },
        take: 10,
      },
      Reserva: {
        select: { id: true, numero: true, createdAt: true, loteId: true },
        take: 10,
        orderBy: { createdAt: 'desc' },
      },
      Venta: {
        select: { id: true, numero: true },
        take: 10,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!persona) {
    const error = new Error('Persona no encontrada');
    (error as any).statusCode = 404;
    throw error;
  }

  // Soft delete: solo ADMIN/GESTOR pueden ver personas ELIMINADAS
  if (persona.estadoOperativo === 'ELIMINADO') {
    if (user?.role !== 'ADMINISTRADOR' && user?.role !== 'GESTOR') {
      const error = new Error('Persona no encontrada') as any;
      error.statusCode = 404; // 404 para no revelar existencia
      throw error;
    }
  }

  return toPersona(persona as PersonaWithRelations);
}

// Crear persona
export async function createPersona(
  req: CreatePersonaDto,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<Persona> {
  
  // Normalizar identificadorValor antes de verificar existencia
  const identificadorValorNormalized = normalizeIdentificador(req.identificadorTipo, req.identificadorValor);
  
  // Verificar si ya existe una persona con el mismo identificador
  const exists = await prisma.persona.findUnique({
    where: {
      identificadorTipo_identificadorValor: {
        identificadorTipo: req.identificadorTipo,
        identificadorValor: identificadorValorNormalized,
      },
    },
  });

  if (exists) {
    const error = new Error('Ya existe una persona con ese identificador') as any;
    error.statusCode = 409;
    throw error;
  }

  // RBAC: Forzar "Cliente de" según rol
  let finalInmobiliariaId: number | null | undefined = undefined;
  
  if (user?.role === 'INMOBILIARIA') {
    // INMOBILIARIA: ignorar cualquier inmobiliariaId del body, usar solo la del usuario
    if (!user.inmobiliariaId) {
      const error = new Error('INMOBILIARIA debe tener inmobiliariaId asociado') as any;
      error.statusCode = 403;
      throw error;
    }
    finalInmobiliariaId = user.inmobiliariaId;
  } else if (user?.role === 'ADMINISTRADOR' || user?.role === 'GESTOR') {
    // ADMIN/GESTOR: usar exactamente lo que viene del body
    if (req.inmobiliariaId !== undefined) {
      // Si es un número, validar que la inmobiliaria exista
      if (req.inmobiliariaId !== null) {
        const inmobiliariaExists = await prisma.inmobiliaria.findUnique({
          where: { id: req.inmobiliariaId },
        });
        if (!inmobiliariaExists) {
          const error = new Error('La inmobiliaria especificada no existe') as any;
          error.statusCode = 400;
          throw error;
        }
      }
      finalInmobiliariaId = req.inmobiliariaId;
    }
  }

  // Construir data (usar valor normalizado)
  const createData: any = {
    identificadorTipo: req.identificadorTipo,
    identificadorValor: identificadorValorNormalized,
    nombre: req.nombre?.trim(),
    apellido: req.apellido?.trim(),
    razonSocial: req.razonSocial?.trim(),
    contacto: formatContacto(req.email, req.telefono),
    updateAt: new Date(),
    estadoOperativo: 'OPERATIVO',
  };

  // Incluir inmobiliariaId solo si está definido (puede ser null para "La Federala", ver dsp si esto camnbia a inm)
  if (finalInmobiliariaId !== undefined) {
    createData.inmobiliariaId = finalInmobiliariaId;
  }

  // Normalizar jefe de familia
  const jefeIdNormalized =
    req.jefeDeFamiliaId !== undefined &&
    req.jefeDeFamiliaId !== null &&
    !Number.isNaN(Number(req.jefeDeFamiliaId))
      ? Number(req.jefeDeFamiliaId)
      : undefined;

  let created;
  try {
    created = await prisma.persona.create({ data: createData });

    // Si vino jefeDeFamiliaId, vincularlo
    if (jefeIdNormalized !== undefined) {
      await prisma.persona.update({
        where: { id: created.id },
        data: { jefeDeFamilia: { connect: { id: jefeIdNormalized } } },
      });
    }
  } catch (e: any) {
    if (e instanceof PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        const error = new Error('Ya existe una persona con ese identificador') as any;
        error.statusCode = 409;
        throw error;
      }
    }
    throw e;
  }

  // Releer con includes
  const full = await prisma.persona.findUnique({
    where: { id: created.id },
    include: {
      user: { select: { id: true, username: true, email: true, role: true } },
      _count: { 
        select: { 
          lotesPropios: true, 
          alquileres: true 
        } 
      },
      alquileres: {
        where: { estado: 'ACTIVO' },
        select: {
          id: true,
          estado: true,
        },
      },
      jefeDeFamilia: { select: { id: true, nombre: true, apellido: true, identificadorValor: true } },
      miembrosFamilia: { select: { id: true, nombre: true, apellido: true, identificadorValor: true } },
      inmobiliaria: { select: { id: true, nombre: true } },
    },
  });

  return toPersona(full as PersonaWithRelations, req.telefono, req.email);
}

// Actualizar persona
export async function updatePersona(idActual: number, req: UpdatePersonaDto): Promise<PutPersonaResponse> {
  try {
    const existingPersona = await prisma.persona.findUnique({
      where: { id: idActual },
    });

    if (!existingPersona) {
      const error = new Error('Persona no encontrada') as any;
      error.statusCode = 404;
      throw error;
    }

    // Bloquear updates si está eliminado
    if (existingPersona.estadoOperativo === 'ELIMINADO') {
      const error = new Error('No se puede editar una persona eliminada') as any;
      error.statusCode = 409;
      throw error;
    }

    const updateData: any = {
      updateAt: new Date(),
    };

    if (req.nombre !== undefined) updateData.nombre = req.nombre.trim();
    if (req.apellido !== undefined) updateData.apellido = req.apellido.trim();
    if (req.razonSocial !== undefined) updateData.razonSocial = req.razonSocial.trim();

    // Si viene identificador, normalizar y validar unicidad
    if (req.identificadorTipo && req.identificadorValor) {
      const identificadorValorNormalized = normalizeIdentificador(req.identificadorTipo, req.identificadorValor);
      const nuevoIdentificador = {
        identificadorTipo: req.identificadorTipo,
        identificadorValor: identificadorValorNormalized,
      };

      // Verificar si cambió el identificador
      if (
        existingPersona.identificadorTipo !== nuevoIdentificador.identificadorTipo ||
        existingPersona.identificadorValor !== nuevoIdentificador.identificadorValor
      ) {
        // Verificar que no exista otra persona con el mismo identificador
        const duplicate = await prisma.persona.findUnique({
          where: {
            identificadorTipo_identificadorValor: nuevoIdentificador,
          },
        });

        if (duplicate && duplicate.id !== idActual) {
          const error = new Error('Ya existe una persona con ese identificador') as any;
          error.statusCode = 409;
          throw error;
        }

        updateData.identificadorTipo = nuevoIdentificador.identificadorTipo;
        updateData.identificadorValor = nuevoIdentificador.identificadorValor;
      }
    }

    // Actualizar email si viene (puede ser null para limpiarlo)
    if (req.email !== undefined) {
      updateData.email = req.email === null ? null : (req.email?.trim() || null);
    }
    
    // Actualizar contacto si viene telefono o email
    // El telefono NO es un campo directo en Prisma, se guarda en 'contacto'
    if (req.email !== undefined || req.telefono !== undefined) {
      // Obtener valores: si viene undefined, mantener el existente; si viene null, limpiar
      let emailValue: string | null | undefined;
      let telefonoValue: number | null | undefined;
      
      if (req.email !== undefined) {
        // Si viene email, usar el valor (puede ser null para limpiar)
        emailValue = req.email === null ? null : (req.email?.trim() || null);
      } else {
        // Si no viene email, mantener el existente
        emailValue = existingPersona.email || parseEmail(existingPersona.contacto) || null;
      }
      
      if (req.telefono !== undefined) {
        // Si viene telefono, usar el valor (puede ser null para limpiar)
        telefonoValue = req.telefono === null ? null : req.telefono;
      } else {
        // Si no viene telefono, mantener el existente
        telefonoValue = parseTelefono(existingPersona.contacto) || null;
      }
      
      // Formatear contacto: pasar null como undefined para que formatContacto lo maneje
      updateData.contacto = formatContacto(
        emailValue === null ? undefined : emailValue,
        telefonoValue === null ? undefined : telefonoValue
      );
    }

    // inmobiliariaId solo para ADMIN/GESTOR (validar en controller si es necesario)
    if (req.inmobiliariaId !== undefined) {
      updateData.inmobiliariaId = req.inmobiliariaId;
    }

    // IMPORTANTE: NO permitir cambios de estadoOperativo desde update
    // Solo endpoints de desactivar/reactivar pueden cambiar estadoOperativo
    // Ignorar cualquier campo estado/estadoOperativo que venga en req

    // Construir data final para Prisma
    const finalData: any = {
      ...updateData,
      // NO incluir estadoOperativo ni fechaBaja - solo endpoints específicos pueden cambiarlos
    };

    const updated = await prisma.persona.update({
      where: { id: idActual },
      data: finalData,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
        inmobiliaria: { select: { id: true, nombre: true } },
      },
    });

    return {
      persona: toPersona(updated, req.telefono, req.email),
      message: 'La persona se actualizó con éxito',
    };
  } catch (e: any) {
    if (e instanceof PrismaClientKnownRequestError) {
      if (e.code === 'P2025') {
        const error = new Error('Persona no encontrada') as any;
        error.statusCode = 404;
        throw error;
      }
      if (e.code === 'P2002') {
        const error = new Error('Ya existe una persona con ese identificador') as any;
        error.statusCode = 409;
        throw error;
      }
    }
    throw e;
  }
}

// Desactivar persona (soft delete)
export async function eliminarPersona(
  id: number,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<DeletePersonaResponse> {
  try {
    const existingPersona = await prisma.persona.findUnique({
      where: { id },
      include: {
        alquileres: {
          where: { estado: 'ACTIVO' },
          select: { id: true, loteId: true },
        },
      },
    });

    if (!existingPersona) {
      const error = new Error('Persona no encontrada') as any;
      error.statusCode = 404;
      throw error;
    }

    if (existingPersona.estadoOperativo === 'ELIMINADO') {
      const error = new Error('La persona ya está eliminada.') as any;
      error.statusCode = 409;
      throw error;
    }

    // Validar: no se puede desactivar si tiene alquileres activos
    if (existingPersona.alquileres && existingPersona.alquileres.length > 0) {
      const error = new Error('No se puede desactivar: la persona es inquilino activo de un lote. Finaliza el alquiler antes.') as any;
      error.statusCode = 409;
      throw error;
    }

    await prisma.persona.update({
      where: { id },
      data: {
        estadoOperativo: 'ELIMINADO',
        fechaBaja: new Date(),
        updateAt: new Date(),
      },
    });

    return { message: 'Persona desactivada con éxito' };
  } catch (e: any) {
    if (e instanceof PrismaClientKnownRequestError) {
      if (e.code === 'P2025') {
        const error = new Error('Persona no encontrada') as any;
        error.statusCode = 404;
        throw error;
      }
    }
    throw e;
  }
}

// Reactivar persona (estadoOperativo)
export async function reactivarPersona(
  id: number,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<PutPersonaResponse> {
  try {
    const existingPersona = await prisma.persona.findUnique({
      where: { id },
    });

    if (!existingPersona) {
      const error = new Error('Persona no encontrada') as any;
      error.statusCode = 404;
      throw error;
    }

    if (existingPersona.estadoOperativo === 'OPERATIVO') {
      const error = new Error('La persona ya está operativa.') as any;
      error.statusCode = 409;
      throw error;
    }

    const updated = await prisma.persona.update({
      where: { id },
      data: {
        estadoOperativo: 'OPERATIVO',
        fechaBaja: null,
        updateAt: new Date(),
      },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
        inmobiliaria: { select: { id: true, nombre: true } },
      },
    });

    return {
      persona: toPersona(updated as PersonaWithRelations),
      message: 'Persona reactivada con éxito',
    };
  } catch (e: any) {
    if (e instanceof PrismaClientKnownRequestError) {
      if (e.code === 'P2025') {
        const error = new Error('Persona no encontrada') as any;
        error.statusCode = 404;
        throw error;
      }
    }
    throw e;
  }
}

// Eliminar persona definitivamente (hard delete) - solo si no tiene asociaciones
export async function deletePersonaDefinitivo(id: number): Promise<DeletePersonaResponse> {
  try {
    const existingPersona = await prisma.persona.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            lotesPropios: true,
            lotesAlquilados: true,
            alquileres: true,
            Reserva: true,
            Venta: true,
          },
        },
      },
    });

    if (!existingPersona) {
      const error = new Error('Persona no encontrada') as any;
      error.statusCode = 404;
      throw error;
    }

    // Validar que no tenga asociaciones
    const counts = existingPersona._count || {};
    const tieneAsociaciones = 
      (counts.lotesPropios || 0) > 0 ||
      (counts.lotesAlquilados || 0) > 0 ||
      (counts.alquileres || 0) > 0 ||
      (counts.Reserva || 0) > 0 ||
      (counts.Venta || 0) > 0;

    if (tieneAsociaciones) {
      const error = new Error(
        'No se puede eliminar definitivamente porque tiene asociaciones (lotes, reservas o ventas)'
      ) as any;
      error.statusCode = 409;
      throw error;
    }

    await prisma.persona.delete({
      where: { id },
    });

    return { message: 'Persona eliminada definitivamente' };
  } catch (e: any) {
    if (e instanceof PrismaClientKnownRequestError) {
      if (e.code === 'P2025') {
        const error = new Error('Persona no encontrada') as any;
        error.statusCode = 404;
        throw error;
      }
    }
    throw e;
  }
}

// Mantener deletePersona por compatibilidad (ahora llama a eliminar)
export async function deletePersona(id: number): Promise<DeletePersonaResponse> {
  return eliminarPersona(id);
}

// Mantener desactivarPersona por compatibilidad (ahora llama a eliminar)
export async function desactivarPersona(id: number): Promise<DeletePersonaResponse> {
  return eliminarPersona(id);
}

// Buscar persona por identificador (nuevo método)
export async function getPersonaByIdentificador(
  tipo: IdentificadorTipo,
  valor: string
): Promise<Persona | null> {
  const valorNormalized = normalizeIdentificador(tipo, valor);
  
  const persona = await prisma.persona.findUnique({
    where: {
      identificadorTipo_identificadorValor: {
        identificadorTipo: tipo,
        identificadorValor: valorNormalized,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
        },
      },
      inmobiliaria: { select: { id: true, nombre: true } },
    },
  });

  if (!persona) return null;

  return toPersona(persona);
}

// Buscar persona por CUIL (legacy endpoint - compatibilidad)
export async function getPersonaByCuil(cuil: string): Promise<Persona | null> {
  // Normalizar CUIL (quitar guiones, espacios, puntos)
  const cuilNormalized = cuil.trim().replace(/[-.\s]/g, '');
  
  // 1. Buscar primero por identificadorTipo=CUIL con valor normalizado
  let persona = await prisma.persona.findUnique({
    where: {
      identificadorTipo_identificadorValor: {
        identificadorTipo: 'CUIL',
        identificadorValor: cuilNormalized,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
        },
      },
      inmobiliaria: { select: { id: true, nombre: true } },
    },
  });

  // 2. Si no se encuentra, buscar por campo cuil
  if (!persona) {
    persona = await prisma.persona.findFirst({
      where: {
        cuil: cuilNormalized,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
        inmobiliaria: { select: { id: true, nombre: true } },
      },
    });
  }

  if (!persona) return null;

  return toPersona(persona);
}

// Asignar referencias a las funciones después de que estén definidas (antes de la clase)
const desactivarPersonaFn = desactivarPersona;
const reactivarPersonaFn = reactivarPersona;
const deletePersonaDefinitivoFn = deletePersonaDefinitivo;

// Clase de servicio para mantener compatibilidad
export class PersonaService {
  async create(data: CreatePersonaDto, user?: { role: string; inmobiliariaId?: number | null }) {
    return createPersona(data, user);
  }

  async findAll(
    user?: { role: string; inmobiliariaId?: number | null },
    query?: { view?: PersonaView; q?: string; includeInactive?: boolean; estadoOperativo?: 'OPERATIVO' | 'ELIMINADO'; limit?: number }
  ) {
    const result = await getAllPersonas(user, query);
    return result;
  }

  async findById(id: number, user?: { role: string }) {
    return getPersonaById(id, user);
  }

  async update(id: number, data: UpdatePersonaDto) {
    return updatePersona(id, data);
  }

  async delete(id: number) {
    return deletePersona(id);
  }

  async findByIdentificador(tipo: IdentificadorTipo, valor: string) {
    return getPersonaByIdentificador(tipo, valor);
  }

  async findByCuil(cuil: string) {
    return getPersonaByCuil(cuil);
  }

  async desactivarPersona(id: number) {
    return desactivarPersonaFn(id);
  }

  async reactivarPersona(id: number) {
    return reactivarPersonaFn(id);
  }

  async deletePersonaDefinitivo(id: number) {
    return deletePersonaDefinitivoFn(id);
  }

  async getGrupoFamiliar(titularId: number) {
    return getGrupoFamiliarFn(titularId);
  }

  async crearMiembroFamiliar(titularId: number, data: { nombre: string; apellido: string; identificadorTipo: IdentificadorTipo; identificadorValor: string }) {
    return crearMiembroFamiliarFn(titularId, data);
  }

  async eliminarMiembroFamiliar(titularId: number, miembroId: number) {
    return eliminarMiembroFamiliarFn(titularId, miembroId);
  }
}

// ===================
// Funciones de Grupo Familiar
// ===================

// Obtener grupo familiar de una persona
export async function getGrupoFamiliar(titularId: number) {
  const persona = await prisma.persona.findUnique({
    where: { id: titularId },
    include: {
      jefeDeFamilia: { select: { id: true, nombre: true, apellido: true, identificadorTipo: true, identificadorValor: true } },
      miembrosFamilia: { 
        where: { categoria: 'MIEMBRO_FAMILIAR' as any },
        select: { id: true, nombre: true, apellido: true, identificadorTipo: true, identificadorValor: true }
      },
      _count: { 
        select: { 
          lotesPropios: true, 
          alquileres: true 
        } 
      },
      alquileres: {
        where: { estado: 'ACTIVO' },
        select: {
          id: true,
          estado: true,
        },
      },
    },
  });

  if (!persona) {
    const error = new Error('Persona no encontrada') as any;
    error.statusCode = 404;
    throw error;
  }

  // Determinar titular: si tiene jefeDeFamilia, el titular es el jefe; si no, es la persona misma
  let titular;
  if (persona.jefeDeFamiliaId) {
    titular = persona.jefeDeFamilia;
    if (!titular) {
      const error = new Error('Jefe de familia no encontrado') as any;
      error.statusCode = 404;
      throw error;
    }
  } else {
    titular = {
      id: persona.id,
      nombre: persona.nombre || '',
      apellido: persona.apellido || '',
      razonSocial: persona.razonSocial || null,
      identificadorTipo: persona.identificadorTipo,
      identificadorValor: persona.identificadorValor,
    };
  }

  const esPropietario = (persona._count?.lotesPropios ?? 0) > 0;
  const esInquilino = ((persona as any).alquileres || []).length > 0;
  
  if (!esPropietario && !esInquilino) {
    const error = new Error('Grupo familiar aplica solo a propietarios o inquilinos') as any;
    error.statusCode = 400;
    throw error;
  }

  // NOTA: Ya no bloqueamos GET si está eliminado - se permite visualizar
  // La validación de estadoOperativo solo aplica para mutaciones (POST/DELETE)

  return {
    titular: {
      id: titular.id,
      nombre: titular.nombre || '',
      apellido: titular.apellido || '',
      razonSocial: (titular as any).razonSocial || null,
      identificadorTipo: titular.identificadorTipo,
      identificadorValor: titular.identificadorValor,
    },
    miembros: (persona.miembrosFamilia || []).map((m) => ({
      id: m.id,
      nombre: m.nombre || '',
      apellido: m.apellido || '',
      identificadorTipo: m.identificadorTipo,
      identificadorValor: m.identificadorValor,
    })),
  };
}

// Crear miembro familiar
export async function crearMiembroFamiliar(
  titularId: number,
  data: { nombre: string; apellido: string; identificadorTipo: IdentificadorTipo; identificadorValor: string }
) {
  // Validar titular
  const titular = await prisma.persona.findUnique({
    where: { id: titularId },
    include: {
      _count: { 
        select: { 
          lotesPropios: true, 
          alquileres: true 
        } 
      },
      alquileres: {
        where: { estado: 'ACTIVO' },
        select: {
          id: true,
          estado: true,
        },
      },
    },
  });

  if (!titular) {
    const error = new Error('Titular no encontrado') as any;
    error.statusCode = 404;
    throw error;
  }

  // Validar que el titular sea aplicable
  const esPropietario = (titular._count?.lotesPropios ?? 0) > 0;
  const alquileresActivosCount = ((titular as any).alquileres || []).length;
  const esInquilino = alquileresActivosCount > 0;
  
  if (!esPropietario && !esInquilino) {
    const error = new Error('Grupo familiar aplica solo a propietarios o inquilinos') as any;
    error.statusCode = 400;
    throw error;
  }

  // Bloquear mutaciones si titular está eliminado
  if (titular.estadoOperativo === 'ELIMINADO') {
    const error = new Error('No se puede modificar el grupo familiar de un titular eliminado') as any;
    error.statusCode = 409;
    throw error;
  }

  // Normalizar identificadorValor
  const identificadorValorNormalized = normalizeIdentificador(data.identificadorTipo, data.identificadorValor);

  // Verificar si ya existe una persona con el mismo identificador
  const exists = await prisma.persona.findUnique({
    where: {
      identificadorTipo_identificadorValor: {
        identificadorTipo: data.identificadorTipo,
        identificadorValor: identificadorValorNormalized,
      },
    },
  });

  if (exists) {
    const error = new Error('Ya existe una persona con ese identificador') as any;
    error.statusCode = 409;
    throw error;
  }

  // Crear miembro familiar
  const miembro = await prisma.persona.create({
    data: {
      identificadorTipo: data.identificadorTipo,
      identificadorValor: identificadorValorNormalized,
      nombre: data.nombre.trim(),
      apellido: data.apellido.trim(),
      categoria: 'MIEMBRO_FAMILIAR',
      jefeDeFamiliaId: titularId,
      inmobiliariaId: titular.inmobiliariaId, // Heredar inmobiliariaId del titular
      estadoOperativo: 'OPERATIVO',
      updateAt: new Date(),
    },
    select: {
      id: true,
      nombre: true,
      apellido: true,
      identificadorTipo: true,
      identificadorValor: true,
    },
  });

  return miembro;
}

// Eliminar miembro familiar
export async function eliminarMiembroFamiliar(titularId: number, miembroId: number) {
  // Validar titular (para verificar estadoOperativo)
  const titular = await prisma.persona.findUnique({
    where: { id: titularId },
  });

  if (!titular) {
    const error = new Error('Titular no encontrado') as any;
    error.statusCode = 404;
    throw error;
  }

  // Bloquear mutaciones si titular está eliminado
  if (titular.estadoOperativo === 'ELIMINADO') {
    const error = new Error('No se puede modificar el grupo familiar de un titular eliminado') as any;
    error.statusCode = 409;
    throw error;
  }

  // Validar miembro
  const miembro = await prisma.persona.findUnique({
    where: { id: miembroId },
  });

  if (!miembro) {
    const error = new Error('Miembro no encontrado') as any;
    error.statusCode = 404;
    throw error;
  }

  // Validar que sea MIEMBRO_FAMILIAR
  if ((miembro as any).categoria !== 'MIEMBRO_FAMILIAR') {
    const error = new Error('Solo se pueden eliminar miembros familiares') as any;
    error.statusCode = 400;
    throw error;
  }

  // Validar que pertenezca al titular
  if (miembro.jefeDeFamiliaId !== titularId) {
    const error = new Error('El miembro no pertenece a este grupo familiar') as any;
    error.statusCode = 400;
    throw error;
  }

  // Eliminar el miembro (hard delete)
  await prisma.persona.delete({
    where: { id: miembroId },
  });

  return { success: true };
}

// Asignar referencias para la clase
const getGrupoFamiliarFn = getGrupoFamiliar;
const crearMiembroFamiliarFn = crearMiembroFamiliar;
const eliminarMiembroFamiliarFn = eliminarMiembroFamiliar;
