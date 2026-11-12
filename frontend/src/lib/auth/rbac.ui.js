// src/lib/auth/rbac.ui.js
import { PERMISSIONS, userPermissions, can, hasRole } from './rbac';

// ================================
// 1) Módulos visibles en la barra
// ================================
// Clave = key del módulo en la UI; valor = permiso mínimo para verlo.
export const MODULES = {
  prioridades:   PERMISSIONS.PRIORITY_ACCESS,
  ventas:        PERMISSIONS.SALE_ACCESS,
  inmobiliarias: PERMISSIONS.AGENCY_ACCESS,
  reservas:      PERMISSIONS.RES_ACCESS,
  reportes:       PERMISSIONS.REPORTS_ACCESS,
  personas:      PERMISSIONS.PEOPLE_ACCESS,
};

export function visibleModulesForUser(user) {
  return Object.entries(MODULES).filter(([_, perm]) => can(user, perm));
}

// ----------------------------------------------------
// 1.1) Permisos requeridos por ruta protegida
// ----------------------------------------------------
// Nota: usamos beginsWith para admitir subrutas (/ventas/123, etc.)
const ROUTE_PERMISSION_MAP = [
  { test: (path) => path === '/' || path === '/dashboard', permission: null },
  { test: (path) => path.startsWith('/prioridades'), permission: PERMISSIONS.PRIORITY_ACCESS },
  { test: (path) => path.startsWith('/ventas'), permission: PERMISSIONS.SALE_ACCESS },
  { test: (path) => path.startsWith('/reservas'), permission: PERMISSIONS.RES_ACCESS },
  { test: (path) => path.startsWith('/inmobiliarias'), permission: PERMISSIONS.AGENCY_ACCESS },
  { test: (path) => path.startsWith('/personas'), permission: PERMISSIONS.PEOPLE_ACCESS },
  { test: (path) => path.startsWith('/reportes'), permission: PERMISSIONS.REPORTS_ACCESS },
  { test: (path) => path.startsWith('/map'), permission: PERMISSIONS.REPORTS_ACCESS }, // mapa hoy reservado
];

function normalizePath(path) {
  if (!path) return '/';
  const [clean] = path.split(/[?#]/); // quitamos query/hash
  return clean || '/';
}

export function requiredPermissionForRoute(pathname) {
  const normalized = normalizePath(pathname);
  const found = ROUTE_PERMISSION_MAP.find((entry) => entry.test(normalized));
  return found ? found.permission : null;
}

export function userCanAccessRoute(user, pathname) {
  const perm = requiredPermissionForRoute(pathname);
  if (!perm) return true; // ruta sin restricción extra (igual requiere sesión)
  return can(user, perm);
}

// ======================================================
// 2) Acciones del tablero de Lotes (botones por fila)
// ======================================================
export function canDashboardAction(user, action) {
  switch (action) {
    // Lotes
    case 'visualizarLote':   return can(user, PERMISSIONS.LOT_VIEW);
    case 'editarLote':       return can(user, PERMISSIONS.LOT_EDIT);
    case 'registrarVenta':   return can(user, PERMISSIONS.SALE_CREATE);     // Admin + Gestor
    case 'eliminarLote':     return can(user, PERMISSIONS.LOT_DELETE);      // Admin + Gestor
    case 'aplicarPromocion': return can(user, PERMISSIONS.LOT_PROMO);       // Admin + Gestor
    
    // Ventas
    case 'visualizarVenta':  return can(user, PERMISSIONS.SALE_VIEW);
    case 'editarVenta':      return can(user, PERMISSIONS.SALE_EDIT);
    case 'eliminarVenta':    return can(user, PERMISSIONS.SALE_DELETE);
    case 'verDocumentos':    return can(user, PERMISSIONS.SALE_VIEW);
    
    // Reservas
    case 'visualizarReserva':  return can(user, PERMISSIONS.RES_VIEW);
    case 'editarReserva':      return can(user, PERMISSIONS.RES_EDIT);
    case 'eliminarReserva':    return can(user, PERMISSIONS.RES_DELETE);
    
    // Prioridades
    case 'visualizarPrioridad':  return can(user, PERMISSIONS.PRIORITY_VIEW);
    case 'editarPrioridad':      return can(user, PERMISSIONS.PRIORITY_EDIT);
    case 'eliminarPrioridad':    return can(user, PERMISSIONS.PRIORITY_DELETE);
    
    // Personas
    case 'visualizarPersona':  return can(user, PERMISSIONS.PEOPLE_VIEW);
    case 'editarPersona':      return can(user, PERMISSIONS.PEOPLE_EDIT);
    case 'eliminarPersona':    return can(user, PERMISSIONS.PEOPLE_DELETE);
    
    default:                 return false;
  }
}

// ==========================================
// 3) Helpers de visibilidad para FilterBar
// ==========================================

// Estado: ocultar "NO_DISPONIBLE" para Inmobiliaria (el resto ve todos)
export function filterEstadoOptionsFor(user, allEstados) {
  const perms = new Set(userPermissions(user));
  const isInmo = perms.has(PERMISSIONS.RES_ACCESS) && !perms.has(PERMISSIONS.SALE_ACCESS);
  return isInmo ? allEstados.filter((e) => e !== 'NO_DISPONIBLE') : allEstados;
}

// Filtro "Deudor": ocultar para Inmobiliaria y Técnico (el backend rechaza ?deudor para TECNICO)
export function canUseDeudorFilter(user) {
  const perms = new Set(userPermissions(user));
  const isInmo = perms.has(PERMISSIONS.RES_ACCESS) && !perms.has(PERMISSIONS.SALE_ACCESS);
  return !isInmo && !hasRole(user, "TECNICO");
}
