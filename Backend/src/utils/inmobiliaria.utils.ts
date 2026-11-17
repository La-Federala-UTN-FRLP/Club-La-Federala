import prisma from '../config/prisma';

/**
 * Convención del proyecto: inmobiliariaId null = La Federala (CCLF).
 * Centraliza la detección para evitar hardcodear la lógica en múltiples archivos.
 */
export function isFederalaInmobiliaria(inmobiliariaId: number | null | undefined): boolean {
    return inmobiliariaId == null;
}

export const MENSAJE_INMOBILIARIA_NO_OPERATIVA = 'La inmobiliaria seleccionada no está disponible para operar.';

/**
 * D1: una inmobiliaria ELIMINADO no participa en operaciones nuevas (crear o reasignar).
 * Los registros históricos que ya la referencian no se tocan: esta regla solo se aplica cuando una
 * operación asocia la inmobiliaria (alta, o update que cambia inmobiliariaId).
 * 409: la inmobiliaria existe, pero su estado operativo choca con la operación (mismo criterio que
 * operar sobre otras entidades ELIMINADO: venta eliminada, titular eliminado).
 */
export function assertInmobiliariaOperativa(inmobiliaria: { estadoOperativo: string } | null | undefined): void {
    if (inmobiliaria && inmobiliaria.estadoOperativo !== 'OPERATIVO') {
        const error = new Error(MENSAJE_INMOBILIARIA_NO_OPERATIVA) as Error & { statusCode: number };
        error.statusCode = 409;
        throw error;
    }
}

/**
 * Igual que assertInmobiliariaOperativa, leyendo la inmobiliaria por id. null = La Federala: no
 * aplica. Si el id no existe no lanza: lo resuelve la regla de existencia del caller o la FK (409),
 * sin cambiar ese contrato.
 */
export async function assertInmobiliariaAsignable(inmobiliariaId: number | null | undefined): Promise<void> {
    if (isFederalaInmobiliaria(inmobiliariaId)) return;
    const inmobiliaria = await prisma.inmobiliaria.findUnique({
        where: { id: inmobiliariaId as number },
        select: { estadoOperativo: true },
    });
    assertInmobiliariaOperativa(inmobiliaria);
}
