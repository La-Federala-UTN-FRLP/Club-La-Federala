import { useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { visibleModulesForUser } from '../../lib/auth/rbac.ui';
import SidebarItem from './SidebarItem';
import './Sidebar.css';
import {
  SaleTag01Icon,
  RealEstate02Icon,
  Appointment02Icon,
  ChartUpIcon,
  UserGroupIcon,
  Flag03Icon,
} from '@hugeicons/core-free-icons';

// Hook para obtener rol del usuario (helper) - igual que ModulePills
function useUserRole() {
  const { user } = useAuth();
  return (user?.role ?? user?.rol ?? "ADMIN").toString().trim().toUpperCase();
}

// Meta UI para módulos: componente de ícono, ruta y label
// Orden: Prioridades, Reservas, Ventas, Inmobiliarias, Personas, Reportes
const MODULES_META = {
  prioridades: {
    icon: Flag03Icon,
    path: '/prioridades',
    label: 'Prioridades',
    disabled: false,
  },
  reservas: {
    icon: Appointment02Icon,
    path: '/reservas',
    label: 'Reservas',
  },
  ventas: {
    icon: SaleTag01Icon,
    path: '/ventas',
    label: 'Ventas',
  },
  inmobiliarias: {
    icon: RealEstate02Icon,
    path: '/inmobiliarias',
    label: 'Inmobiliarias',
  },
  personas: {
    icon: UserGroupIcon,
    path: '/personas',
    label: 'Personas',
  },
  reportes: {
    icon: ChartUpIcon,
    path: '/reportes',
    label: 'Reportes',
  },
};

// Orden correcto de módulos (de arriba hacia abajo en el sidebar)
const MODULES_ORDER = ['prioridades', 'reservas', 'ventas', 'inmobiliarias', 'personas', 'reportes'];

export default function Sidebar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const userRole = useUserRole();

  // Obtener módulos visibles según permisos (misma lógica que ModulePills)
  const visibleModules = visibleModulesForUser(user);
  const visibleModuleKeys = new Set(visibleModules.map(([key]) => key));

  // Ordenar módulos según el orden definido, respetando permisos
  // Solo los módulos a los que el rol puede entrar (mismo permiso que la ruta en App.jsx)
  const orderedModuleKeys = MODULES_ORDER.filter(key => visibleModuleKeys.has(key));

  // Generar menús exactamente igual que ModulePills
  // Personas: diferentes opciones según rol
  const personasMenu = userRole === 'INMOBILIARIA' 
    ? [
        { label: 'Ver Mis Clientes', to: '/personas?view=MIS_CLIENTES', disabled: false },
      ]
    : [
        { label: 'Ver Todos', to: '/personas?view=ALL', disabled: false },
        { label: 'Ver Propietarios', to: '/personas?view=PROPIETARIOS', disabled: false },
        { label: 'Ver Inquilinos', to: '/personas?view=INQUILINOS', disabled: false },
        { label: 'Ver Clientes', to: '/personas?view=CLIENTES', disabled: false },
      ];

  // Menús por módulo - EXACTAMENTE igual que ModulePills
  const MENU = useMemo(() => ({
    prioridades: [
      { label: 'Ver Prioridades', to: '/prioridades', disabled: false },
      { label: 'Registrar Prioridad', to: '/prioridades?crear=true', disabled: false },
    ],
    ventas: [
      { label: 'Ver Ventas', to: '/ventas', disabled: false },
      { label: 'Registrar Venta', to: '/ventas?crear=true', disabled: false },
    ],
    inmobiliarias: [
      { label: 'Ver Inmobiliarias', to: '/inmobiliarias', disabled: false },
      { label: 'Registrar Inmobiliaria', to: '/inmobiliarias?crear=true', disabled: false },
    ],
    reservas: [
      { label: 'Ver Reservas', to: '/reservas', disabled: false },
      { label: 'Registrar Reserva', to: '/reservas?crear=true', disabled: false },
    ],
    reportes: [
      { label: 'Ver Reportes', to: '/reportes', disabled: false },
      { label: 'Descargar Reporte', to: null, disabled: true },
    ],
    personas: personasMenu,
    lotes: [
      { label: 'Ver Lotes', to: '/dashboard', disabled: false },
    ],
  }), [personasMenu]);

  return (
    <nav className="sidebar" role="navigation" aria-label="Navegación principal">
      {/* Renderizar módulos en el orden correcto, respetando permisos */}
      {orderedModuleKeys.map((key) => {
        const meta = MODULES_META[key];
        if (!meta) return null;

        // Obtener view actual para Personas (misma lógica que ModulePills)
        const isPersonasActive = key === 'personas' && pathname.startsWith(meta.path);
        const currentView = isPersonasActive
          ? (searchParams.get('view') || (userRole === 'INMOBILIARIA' ? 'MIS_CLIENTES' : 'ALL'))
          : null;

        return (
          <SidebarItem
            key={key}
            icon={meta.icon}
            path={meta.path}
            label={meta.label}
            disabled={meta.disabled}
            isActive={pathname.startsWith(meta.path)}
            menuItems={MENU[key] || []}
            currentView={currentView} // Para mostrar contexto en Personas
          />
        );
      })}
    </nav>
  );
}
