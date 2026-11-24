import { useState, useRef, useEffect, useMemo } from 'react';
import { Info } from 'lucide-react';
import { applySearch } from '../../../utils/personaSearch.js';

/**
 * Componente reutilizable para búsqueda y selección de personas
 * 
 * @param {string} label - Etiqueta del campo
 * @param {number|string|null} value - ID de la persona seleccionada
 * @param {Function} onSelect - Callback cuando se selecciona una persona (recibe el ID)
 * @param {Array} personas - Lista de personas disponibles
 * @param {boolean} loading - Si está cargando las personas
 * @param {string} placeholder - Placeholder del input
 * @param {string} tooltipText - Texto del tooltip de ayuda
 * @param {boolean} disabled - Si el campo está deshabilitado
 * @param {string} error - Mensaje de error a mostrar
 * @param {boolean} required - Si el campo es obligatorio
 */
export default function PersonaSearchSelect({
  label,
  value,
  onSelect,
  personas = [],
  loading = false,
  placeholder = "Buscar por nombre, apellido o DNI",
  tooltipText = "Si no aparece en la lista, primero registrá a la persona en el módulo Personas.",
  disabled = false,
  error = null,
  required = false,
  noLabel = false, // cuando true: omite el field-label y renderiza solo el input
}) {
  const [busqueda, setBusqueda] = useState(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputElementRef = useRef(null);
  // Generar ID único estable para el input
  const inputIdRef = useRef(`persona-search-${label.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).substr(2, 9)}`);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setBusqueda(null);
      }
    }
    if (busqueda !== null) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [busqueda]);

  // Obtener la persona seleccionada para mostrar en el input
  const personaSeleccionada = useMemo(() => {
    if (!value) return null;
    return personas.find((p) => `${p.id ?? p.idPersona}` === `${value}`);
  }, [personas, value]);

  // Filtrar personas por búsqueda
  const personasFiltradas = useMemo(() => {
    if (!busqueda || !busqueda.trim()) {
      return [];
    }
    return applySearch(personas, busqueda).slice(0, 10); // Limitar a 10 resultados
  }, [personas, busqueda]);

  // Obtener texto a mostrar en el input
  const displayText = useMemo(() => {
    if (busqueda !== null && busqueda !== undefined) {
      return busqueda;
    }
    if (personaSeleccionada) {
      const nombre = personaSeleccionada.nombre ?? "";
      const apellido = personaSeleccionada.apellido ?? "";
      const razonSocial = personaSeleccionada.razonSocial;
      return razonSocial || `${nombre} ${apellido}`.trim() || `Persona ${personaSeleccionada.id}`;
    }
    return "";
  }, [busqueda, personaSeleccionada]);

  const handleInputChange = (e) => {
    const inputValue = e.target.value;
    setBusqueda(inputValue);
    
    // Si el usuario está escribiendo, limpiar selección si hay texto que no coincide
    if (inputValue) {
      if (personaSeleccionada) {
        const nombre = personaSeleccionada.nombre ?? "";
        const apellido = personaSeleccionada.apellido ?? "";
        const razonSocial = personaSeleccionada.razonSocial;
        const displayText = razonSocial || `${nombre} ${apellido}`.trim();
        if (!displayText.toLowerCase().includes(inputValue.toLowerCase())) {
          onSelect?.(null);
        }
      }
    } else {
      onSelect?.(null);
    }
  };

  const handleFocus = (e) => {
    // Al hacer focus, si hay persona seleccionada y no hay texto de búsqueda activa, activar modo búsqueda
    if (personaSeleccionada && busqueda === null) {
      setBusqueda("");
      onSelect?.(null);
      setTimeout(() => {
        e.target.select();
      }, 0);
    }
  };

  const handleSelectPersona = (personaId) => {
    onSelect?.(Number(personaId));
    setBusqueda(null);
    inputElementRef.current?.blur();
  };

  // Bloque de input reutilizable (usado en ambos modos: con y sin label)
  const inputBlock = (
    <div ref={inputRef} className="propietario-search-wrapper">
      <div className="propietario-search-input-wrapper">
        <input
          ref={inputElementRef}
          id={inputIdRef.current}
          className={`field-input ${error ? "is-invalid" : ""}`}
          type="text"
          placeholder={loading ? "Cargando..." : placeholder}
          value={displayText}
          onChange={handleInputChange}
          onFocus={handleFocus}
          disabled={disabled}
        />
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          className="propietario-search-icon"
        >
          <circle cx="11" cy="11" r="7" stroke="#666" strokeWidth="2" fill="none" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#666" strokeWidth="2" />
        </svg>
        {tooltipText && (
          <span
            className="propietario-info-icon-inline"
            data-tooltip={tooltipText}
          >
            <Info size={16} />
          </span>
        )}
      </div>
      {busqueda !== null && busqueda !== undefined && busqueda !== "" && (
        <div ref={dropdownRef} className="propietario-dropdown">
          {personasFiltradas.length === 0 ? (
            <div className="propietario-dropdown-empty">Sin resultados</div>
          ) : (
            personasFiltradas.map((p) => {
              const id = p.id ?? p.idPersona;
              const nombre = p.nombre ?? "";
              const apellido = p.apellido ?? "";
              const razonSocial = p.razonSocial;
              const identificadorTipo = p.identificadorTipo;
              const identificadorValor = p.identificadorValor;
              const displayText = razonSocial || `${nombre} ${apellido}`.trim() || `Persona ${id}`;
              return (
                <button
                  key={id}
                  type="button"
                  className="propietario-dropdown-item"
                  onClick={() => handleSelectPersona(id)}
                >
                  <div className="propietario-dropdown-item-name">{displayText}</div>
                  {identificadorValor && (
                    <div className="propietario-dropdown-item-id">
                      {identificadorTipo ? `${identificadorTipo} ${identificadorValor}` : identificadorValor}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );

  // Modo sin label: renderiza solo el input (sin field-row, sin cuadrado vacío)
  if (noLabel) {
    return (
      <div className={`field-value p0 ${error ? "hasError" : ""}${disabled ? " is-readonly is-locked" : ""}`}>
        {inputBlock}
      </div>
    );
  }

  return (
    <div className={`field-row ${error ? "hasError" : ""}`}>
      <div className="field-label">
        <label htmlFor={inputIdRef.current} style={{ cursor: disabled ? "not-allowed" : "pointer" }}>
          {label}
        </label>
      </div>
      <div className={`field-value p0${disabled ? " is-readonly is-locked" : ""}`}>
        {inputBlock}
      </div>
    </div>
  );
}
