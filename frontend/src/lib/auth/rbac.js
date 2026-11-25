// src/lib/auth/rbac.js
// ====================
// 1) Catálogo de permisos atómicos (subject:action)

export const PERMISSIONS = {
  // Lotes
  LOT_ACCESS:   'lotes.access',   // navegar al módulo
  LOT_CREATE:   'lotes.create',
  LOT_VIEW:     'lotes.view',     // leer uno/todos
  LOT_EDIT:     'lotes.edit',     // editar (nota: campo-level se validará en back)
  LOT_DELETE:   'lotes.delete',
  LOT_PROMO:    'lotes.promo',    // aplicar promoción (acción tablero)

  // Ventas
  SALE_ACCESS:  'ventas.access',
  SALE_CREATE:  'ventas.create',
  SALE_VIEW:    'ventas.view',
  SALE_EDIT:    'ventas.edit',
  SALE_DELETE:  'ventas.delete',

  // Reservas
  RES_ACCESS:   'reservas.access',
  RES_CREATE:   'reservas.create',
  RES_VIEW:     'reservas.view',
  RES_EDIT:     'reservas.edit',
  RES_DELETE:   'reservas.delete',

  // Inmobiliarias (módulo)
  AGENCY_ACCESS:'inmob.access',
  AGENCY_CREATE:'inmob.create',
  AGENCY_VIEW:  'inmob.view',
  AGENCY_EDIT:  'inmob.edit',
  AGENCY_DELETE:'inmob.delete',

  // Usuarios
  USERS_ACCESS: 'users.access',
  USERS_CREATE: 'users.create',
  USERS_VIEW:   'users.view',
  USERS_EDIT:   'users.edit',
  USERS_DELETE: 'users.delete',

  // Personas (módulo)
  PEOPLE_ACCESS:'personas.access',
  PEOPLE_CREATE:'personas.create',
  PEOPLE_VIEW:  'personas.view',
  PEOPLE_EDIT:  'personas.edit',
  PEOPLE_DELETE:'personas.delete',

  // Prioridades
  PRIORITY_ACCESS: 'prioridades.access',
  PRIORITY_CREATE: 'prioridades.create',
  PRIORITY_VIEW:   'prioridades.view',
  PRIORITY_EDIT:   'prioridades.edit',
  PRIORITY_DELETE: 'prioridades.delete',

  // Cuenta / utilitarios dsp puede haber mas 
  REPORTS_ACCESS: 'reports.access',
  ACCOUNT_ACCESS: 'account.access',
};

// 2) Permisos por rol (según Matriz de Permisos)
export const ROLE_PERMISSIONS = {
  ADMINISTRADOR: [
    // Lotes
    PERMISSIONS.LOT_ACCESS, PERMISSIONS.LOT_CREATE, PERMISSIONS.LOT_VIEW,
    PERMISSIONS.LOT_EDIT, PERMISSIONS.LOT_DELETE, PERMISSIONS.LOT_PROMO,
    // Ventas
    PERMISSIONS.SALE_ACCESS, PERMISSIONS.SALE_CREATE, PERMISSIONS.SALE_VIEW,
    PERMISSIONS.SALE_EDIT, PERMISSIONS.SALE_DELETE,
    // Reservas
    PERMISSIONS.RES_ACCESS, PERMISSIONS.RES_CREATE, PERMISSIONS.RES_VIEW,
    PERMISSIONS.RES_EDIT, PERMISSIONS.RES_DELETE,
    // Inmobiliarias
    PERMISSIONS.AGENCY_ACCESS, PERMISSIONS.AGENCY_CREATE, PERMISSIONS.AGENCY_VIEW,
    PERMISSIONS.AGENCY_EDIT, PERMISSIONS.AGENCY_DELETE,
    // Usuarios
    PERMISSIONS.USERS_ACCESS, PERMISSIONS.USERS_CREATE, PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_EDIT, PERMISSIONS.USERS_DELETE,
    // Personas
    PERMISSIONS.PEOPLE_ACCESS, PERMISSIONS.PEOPLE_CREATE, PERMISSIONS.PEOPLE_VIEW,
    PERMISSIONS.PEOPLE_EDIT, PERMISSIONS.PEOPLE_DELETE,
    // Prioridades
    PERMISSIONS.PRIORITY_ACCESS, PERMISSIONS.PRIORITY_CREATE, PERMISSIONS.PRIORITY_VIEW,
    PERMISSIONS.PRIORITY_EDIT, PERMISSIONS.PRIORITY_DELETE,
    // Otros
    PERMISSIONS.REPORTS_ACCESS, PERMISSIONS.ACCOUNT_ACCESS,
  ],

  GESTOR: [
    // (Legales) — igual que Admin salvo Users.delete y Lotes.delete
    PERMISSIONS.LOT_ACCESS, PERMISSIONS.LOT_CREATE, PERMISSIONS.LOT_VIEW,
    PERMISSIONS.LOT_EDIT, PERMISSIONS.LOT_PROMO, // (sin LOT_DELETE: DELETE /lotes/:id es solo ADMIN)
    PERMISSIONS.SALE_ACCESS, PERMISSIONS.SALE_CREATE, PERMISSIONS.SALE_VIEW,
    PERMISSIONS.SALE_EDIT, PERMISSIONS.SALE_DELETE,
    PERMISSIONS.RES_ACCESS, PERMISSIONS.RES_CREATE, PERMISSIONS.RES_VIEW,
    PERMISSIONS.RES_EDIT, PERMISSIONS.RES_DELETE,
    PERMISSIONS.AGENCY_ACCESS, PERMISSIONS.AGENCY_CREATE, PERMISSIONS.AGENCY_VIEW,
    PERMISSIONS.AGENCY_EDIT, PERMISSIONS.AGENCY_DELETE,
    PERMISSIONS.USERS_ACCESS, PERMISSIONS.USERS_CREATE, PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_EDIT, // (sin USERS_DELETE)
    // Personas
    PERMISSIONS.PEOPLE_ACCESS, PERMISSIONS.PEOPLE_CREATE, PERMISSIONS.PEOPLE_VIEW,
    PERMISSIONS.PEOPLE_EDIT, PERMISSIONS.PEOPLE_DELETE,
    // Prioridades
    PERMISSIONS.PRIORITY_ACCESS, PERMISSIONS.PRIORITY_CREATE, PERMISSIONS.PRIORITY_VIEW,
    PERMISSIONS.PRIORITY_EDIT, PERMISSIONS.PRIORITY_DELETE,
    // Otros
    PERMISSIONS.REPORTS_ACCESS, PERMISSIONS.ACCOUNT_ACCESS,
  ],

  INMOBILIARIA: [
    // Lotes: solo acceso/lectura (scoped) — sin NO_DISPONIBLE y sin campos sensibles
    PERMISSIONS.LOT_ACCESS, PERMISSIONS.LOT_VIEW,
    // Reservas: ver y crear (sin editar ni eliminar: PUT /reservas/:id es solo ADMIN y GESTOR)
    PERMISSIONS.RES_ACCESS, PERMISSIONS.RES_VIEW, PERMISSIONS.RES_CREATE,
    // Personas: acceso, lectura y creación (solo para su inmobiliaria)
    PERMISSIONS.PEOPLE_ACCESS, PERMISSIONS.PEOPLE_VIEW, PERMISSIONS.PEOPLE_CREATE,
    // Prioridades: CRUD (con límites, sin delete)
    PERMISSIONS.PRIORITY_ACCESS, PERMISSIONS.PRIORITY_CREATE, PERMISSIONS.PRIORITY_VIEW, PERMISSIONS.PRIORITY_EDIT,
    // Cuenta
    PERMISSIONS.ACCOUNT_ACCESS,
  ],

  TECNICO: [
    // Lotes: ver (scoped) + editar con whitelist (subestado/medidas/observaciones)
    PERMISSIONS.LOT_ACCESS, PERMISSIONS.LOT_VIEW, PERMISSIONS.LOT_EDIT,
    // Personas: solo lectura
    PERMISSIONS.PEOPLE_ACCESS, PERMISSIONS.PEOPLE_VIEW,
    // Cuenta
    PERMISSIONS.ACCOUNT_ACCESS,
  ],
};

//-----------------
// Helpers simples
//-----------------

// Este es para cuando el user puede tener un role o roles (array). Gralmente va a ser uno solo
export function userRoles(user) {
  const role = user?.role;
  const roles = Array.isArray(user?.roles) ? user.roles : (role ? [role] : []);
  return roles;
}

// Este es para cuando el user puede tener un role o roles (array). Gralmente va a ser uno solo
export function userPermissions(user) {
  const roles = userRoles(user);
  const perms = new Set();
  roles.forEach((r) => (ROLE_PERMISSIONS[r] || []).forEach((p) => perms.add(p)));
  return [...perms];
}

// Checkea si el user tiene un rol (uno solo o varios)
export function hasRole(user, role) {
  return userRoles(user).includes(role);
}

// Checkea si el user tiene un permiso (uno solo o varios)
export function can(user, permission) {
  return userPermissions(user).includes(permission);
}
