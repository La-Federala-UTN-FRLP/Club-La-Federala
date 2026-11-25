// components/TablaLotes.jsx
// -----------------------------------------------------------------------------
// Tablero de Lotes - robusto y compatible con props {lotes} o {data}
// -----------------------------------------------------------------------------

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import './TablaLotes.css';

import { useAuth } from '../../../app/providers/AuthProvider';
import { Eye, Edit, Trash2, DollarSign, Columns3, CirclePercent, X } from 'lucide-react';
import MapaInteractivo from '../../Mapa/MapaInteractivo';
import {
  normalizeEstadoKey,
  getEstadoVariant,
  getEstadoFromLote,
} from '../../../utils/mapaUtils';
import { getAllPrioridades } from '../../../lib/api/prioridades';

// rbac y visibilidad de estados
import { canDashboardAction, filterEstadoOptionsFor, canSeeDeuda } from '../../../lib/auth/rbac.ui';

// Partes de UI
import PageSizeDropdown from './parts/PageSizeDropdown';
import ColumnPicker from './parts/ColumnPicker';

// Helpers visuales y de formato/getters
import StatusBadge, { estadoBadge } from './cells/StatusBadge';
import SubstatusBadge, { subestadoBadge } from './cells/SubstatusBadge';
import { fmtMoney, fmtM2, fmtM, fmtEstado } from './utils/formatters';
import { getPropietarioNombre, getUbicacion, getTipo, getFraccion, getInquilino, getOcupacion, getNumPartida, getLoteIdFormatted } from './utils/getters';

// Preset con columnas/anchos/plantillas
import { lotesTablePreset as tablePreset } from './presets/lotes.table.jsx';

// Claves de storage
const LS_LEGACY_COLS = 'tablaLotes:columns:v7';
const STORAGE_VERSION = 'v2';
const APP_NS = 'lfed';
const makeColsKey = (userKey) => `${APP_NS}:tabla-cols:${STORAGE_VERSION}:${userKey}`;

// Componente dropdown para "Registrar Operación"
function RegistrarOperacionDropdown({ lote, onSelectOperacion }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [tienePrioridadActiva, setTienePrioridadActiva] = useState(false);
  const [loadingPrioridad, setLoadingPrioridad] = useState(false);

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        btnRef.current &&
        !btnRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Verificar si el lote tiene prioridad activa
  useEffect(() => {
    if (!lote?.id) {
      setTienePrioridadActiva(false);
      return;
    }

    let abort = false;
    setLoadingPrioridad(true);
    (async () => {
      try {
        const resp = await getAllPrioridades({ loteId: lote.id, estado: "ACTIVA" });
        const prioridades = resp?.data?.prioridades ?? resp?.prioridades ?? [];
        if (!abort) {
          setTienePrioridadActiva(prioridades.length > 0);
        }
      } catch (err) {
        console.error("Error verificando prioridad activa:", err);
        if (!abort) {
          setTienePrioridadActiva(false);
        }
      } finally {
        if (!abort) {
          setLoadingPrioridad(false);
        }
      }
    })();

    return () => { abort = true; };
  }, [lote?.id]);

  // Obtener estado del lote
  const estadoLote = String(getEstadoFromLote(lote) || "").toUpperCase();

  // Determinar habilitación según estado
  // Prioridad: solo DISPONIBLE o EN_PROMOCION, y sin prioridad activa
  const puedePrioridad = (estadoLote === "DISPONIBLE" || estadoLote === "EN_PROMOCION") && !tienePrioridadActiva && !loadingPrioridad;
  const puedeReserva = estadoLote === "DISPONIBLE" || estadoLote === "EN_PROMOCION" || estadoLote === "CON_PRIORIDAD";
  const puedeVenta = estadoLote === "DISPONIBLE" || estadoLote === "EN_PROMOCION" || estadoLote === "CON_PRIORIDAD" || estadoLote === "RESERVADO";

  // Obtener mensajes de tooltip para opciones disabled
  const getTooltipPrioridad = () => {
    if (loadingPrioridad) return "Verificando...";
    if (tienePrioridadActiva || estadoLote === "CON_PRIORIDAD") return "Este lote ya tiene una prioridad activa.";
    if (estadoLote !== "DISPONIBLE" && estadoLote !== "EN_PROMOCION") {
      return "Solo se puede registrar prioridad para lotes DISPONIBLE o EN PROMOCIÓN.";
    }
    return "";
  };

  const getTooltipReserva = () => {
    if (estadoLote === "RESERVADO") return "El lote ya está reservado";
    if (estadoLote === "VENDIDO") return "Lote vendido";
    if (estadoLote === "NO_DISPONIBLE") return "Lote no disponible";
    return "";
  };

  const getTooltipVenta = () => {
    if (estadoLote === "VENDIDO") return "Lote vendido";
    if (estadoLote === "NO_DISPONIBLE") return "Lote no disponible";
    return "";
  };

  const handleSelect = (tipo) => {
    if (tipo === 'prioridad' && !puedePrioridad) return;
    if (tipo === 'reserva' && !puedeReserva) return;
    if (tipo === 'venta' && !puedeVenta) return;
    onSelectOperacion?.(tipo, lote);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        className="tl-icon tl-icon--money"
        aria-label="Registrar operación"
        data-tooltip="Registrar Operación"
        onClick={() => setOpen(!open)}
        style={{ position: "relative" }}
      >
        <DollarSign size={18} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: btnRef.current ? `${btnRef.current.getBoundingClientRect().bottom + 4}px` : "auto",
            right: btnRef.current ? `${window.innerWidth - btnRef.current.getBoundingClientRect().right}px` : "auto",
            background: "#fff",
            border: "1px solid rgba(0,0,0,.14)",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,.15)",
            zIndex: 99999,
            minWidth: "200px",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={() => handleSelect('prioridad')}
            disabled={!puedePrioridad}
            title={getTooltipPrioridad()}
            style={{
              width: "100%",
              padding: "10px 14px",
              textAlign: "left",
              background: "transparent",
              border: "none",
              cursor: puedePrioridad ? "pointer" : "not-allowed",
              fontSize: "14px",
              color: puedePrioridad ? "#111827" : "#9ca3af",
              opacity: puedePrioridad ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (puedePrioridad) e.target.style.background = "#f3f4f6";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "transparent";
            }}
          >
            Registrar Prioridad
          </button>
          <button
            type="button"
            onClick={() => handleSelect('reserva')}
            disabled={!puedeReserva}
            title={getTooltipReserva()}
            style={{
              width: "100%",
              padding: "10px 14px",
              textAlign: "left",
              background: "transparent",
              border: "none",
              borderTop: "1px solid #e5e7eb",
              cursor: puedeReserva ? "pointer" : "not-allowed",
              fontSize: "14px",
              color: puedeReserva ? "#111827" : "#9ca3af",
              opacity: puedeReserva ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (puedeReserva) e.target.style.background = "#f3f4f6";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "transparent";
            }}
          >
            Registrar Reserva
          </button>
          <button
            type="button"
            onClick={() => handleSelect('venta')}
            disabled={!puedeVenta}
            title={getTooltipVenta()}
            style={{
              width: "100%",
              padding: "10px 14px",
              textAlign: "left",
              background: "transparent",
              border: "none",
              borderTop: "1px solid #e5e7eb",
              cursor: puedeVenta ? "pointer" : "not-allowed",
              fontSize: "14px",
              color: puedeVenta ? "#111827" : "#9ca3af",
              opacity: puedeVenta ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (puedeVenta) e.target.style.background = "#f3f4f6";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "transparent";
            }}
          >
            Registrar Venta
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

export default function TablaLotes({
  lotes, data,
  onVer, onEditar, onRegistrarVenta, onEliminar,
  onAgregarLote, onAplicarPromo,
  onRegistrarOperacion,
  roleOverride,
  userKey,
}) {
  // Dataset 
  const source = useMemo(() => {
    if (Array.isArray(lotes) && lotes.length) return lotes;
    if (Array.isArray(data) && data.length) return data;
    return Array.isArray(lotes) ? lotes : Array.isArray(data) ? data : [];
  }, [lotes, data]);

  // Auth/rol 
  const auth = (() => { try { return useAuth?.() || {}; } catch { return {}; } })();
  const role = (roleOverride || auth?.user?.role || auth?.role || 'admin').toString().toLowerCase();

  // userKey persistencia por usuario+rol 
  const effectiveUserKey = useMemo(() => {
    if (userKey) return userKey;
    try {
      const raw = localStorage.getItem('auth:user');
      const u = raw ? JSON.parse(raw) : null;
      const id = u?.id || u?.email || u?.username || 'anon';
      return `${id}:${role || 'norole'}`;
    } catch {
      return `anon:${role || 'norole'}`;
    }
  }, [userKey, role]);

  // ===== helpers inyectados al preset =====
  const helpers = useMemo(() => ({
    cells: { estadoBadge, subestadoBadge, StatusBadge, SubstatusBadge },
    fmt: { fmtMoney, fmtM2, fmtM, fmtEstado },
    getters: { getPropietarioNombre, getUbicacion, getTipo, getFraccion, getInquilino, getOcupacion, getNumPartida, getLoteIdFormatted },
  }), []);

  // ===== catálogo de columnas desde el preset =====
  const ALL_COLUMNS = useMemo(() => tablePreset.makeColumns(helpers), [helpers]);
  // Deuda: solo ADMINISTRADOR y GESTOR (el backend no la envía al resto). Fuera de ALL_SAFE, el selector
  // no la ofrece y no se muestra aunque haya quedado guardada en localStorage.
  const puedeVerDeuda = canSeeDeuda(auth?.user);
  const ALL_SAFE = useMemo(
    () => [...new Map(ALL_COLUMNS.map((c) => [c.id, c])).values()].filter((c) => c.id !== 'deuda' || puedeVerDeuda),
    [ALL_COLUMNS, puedeVerDeuda]
  );

  // ===== plantillas por rol  =====
  const getDefaultColsForRole = (r) => {
    const key = (r || '').toLowerCase();
    const tpl = tablePreset.COLUMN_TEMPLATES_BY_ROLE[key] || tablePreset.COLUMN_TEMPLATES_BY_ROLE.admin;
    return tpl.filter((id) => ALL_SAFE.some((c) => c.id === id));
  };

  // ===== visibilidad por estados  =====
  const ALLEST = ['DISPONIBLE','NO_DISPONIBLE','RESERVADO','VENDIDO','ALQUILADO'];
  const allowedEstados = useMemo(
    () => new Set(filterEstadoOptionsFor(auth?.user || { role }, ALLEST)),
    [auth?.user, role]
  );
  const norm = (s) => (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const isNoDisponible = (estado) => norm(estado).replace(/_/g, ' ') === 'no disponible';

  const filteredSource = useMemo(() => {
    if (!allowedEstados.has('NO_DISPONIBLE')) return source.filter((l) => !isNoDisponible(l?.estado));
    return source;
  }, [source, allowedEstados]);

  // ===== columnas visibles  =====
  const baseDefaultCols = useMemo(() => getDefaultColsForRole(role), [role]);
  const MAX_VISIBLE = Math.max(5, baseDefaultCols.length);

  const [colIds, setColIds] = useState(() => baseDefaultCols);

  useEffect(() => {
    const key = makeColsKey(effectiveUserKey);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          const valid = parsed.filter((id) => ALL_SAFE.some((c) => c.id === id));
          setColIds(valid.length ? valid : baseDefaultCols);
          return;
        }
      }
      const legacy = localStorage.getItem(LS_LEGACY_COLS);
      if (legacy) {
        localStorage.setItem(key, legacy);
        const parsed = JSON.parse(legacy);
        const valid = Array.isArray(parsed)
          ? parsed.filter((id) => ALL_SAFE.some((c) => c.id === id))
          : baseDefaultCols;
        setColIds(valid.length ? valid : baseDefaultCols);
        return;
      }
      setColIds(baseDefaultCols);
    } catch {
      setColIds(baseDefaultCols);
    }
  }, [effectiveUserKey, baseDefaultCols, ALL_SAFE]);

  useEffect(() => {
    const key = makeColsKey(effectiveUserKey);
    try { localStorage.setItem(key, JSON.stringify(colIds)); } catch {}
  }, [colIds, effectiveUserKey]);

  const visibleCols = useMemo(() => {
    const map = new Map();
    colIds.forEach((id) => {
      if (!map.has(id)) {
        const def = ALL_SAFE.find((c) => c.id === id);
        if (def) map.set(id, def);
      }
    });
    return Array.from(map.values());
  }, [colIds, ALL_SAFE]);

  // ===== grilla: usa el widthFor del preset  =====
  const gridTemplate = useMemo(() => {
    const cols = visibleCols.map((c) => tablePreset.widthFor(c.id)).join(' ');
    return `42px ${cols} 1fr 220px`;
  }, [visibleCols]);

  // ===== paginación / selección  =====
  const PAGE_SIZES = [10, 25, 50, 'Todos'];
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);
  
  // ===== preview del mapa  =====
  const [selectedMapIdsForPreview, setSelectedMapIdsForPreview] = useState([]);
  const navigate = useNavigate();

  useEffect(() => { setPage(1); }, [pageSize]);

  const total = filteredSource.length;
  const size = pageSize === 'Todos' ? total : Number(pageSize) || PAGE_SIZES[1];
  const pageCount = Math.max(1, Math.ceil((total || 1) / (size || 1)));
  const start = (page - 1) * (size || 0);
  const end = pageSize === 'Todos' ? total : start + size;

  const pageItems = useMemo(
    () => (pageSize === 'Todos' ? filteredSource : filteredSource.slice(start, end)),
    [filteredSource, pageSize, start, end]
  );

  const getRowId = (l) => String(l.id ?? l.idLote ?? l.codigo);
  const dataSignature = useMemo(() => filteredSource.map(getRowId).join('|'), [filteredSource]);

  useEffect(() => { setPage(1); setSelectedIds([]); }, [dataSignature]);

  const allOnPageIds = pageItems.map(getRowId).filter((x) => x != null);
  const allOnPageSelected = allOnPageIds.length > 0 && allOnPageIds.every((id) => selectedIds.includes(id));

  const toggleRow = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleAllOnPage = () =>
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (allOnPageSelected) allOnPageIds.forEach((id) => s.delete(id));
      else allOnPageIds.forEach((id) => s.add(id));
      return Array.from(s);
    });

  // ===== permisos  =====
  const can = (key) => {
    switch (key) {
      case 'ver':           return canDashboardAction(auth?.user, 'visualizarLote');
      case 'crear':         return canDashboardAction(auth?.user, 'crearLote');
      case 'editar':       return canDashboardAction(auth?.user, 'editarLote');
      case 'venta':         return canDashboardAction(auth?.user, 'registrarVenta');
      case 'eliminar':      return canDashboardAction(auth?.user, 'eliminarLote');
      case 'aplicarPromo':  return canDashboardAction(auth?.user, 'aplicarPromocion');
      default:              return false;
    }
  };

  const empty = total === 0;

  // Obtener mapIds de los lotes seleccionados
  const handleVerEnMapa = () => {
    if (selectedIds.length === 0) return;
    
    const selectedLotes = filteredSource.filter((l) => {
      const rowId = getRowId(l);
      return selectedIds.includes(rowId);
    });
    
    const mapIds = selectedLotes
      .map((l) => l.mapId)
      .filter(Boolean);
    
    if (mapIds.length > 0) {
      setSelectedMapIdsForPreview(mapIds);
    }
  };

  const handleCerrarPreview = () => {
    setSelectedMapIdsForPreview([]);
  };

  const handleVerMapaCompleto = () => {
    if (selectedMapIdsForPreview.length === 0) return;
    // Navegar al mapa sin tocar filtros, solo pasando los mapIds para resaltar
    const params = new URLSearchParams();
    params.set('selectedMapIds', selectedMapIdsForPreview.join(','));
    navigate(`/map?${params.toString()}`);
  };

  // Preparar datos para el mapa en preview
  const variantByMapId = useMemo(() => {
    const map = {};
    source.forEach((lote) => {
      if (!lote?.mapId) return;
      const estadoRaw = getEstadoFromLote(lote);
      map[lote.mapId] = getEstadoVariant(estadoRaw);
    });
    return map;
  }, [source]);

  const estadoByMapId = useMemo(() => {
    const map = {};
    source.forEach((lote) => {
      if (!lote?.mapId) return;
      const estadoRaw = getEstadoFromLote(lote);
      map[lote.mapId] = normalizeEstadoKey(estadoRaw);
    });
    return map;
  }, [source]);

  const labelByMapId = useMemo(() => {
    const map = {};
    source.forEach((lote) => {
      if (!lote?.mapId || lote?.numero == null) return;
      map[lote.mapId] = String(lote.numero);
    });
    return map;
  }, [source]);

  // En modo preview, todos los lotes deben ser activos para verse con su color normal
  const allActiveMapIds = useMemo(() => {
    return source.map((l) => l.mapId).filter(Boolean);
  }, [source]);

  return (
    <div className="tl-wrapper">
      {/* Toolbar */}
      <div className="tl-toolbar">
        <div className="tl-pages-left">
          <PageSizeDropdown
            value={pageSize}
            options={[10, 25, 50, 'Todos']}
            onChange={(opt) => setPageSize(opt === 'Todos' ? 'Todos' : Number(opt))}
          />

          {/* Columnas (popover + DnD) */}
          <div className="tl-columns">
            <button
              type="button"
              className="tl-btn tl-btn--ghost tl-btn--columns2"
              onClick={(e) => e.currentTarget.nextElementSibling?.classList.toggle('is-open')}
              title="Elegir columnas"
            >
              <Columns3 size={18} strokeWidth={2} />
              <span className="tl-btn__text">Columnas</span>
            </button>

            <div className="tl-popover__container">
              <ColumnPicker
                all={ALL_SAFE}
                selected={colIds}
                onChange={setColIds}
                max={Math.max(5, baseDefaultCols.length)}
                onResetVisibleCols={() => {
                  try { localStorage.removeItem(makeColsKey(effectiveUserKey)); } catch {}
                  setColIds(baseDefaultCols);
                }}
              />
            </div>
          </div>
        </div>

        <div className="tl-actions-right">
          <button 
            type="button" 
            className="tl-btn tl-btn--soft" 
            disabled={selectedIds.length === 0}
            onClick={handleVerEnMapa}
          >
            Ver en mapa ({selectedIds.length})
          </button>
          <button
            type="button"
            className="tl-btn tl-btn--soft"
            disabled={selectedIds.length === 0}
            onClick={() => setSelectedIds([])}
            title="Quitar selección"
          >
            Limpiar selección
          </button>
          {can('crear') && (
            <button type="button" className="tl-btn tl-btn--soft" onClick={() => onAgregarLote?.()}>
              + Agregar Lote
            </button>
          )}
        </div>
      </div>

      {/* Preview del mapa - card flotante */}
      {selectedMapIdsForPreview.length > 0 && (
        <>
          {/* Backdrop muy sutil */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.12)',
              zIndex: 1999
            }}
            onClick={handleCerrarPreview}
          />
          {/* Card */}
          <div 
            style={{
              position: 'fixed',
              top: '15%',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 2000,
              width: 'min(950px, 80vw)',
              maxHeight: '80vh',
              backgroundColor: '#fff',
              borderRadius: '12px',
              border: '1px solid rgba(0,0,0,0.12)',
              boxShadow: '0 14px 34px rgba(0,0,0,0.18)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            backgroundColor: '#eaf3ed',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            flexShrink: 0
          }}>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              Vista previa del mapa ({selectedMapIdsForPreview.length} {selectedMapIdsForPreview.length === 1 ? 'lote' : 'lotes'})
            </h4>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="tl-btn tl-btn--soft"
                onClick={handleVerMapaCompleto}
                style={{ fontSize: '0.875rem', padding: '6px 16px' }}
              >
                Ver mapa completo
              </button>
              <button
                type="button"
                className="tl-btn tl-btn--ghost"
                onClick={handleCerrarPreview}
                style={{ 
                  padding: '4px 8px',
                  minWidth: 'auto',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            backgroundColor: '#f9fafb',
            position: 'relative',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <MapaInteractivo
              isPreview={true}
              selectedMapIds={selectedMapIdsForPreview}
              variantByMapId={variantByMapId}
              activeMapIds={allActiveMapIds}
              labelByMapId={labelByMapId}
              estadoByMapId={estadoByMapId}
            />
          </div>
        </div>
        </>
      )}

      {/* Tabla */}
      <div className="tl-table">
        {/* Head */}
        <div className="tl-thead">
          <div className="tl-tr" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="tl-th tl-th--checkbox">
              <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} />
            </div>
            {visibleCols.map((c) => (
              <div key={c.id} className={`tl-th tl-th--${c.align || 'left'}`}>{c.titulo}</div>
            ))}
            <div aria-hidden className="tl-th tl-th--spacer-invisible" />
            <div className="tl-th tl-th--actions">Acciones</div>
          </div>
        </div>

        {/* Body */}
        <div className="tl-tbody">
          {empty && <div className="tl-empty">No se encontraron lotes.</div>}

          {!empty && pageItems.map((l) => {
            const rowId = getRowId(l);
            return (
              <div key={rowId} className="tl-tr" style={{ gridTemplateColumns: gridTemplate }}>
                <div className="tl-td tl-td--checkbox">
                  <input type="checkbox" checked={selectedIds.includes(rowId)} onChange={() => toggleRow(rowId)} />
                </div>

                {visibleCols.map((c) => {
                  const val = c.accessor(l);
                  return (
                    <div
                      key={c.id}
                      data-col={c.id}
                      className={`tl-td tl-td--${c.align || 'left'}`}
                      title={typeof val === 'string' ? val : undefined}
                    >
                      {val}
                    </div>
                  );
                })}

                <div aria-hidden className="tl-td tl-td--spacer-invisible" />

                <div className="tl-td tl-td--actions" data-col="actions">
                  {can('ver') && (
                    <button className="tl-icon tl-icon--view" aria-label="Ver lote" data-tooltip="Ver Lote" onClick={() => onVer?.(l)}>
                      <Eye size={18} strokeWidth={2} />
                    </button>
                  )}
                  {can('editar') && (
                    <button className="tl-icon tl-icon--edit" aria-label="Editar lote" data-tooltip="Editar Lote" onClick={() => onEditar?.(l)}>
                      <Edit size={18} strokeWidth={2} />
                    </button>
                  )}
                  {can('venta') && (
                    <RegistrarOperacionDropdown
                      lote={l}
                      onSelectOperacion={onRegistrarOperacion}
                    />
                  )}
                  {can('eliminar') && (
                    <button className="tl-icon tl-icon--delete" aria-label="Eliminar lote" data-tooltip="Eliminar Lote" onClick={() => onEliminar?.(l)}>
                      <Trash2 size={18} strokeWidth={2} />
                    </button>
                  )}
                  {can('aplicarPromo') && (() => {
                    const estadoLote = String(getEstadoFromLote(l) || "").toUpperCase();
                    const isDisponible = estadoLote === "DISPONIBLE";
                    const isEnPromocion = estadoLote === "EN_PROMOCION";
                    const isDisabled = !isDisponible && !isEnPromocion;
                    
                    const tooltip = isDisponible 
                      ? "Aplicar Promoción"
                      : isEnPromocion
                      ? "Ver Promoción"
                      : "Solo para lotes en estado DISPONIBLE";
                    
                    const label = isEnPromocion ? "En promoción" : "Aplicar Promoción";
                    
                    return (
                      <button
                        className={`tl-icon tl-icon--promo ${isDisabled ? "is-disabled" : ""}`}
                        aria-label={label}
                        data-tooltip={tooltip}
                        onClick={() => {
                          if (isDisabled) {
                            // Mostrar feedback si está disabled
                            return;
                          }
                          onAplicarPromo?.(l, isEnPromocion ? "ver" : "aplicar");
                        }}
                        disabled={isDisabled}
                        style={{
                          cursor: isDisabled ? "not-allowed" : "pointer",
                        }}
                      >
                        <CirclePercent 
                          size={18} 
                          strokeWidth={2} 
                          style={{
                            opacity: isDisabled ? 0.5 : 1,
                          }}
                        />
                      </button>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Paginador */}
      {pageSize !== 'Todos' && pageCount > 1 && (
        <div className="tl-pagination">
          <button className="tl-btn tl-btn--ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            ‹ Anterior
          </button>
          <span className="tl-pageinfo">Página {page} de {pageCount}</span>
          <button className="tl-btn tl-btn--ghost" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
            Siguiente ›
          </button>
        </div>
      )}
    </div>
  );
}
