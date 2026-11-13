import prisma from '../config/prisma';
import type { Ubicacion as DtoUbicacion, GetUbicacionesResponse, Calle } from '../types/interfacesCCLF';
import type { NombreCalle as PrismaNombreCalle } from '../generated/prisma';

// Map Prisma -> DTO
const toUbicacion = (u: any): DtoUbicacion => ({
  id: u.id,
  calle: normalizeDtoCalle(u.calle),
  numero: u.numero,
});

const normalizeDtoCalle = (p: PrismaNombreCalle): Calle => {
  switch (p) {
    case 'REINAMORA': return 'Reinamora';
    case 'MACA': return 'Maca';
    case 'ZORZAL': return 'Zorzal';
    case 'CAUQUEN': return 'Cauquén';
    case 'ALONDRA': return 'Alondra';
    case 'JACANA': return 'Jacana';
    case 'TACUARITO': return 'Tacuarito';
    case 'JILGUERO': return 'Jilguero';
    case 'GOLONDRINA': return 'Golondrina';
    case 'CALANDRIA': return 'Calandria';
    case 'AGUILAMORA': return 'Aguilamora';
    case 'LORCA': return 'Lorca';
    case 'MILANO': return 'Milano';
    default: throw new Error(`Calle Prisma inválida: ${p}`);
  }
};

// Obtener todas las ubicaciones (listado completo, sin paginación); total = cantidad devuelta
export async function getAllUbicaciones(): Promise<GetUbicacionesResponse> {
  const ubicaciones = await prisma.ubicacion.findMany({
    orderBy: { id: 'asc' },
  });
  return {
    ubicaciones: ubicaciones.map(toUbicacion),
    total: ubicaciones.length,
  };
}

// Obtener por ID
export async function getUbicacionById(id: number): Promise<DtoUbicacion> {
  const u = await prisma.ubicacion.findUnique({ where: { id } });
  if (!u) {
    const e: any = new Error('Ubicación no encontrada');
    e.statusCode = 404;
    throw e;
  }
  return toUbicacion(u);
}
