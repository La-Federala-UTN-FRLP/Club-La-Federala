/**
 * Etapa 5.4 — Permisos finos para rol INMOBILIARIA en Documentos.
 *
 * Helpers centralizados para autorización de acceso a archivos.
 * INMOBILIARIA solo puede ver/descargar:
 * - PLANO: siempre (documentos de lote).
 * - BOLETO/ESCRITURA/OTRO: solo si venta.inmobiliariaId == user.inmobiliariaId.
 * - IMAGEN: sin cambios (no restringir en 5.4).
 * INMOBILIARIA NUNCA puede subir, editar, eliminar, restaurar, purgar.
 *
 * Block 3 — Permisos por tipo para rol TECNICO (leer, firmar URL, subir, sustituir, aprobar):
 * - PLANO e IMAGEN: documentación técnica, permitida.
 * - BOLETO/ESCRITURA/OTRO: documentos de venta (comerciales/legales), denegados.
 * - Cualquier tipo no contemplado: denegado (lista blanca, default deny).
 */

import type { TipoFile } from "../types/files.types";

export type FileAuthUser = {
  role: string;
  inmobiliariaId?: number | null;
};

export type ArchivoForAuth = {
  tipo: TipoFile;
  ventaId?: number | null;
  estadoOperativo?: string;
};

export type VentaForAuth = {
  inmobiliariaId: number | null;
};

/** Indica si el usuario tiene rol INMOBILIARIA. */
export function isInmobiliaria(user: FileAuthUser | undefined): boolean {
  return user?.role === "INMOBILIARIA";
}

/** Obtiene la inmobiliaria del usuario (para comparar con venta.inmobiliariaId). */
export function getUserInmobiliariaId(user: FileAuthUser | undefined): number | null {
  if (!user?.inmobiliariaId) return null;
  return user.inmobiliariaId;
}

/** Indica si la venta pertenece a la inmobiliaria del usuario. */
export function canInmobiliariaAccessVenta(
  user: FileAuthUser | undefined,
  venta: VentaForAuth | null
): boolean {
  if (!venta) return false;
  const userInmoId = getUserInmobiliariaId(user);
  if (userInmoId == null) return false;
  return venta.inmobiliariaId === userInmoId;
}

const TIPOS_DOC_VENTA: TipoFile[] = ["BOLETO", "ESCRITURA", "OTRO"];

/** Tipos de archivo existentes (enum TipoFile). Un tipo fuera de esta lista se deniega a todos. */
const TIPOS_VALIDOS: TipoFile[] = ["BOLETO", "ESCRITURA", "PLANO", "IMAGEN", "OTRO"];

/** Roles con acceso a Documentos. Sin usuario o con un rol fuera de la lista: denegado. */
const ROLES_CON_ACCESO = ["ADMINISTRADOR", "GESTOR", "TECNICO", "INMOBILIARIA"];

/** Block 3: únicos tipos a los que accede TECNICO (lo no listado queda denegado). */
const TIPOS_TECNICO: TipoFile[] = ["PLANO", "IMAGEN"];

/** Indica si el usuario tiene rol TECNICO. */
export function isTecnico(user: FileAuthUser | undefined): boolean {
  return user?.role === "TECNICO";
}

/**
 * Determina si el usuario puede acceder (ver/descargar/operar) al archivo.
 * Fail-closed: sin usuario, con un rol desconocido o con un tipo desconocido => false.
 * - Si user es TECNICO => solo PLANO/IMAGEN (Block 3; la venta no cambia nada).
 * - Si user es ADMINISTRADOR o GESTOR => true (sin restricción adicional).
 * - Si user es INMOBILIARIA:
 *   - archivo eliminado => false
 *   - PLANO => true
 *   - BOLETO/ESCRITURA/OTRO con ventaId null => false
 *   - BOLETO/ESCRITURA/OTRO con ventaId => venta debe pertenecer a la inmobiliaria del user
 *   - IMAGEN => true (NO CAMBIAR en 5.4)
 *
 * @param venta - Venta cargada (solo necesaria para BOLETO/ESCRITURA/OTRO con ventaId).
 *                Si null y se necesita, el caller debe hacer lookup.
 */
export function canUserAccessArchivo(
  user: FileAuthUser | undefined,
  archivo: ArchivoForAuth,
  venta: VentaForAuth | null
): boolean {
  if (!user || !ROLES_CON_ACCESO.includes(user.role)) return false;
  if (!TIPOS_VALIDOS.includes(archivo.tipo)) return false;
  if (isTecnico(user)) return TIPOS_TECNICO.includes(archivo.tipo);
  if (!isInmobiliaria(user)) return true;

  if (archivo.estadoOperativo === "ELIMINADO") return false;

  if (archivo.tipo === "PLANO") return true;
  if (archivo.tipo === "IMAGEN") return true; // No cambiar en 5.4

  if (TIPOS_DOC_VENTA.includes(archivo.tipo)) {
    if (archivo.ventaId == null) return false;
    return canInmobiliariaAccessVenta(user, venta);
  }

  return false; // Inalcanzable con TIPOS_VALIDOS; default deny
}

/** Etapa 5.4.3: Solo ADMINISTRADOR y GESTOR pueden usar includeDeleted=true. */
export function canUseIncludeDeleted(user: FileAuthUser | undefined): boolean {
  const role = user?.role;
  return role === "ADMINISTRADOR" || role === "GESTOR";
}

/** Etapa 5.5: Verifica si el rol puede cambiar la aprobación del target dado. */
export function canUpdateAprobacion(
  role: string,
  target: "COMISION" | "MUNICIPIO"
): boolean {
  if (target === "COMISION") {
    return ["ADMINISTRADOR", "GESTOR", "TECNICO"].includes(role);
  }
  return ["ADMINISTRADOR", "GESTOR"].includes(role);
}
