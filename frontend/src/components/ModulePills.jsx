import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthProvider';
import { visibleModulesForUser, MODULES } from '../lib/auth/rbac.ui';

// Hook para obtener rol del usuario (helper)
function useUserRole() {
  const { user } = useAuth();
  return (user?.role ?? user?.rol ?? "ADMIN").toString().trim().toUpperCase();
}

// Meta UI local para rótulos y rutas (independiente de cómo exporte rbac.ui MODULES)
const MODULES_META = {
  lotes:        { label: 'Dashboard',      path: '/dashboard' },
  ventas:       { label: 'Ventas',         path: '/ventas' },
  inmobiliarias:{ label: 'Inmobiliarias',  path: '/inmobiliarias' },
  reservas:     { label: 'Reservas',       path: '/reservas' },
  reportes:     { label: 'Reportes',       path: '/reportes' },
  personas:     { label: 'Personas',       path: '/personas' },
  // usuarios:  { label: 'Usuarios',       path: '/usuarios' },
};

// Mapeo de vistas a labels (para Personas)
const VIEW_LABELS = {
  ALL: 'Todos',
  PROPIETARIOS: 'Propietarios',
  INQUILINOS: 'Inquilinos',
  CLIENTES: 'Clientes',
  MIS_CLIENTES: 'Mis Clientes',
};

export default function ModulePills() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const userRole = useUserRole();

  // Visibilidad por RBAC (si auth no cargó, fallback a todos)
  let modules = visibleModulesForUser(user);
  const moduleKeys = (modules && modules.length)
    ? modules.map(([key]) => key)         // nos quedamos con la clave
    : Object.keys(MODULES);               // fallback: todas las claves definidas en rbac.ui

  // Contenido del menú por módulo (acciones del panel)
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

  const MENU = useMemo(() => ({
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
    ],
    personas: personasMenu,
    lotes: [
      { label: 'Ver Lotes', to: '/dashboard', disabled: false },
    ],
  }), [personasMenu]);

  // UI: panel abierto
  const [openKey, setOpenKey] = useState(null);
  const wrapperRef = useRef(null);

  // Cerrar con click afuera / ESC
  useEffect(() => {
    const onClick = (e) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setOpenKey(null);
    };
    const onKey = (e) => e.key === 'Escape' && setOpenKey(null);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  /* ======== CONTROLES RÁPIDOS ======== */
  const BAR_HEIGHT   = 64; // altura de la barra
  const OVERLAP_PX   = 10; // pega la barra al header (cubre sombra)
  const SEP_ALPHA    = 0.18; // opacidad separadores verticales
  const HOVER_TINT   = 'rgba(255,255,255,0.05)'; // hover suave del módulo
  const LINE_COLOR   = 'rgba(255,255,255,0.14)'; // línea entre header y barra
  const PADDING_X    = 34;  // padding horizontal de cada modulo
  const PANEL_SHADOW = '0 10px 24px rgba(0,0,0,.20)'; // sombra del panel desplegable
  const YELLOW       = '#EBB648'; // amarillo de los botones
  const DIVIDER_COLOR = 'rgba(255, 255, 255, 0.15)'; // color de los divisores del panel
  /* =================================== */

  const HIGHLIGHT_KEYS = useMemo(
    () => new Set(['ventas', 'inmobiliarias', 'reservas', 'reportes', 'personas']),
    []
  );

  return (
    <>
      <style>{`
        /* Full width real y pegado al header */
        .mods-wrapper {
          width: 100vw;
          position: relative;
          left: 50%; right: 50%;
          margin-left: -50vw; margin-right: -50vw;
          margin-top: 0;
          top: -${OVERLAP_PX}px;
          z-index: 20;
        }
        .mods-bar {
          position: relative;
          display: flex;
          align-items: stretch;
          justify-content: stretch;
          height: ${BAR_HEIGHT}px;
          background: var(--color-header-bg);
          border-radius: 0;
          overflow: visible;
          box-shadow: 2px 3px 2px 1px rgba(0,0,0,0.25);
        }
        /* Única línea fina de separación con el header */
        .mods-bar::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 1px;
          background: ${LINE_COLOR};
        }

        .mods-item {
          flex: 1 1 0;
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;        
          color: var(--color-text-light);
          text-decoration: none;
          font-weight: 600;
          letter-spacing: .2px;
          padding: 0 ${PADDING_X}px;
          background: transparent;
          transition: background .12s ease, color .12s ease;
          user-select: none;
        }
        
        /*Linea divisora*/
        .mods-panel__btn + .mods-panel__btn {
          border-top: 0.1px solid ${DIVIDER_COLOR};
        }

        /* Hover del módulo (cerrado): tinte sutil */
        .mods-item:hover { background: ${HOVER_TINT}; }

        /* MÓDULO ABIERTO: fondo amarillo y texto negro */
        .mods-item.is-open .mods-caret { color: #ffffffff; opacity: .9; }
        
        /* que el hover no cambie cuando está abierto */
        .mods-item.is-open:hover { background: ${HOVER_TINT}; color: #FFF; }

        /* separadores a TODO el alto */
        .mods-item:not(:last-child)::after {
          content: "";
          position: absolute;
          top: 0; bottom: 0; right: 0;
          width: 1px;
          background: rgba(255,255,255,${SEP_ALPHA});
        }

        /* caret fijo a la derecha */
        .mods-caret {
          position: absolute; right: 12px;
          opacity: .9; font-size: .9em; transform: translateY(-1px);
          color: var(--color-text-light);
        }

        /* ===== Panel desplegable ===== */
        .mods-panel {
          position: absolute;
          left: 0; right: 0;               
          top: ${BAR_HEIGHT}px;             
          background: var(--color-header-bg);
          border: px solid rgba(0,0,0,0.06);            
          border-top: 0.1px solid ${DIVIDER_COLOR};                 
          box-shadow: ${PANEL_SHADOW};
          border-radius: 0 0 3px 3px;       
          overflow: hidden;
        }
        .mods-panel__btn {
          display: flex; align-items: center;
          width: 100%;
          padding: 16px 18px;
          color: var(--color-text-light);
          text-decoration: none;
          font-weight: 600;
          letter-spacing: .2px;
          background: transparent;
          border: none; cursor: pointer;
          transition: color .12s ease;      
        }
        /* HOVER de opciones: sólo texto amarillo, sin fondo */
        .mods-panel__btn:hover:not(.mods-panel__btn--disabled) {
          color: ${YELLOW};
        }
        .mods-panel__btn--disabled {
          opacity: .55; cursor: not-allowed;
        }

        /* ===== ACTIVO (resaltado amarillo) solo para módulos seleccionados ===== */
        .mods-item.is-highlight {
          background: #EBB648;            /* amarillo figma */
          color: #101512;                 /* texto oscuro para contraste */
        }
        .mods-item.is-highlight .mods-caret {
          color: #101512; opacity: 1;
        }
        /* que el hover no cambie cuando está activo */
        .mods-item.is-highlight:hover {
          background: #EBB648;
          color: #101512;
        }
        /* === Tuning visual ModulePills (override) === */

        /* Línea separadora un poco más marcada (en header oscuro queda mejor) */
        .mods-bar::before { background: rgba(0, 0, 0, 0.35); }

        /* Bordes más suaves en cada item y hover más sutil */
        .mods-item:hover { background: rgba(255, 255, 255, 0.04); }

        /* Píldora ACTIVA (amarillo Figma + hairline oscuro sutil) */
        .mods-item.is-highlight {
          background: #EBB648;           /* amarillo original */
          color: #0F1412;
          font-weight: 640;           /* texto bien oscuro */
          border-top: solid 1px black;
          box-shadow: inset 0 0 0 1px rgba(15, 20, 18, 0.22); /* hairline */
        }

        /* Chevron más negro cuando está activo */
        .mods-item.is-highlight .mods-caret {
          color: #0B0E0D;
          opacity: 1;
        }

        /* Mantener el mismo color en hover cuando está activa */
        .mods-item.is-highlight:hover {
          background: #EBB648;
          color: #0F1412;
        }

      `}</style>

      <div className="mods-wrapper" ref={wrapperRef}>
        <nav className="mods-bar" role="menubar" aria-label="Barra de módulos">
          {moduleKeys.map((key) => {
            const meta = MODULES_META[key] || { label: key, path: '/' };
            const active = pathname.startsWith(meta.path);
            const open = openKey === key;
            const items = MENU[key] || [];

            // 🔸 NUEVO: solo marcamos en amarillo los módulos definidos en HIGHLIGHT_KEYS
            const isHighlight = active && HIGHLIGHT_KEYS.has(key);

            // Obtener view actual para Personas
            const currentView = key === 'personas' && active 
              ? (searchParams.get('view') || (userRole === 'INMOBILIARIA' ? 'MIS_CLIENTES' : 'ALL'))
              : null;
            const viewLabel = currentView ? VIEW_LABELS[currentView] || currentView : null;

            return (
              <div
                key={key}
                className={`mods-item ${open ? 'is-open' : ''} ${isHighlight ? 'is-highlight' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {/* Botón que abre/cierra el panel (nombre centrado + caret derecha) */}
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : key)}
                  aria-haspopup="true"
                  aria-expanded={open}
                  title={meta.label}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    padding: `0 ${PADDING_X}px`,
                    color: 'inherit',
                    gap: '8px',
                  }}
                >
                  <span>{meta.label}</span>
                  {viewLabel && (
                    <span 
                      style={{
                        fontSize: '0.75rem',
                        marginLeft: '2px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      Viendo: {viewLabel}
                    </span>
                  )}
                  <span className="mods-caret" aria-hidden>▾</span>
                </button>

                {/* Panel desplegable (100% del ancho del módulo) */}
                {open && (
                  <div className="mods-panel" role="menu" aria-label={`Acciones de ${meta.label}`}>
                    {items.map((it, idx) =>
                      it.disabled ? (
                        <div key={idx} className="mods-panel__btn mods-panel__btn--disabled" role="menuitem" aria-disabled="true">
                          {it.label}
                        </div>
                      ) : it.to ? (
                        <Link key={idx} to={it.to} className="mods-panel__btn" role="menuitem" onClick={() => setOpenKey(null)}>
                          {it.label}
                        </Link>
                      ) : (
                        <button key={idx} className="mods-panel__btn mods-panel__btn--disabled" disabled>
                          {it.label}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </>
  );
}
