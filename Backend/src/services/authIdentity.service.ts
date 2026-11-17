import prisma from '../config/prisma';
import type { Role } from '../generated/prisma';

/** Identidad vigente de un usuario autenticado: lo que se usa para autorizar el request. */
export type AuthIdentity = {
    id: number;
    email: string;
    role: Role;
    inmobiliariaId: number | null;
};

/**
 * El JWT prueba quién es el usuario; la DB dice qué puede hacer ahora.
 * Devuelve null si el usuario ya no existe o si su inmobiliaria está dada de baja (ELIMINADO, D1):
 * en ambos casos la identidad deja de ser operativa y authenticate responde 401 genérico. Al
 * reactivar la inmobiliaria la identidad vuelve a ser válida sin tocar el usuario ni el token.
 * Solo lee los campos necesarios (nunca la password).
 * El tenant sale de la relación User ← Inmobiliaria (Inmobiliaria.userId), igual que en el login.
 */
export async function findAuthIdentity(userId: number): Promise<AuthIdentity | null> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            role: true,
            inmobiliaria: { select: { id: true, estadoOperativo: true } },
        },
    });
    if (!user) return null;
    if (user.inmobiliaria?.estadoOperativo === 'ELIMINADO') return null;
    return {
        id: user.id,
        email: user.email,
        role: user.role,
        inmobiliariaId: user.inmobiliaria?.id ?? null,
    };
}
