import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import HoverCard from './HoverCard';

// Mapeo de vistas a labels (para Personas) - igual que ModulePills
const VIEW_LABELS = {
  ALL: 'Todos',
  PROPIETARIOS: 'Propietarios',
  INQUILINOS: 'Inquilinos',
  CLIENTES: 'Clientes',
  MIS_CLIENTES: 'Mis Clientes',
};

/**
 * Componente SidebarItem
 * Renderiza un ítem del sidebar con ícono y área clickeable generosa.
 * Muestra un hover card con opciones al hacer hover.
 * 
 * @param {Object} icon - Ícono de Hugeicons (importado desde @hugeicons/core-free-icons)
 * @param {string} path - Ruta a la que navega el ítem
 * @param {string} label - Label del módulo (para aria-label)
 * @param {boolean} disabled - Si está deshabilitado (ej: Prioridades no implementado)
 * @param {boolean} isActive - Si la ruta actual coincide con este ítem
 * @param {Array} menuItems - Opciones del menú para el hover card
 * @param {string} currentView - Vista actual (para Personas: 'ALL', 'PROPIETARIOS', etc.)
 */
export default function SidebarItem({ 
  icon, 
  path, 
  label, 
  disabled = false, 
  isActive = false,
  menuItems = [],
  currentView = null
}) {
  const location = useLocation();
  const itemRef = useRef(null);
  const hoverCardRef = useRef(null);
  const [showHoverCard, setShowHoverCard] = useState(false);
  const [hoverCardPosition, setHoverCardPosition] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef(null);

  const active = isActive || (path && location.pathname.startsWith(path));

  // Posición del hover card: centrado verticalmente con su ítem.
  //
  // La altura se MIDE, no se estima: depende de cuántas opciones tenga el módulo, y antes había
  // una constante de 200px. Un módulo con una sola opción mide bastante menos, así que su card
  // quedaba corrido hacia arriba la mitad de esa diferencia.
  //
  // `useLayoutEffect` y no `useEffect`: el card se monta con la posición de la vez anterior, y
  // medirlo y corregirlo antes de que el navegador pinte evita que se vea un cuadro en el lugar
  // viejo.
  useLayoutEffect(() => {
    const updatePosition = () => {
      if (!showHoverCard || !itemRef.current) return;

      const rect = itemRef.current.getBoundingClientRect();

      // HoverCard no reenvía su ref, así que el card se busca dentro del wrapper que sí la tiene
      // (sirve para las dos ramas de render, la del ítem habilitado y la del deshabilitado).
      // `offsetHeight` ignora el `transform` de la animación de entrada, que no cambia la altura.
      // Si el card todavía no está en el DOM queda en 0 y la tarjeta arranca centrada en el
      // ícono: una posición provisoria razonable, no un salto a una esquina, que la siguiente
      // medición corrige.
      const card = hoverCardRef.current?.querySelector('.hover-card');
      const cardHeight = card ? card.offsetHeight : 0;
      const viewportHeight = window.innerHeight;

      let top = rect.top + rect.height / 2 - cardHeight / 2;

      // Si el card se sale por abajo, reposicionarlo
      if (top + cardHeight > viewportHeight - 10) {
        top = viewportHeight - cardHeight - 10;
      }

      // Si el card se sale por arriba, reposicionarlo
      if (top < 10) {
        top = 10;
      }

      // Posicionar a la derecha del sidebar con separación de 10-12px
      const left = rect.right + 11; // 11px de separación del sidebar

      // Solo si cambió: devolver el mismo objeto hace que React descarte el setState, así una
      // medición que da lo mismo no dispara otro render.
      setHoverCardPosition((prev) =>
        prev.top === top && prev.left === left ? prev : { top, left }
      );
    };

    updatePosition();

    // Actualizar posición en scroll y resize
    if (showHoverCard) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [showHoverCard]);

  // Manejar hover
  const handleMouseEnter = () => {
    // Limpiar timeout si existe
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // Mostrar hover card si no está deshabilitado O si es Prioridades (para mostrar "Módulo en desarrollo")
    if (!disabled || menuItems.length === 0) {
      setShowHoverCard(true);
    }
  };

  const handleMouseLeave = () => {
    // Delay para permitir mover el mouse al hover card sin flicker
    timeoutRef.current = setTimeout(() => {
      setShowHoverCard(false);
    }, 150);
  };

  const handleHoverCardEnter = () => {
    // Cancelar el timeout si el mouse entra al hover card
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handleHoverCardLeave = () => {
    setShowHoverCard(false);
  };

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Si está deshabilitado, renderizar como div sin navegación
  if (disabled) {
    return (
      <>
        <div
          ref={itemRef}
          className="sidebar-item-wrapper"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <div
            className="sidebar-item sidebar-item--disabled"
            aria-label={label}
            role="button"
            aria-disabled="true"
            style={{
              opacity: 0.5,
              cursor: 'not-allowed',
            }}
          >
            {icon && (
              <HugeiconsIcon
                icon={icon}
                size={22}
                color="currentColor"
                strokeWidth={1.5}
              />
            )}
          </div>
        </div>
        <div
          ref={hoverCardRef}
          onMouseEnter={handleHoverCardEnter}
          onMouseLeave={handleHoverCardLeave}
        >
          <HoverCard
            title={label}
            items={[]} // Sin opciones para módulos deshabilitados
            show={showHoverCard}
            position={hoverCardPosition}
          />
        </div>
      </>
    );
  }

  // Obtener label de vista para Personas
  const viewLabel = currentView ? VIEW_LABELS[currentView] || currentView : null;
  const showViewContext = isActive && currentView && viewLabel;

  return (
    <>
      <div
        ref={itemRef}
        className="sidebar-item-wrapper"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Link
          to={path}
          className={`sidebar-item ${active ? 'sidebar-item--active' : ''}`}
          aria-label={label}
          role="menuitem"
          aria-current={active ? 'page' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon && (
            <HugeiconsIcon
              icon={icon}
              size={22}
              color="currentColor"
              strokeWidth={1.5}
            />
          )}
        </Link>
        
        {/* Contexto actual para Personas (ej: "Viendo: Todos") */}
        {showViewContext && (
          <div className="sidebar-item-context" title={`Viendo: ${viewLabel}`}>
            {viewLabel}
          </div>
        )}
      </div>
      <div
        ref={hoverCardRef}
        onMouseEnter={handleHoverCardEnter}
        onMouseLeave={handleHoverCardLeave}
      >
        <HoverCard
          title={label}
          items={menuItems}
          show={showHoverCard}
          position={hoverCardPosition}
        />
      </div>
    </>
  );
}
