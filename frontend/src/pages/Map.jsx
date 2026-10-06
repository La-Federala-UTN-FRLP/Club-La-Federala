import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Container } from "react-bootstrap";
import { useOutletContext, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "../app/providers/AuthProvider";

import FilterBarLotes from "../components/FilterBar/FilterBarLotes";
import { applyLoteFilters } from "../utils/applyLoteFilters";
import MapaInteractivo from "../components/Mapa/MapaInteractivo";
import LoteLegend from "../components/Mapa/LoteLegend";
import {
  normalizeEstadoKey,
  getEstadoVariant,
  getEstadoFromLote,
} from "../utils/mapaUtils";

import "../components/Mapa/Map.css";

const EMPTY_LOTS = [];

export default function Map() {
  // Tomo del Layout los lotes, su estado de carga y el handler para abrir el side panel
  const ctx = useOutletContext() || {};
  const allLots = ctx.allLots ?? EMPTY_LOTS;
  const { openSidePanel, selectedLotId, showPanel, loadingLots, lotsError } = ctx;

  const { user } = useAuth();
  const userRole = (user?.role ?? user?.rol ?? "ADMIN")
    .toString()
    .trim()
    .toUpperCase();

  // Leer parámetros de URL y location.state para metadata
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const mapIdParam = searchParams.get("mapId");
  const mapIdsParam = searchParams.get("mapIds");
  const selectedMapIdsParam = searchParams.get("selectedMapIds");

  // Leer metadata desde location.state (nuevo formato del hook)
  const mapHighlight = location.state?.mapHighlight || null;

  // Estado local de filtros (misma idea que en el dashboard)
  const [params, setParams] = useState({});
  
  // Estado para lotes resaltados desde la preview (se puede limpiar)
  // Inicializar desde la URL o desde location.state
  const [highlightedFromPreview, setHighlightedFromPreview] = useState(() => {
    // Prioridad: location.state > query params
    if (mapHighlight?.loteIds?.length > 0) {
      return mapHighlight.loteIds;
    }
    if (selectedMapIdsParam) {
      return selectedMapIdsParam.split(',').filter(Boolean);
    }
    return [];
  });

  // Track si es la primera llamada (inicialización) para no limpiar el resaltado
  const isInitialMount = useRef(true);
  
  // Handler para convertir filtros BAR de formato anidado a plano
  const handleParamsChange = useCallback((patch) => {
    // Solo limpiar el resaltado si NO es la inicialización y realmente hay un cambio de filtros
    if (!isInitialMount.current && highlightedFromPreview.length > 0) {
      // Verificar si realmente hay filtros activos (no solo valores por defecto)
      const hasActiveFilters = patch && Object.keys(patch).length > 0 && 
        Object.values(patch).some(val => {
          if (Array.isArray(val)) return val.length > 0;
          if (typeof val === 'object' && val !== null) {
            return val.min !== null || val.max !== null;
          }
          return val !== '' && val !== null && val !== undefined;
        });
      
      if (hasActiveFilters) {
        setHighlightedFromPreview([]);
        // Limpiar también el parámetro de la URL
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('selectedMapIds');
        setSearchParams(newParams, { replace: true });
      }
    }
    
    // Marcar que ya pasó la inicialización
    if (isInitialMount.current) {
      isInitialMount.current = false;
    }
    
    if (!patch || Object.keys(patch).length === 0) { 
      setParams({}); 
      return; 
    }
    
    // Convertir objetos de rango ({ min, max }) a parámetros planos
    const convertedParams = { ...patch };
    
    // Convertir rangos a formato plano que espera applyLoteFilters
    if (patch.sup && (patch.sup.min !== null || patch.sup.max !== null)) {
      convertedParams.supMin = patch.sup.min !== null ? patch.sup.min : undefined;
      convertedParams.supMax = patch.sup.max !== null ? patch.sup.max : undefined;
      delete convertedParams.sup;
    }
    
    if (patch.precio && (patch.precio.min !== null || patch.precio.max !== null)) {
      convertedParams.priceMin = patch.precio.min !== null ? patch.precio.min : undefined;
      convertedParams.priceMax = patch.precio.max !== null ? patch.precio.max : undefined;
      delete convertedParams.precio;
    }
    
    setParams((prev) => {
      // Limpiar parámetros de rango antiguos si existen
      const cleaned = { ...prev };
      delete cleaned.sup;
      delete cleaned.precio;
      delete cleaned.supMin;
      delete cleaned.supMax;
      delete cleaned.priceMin;
      delete cleaned.priceMax;
      
      return { ...cleaned, ...convertedParams };
    });
  }, [highlightedFromPreview, searchParams, setSearchParams]);

  // Lotes filtrados usando la utilidad que ya tenés
  const filteredLots = useMemo(
    () => applyLoteFilters(allLots, params),
    [allLots, params]
  );

  // Para cada lote, defino el "variant" visual en función de su estado
  const variantByMapId = useMemo(() => {
    const map = {};
    (allLots || []).forEach((lote) => {
      if (!lote?.mapId) return;
      const estadoRaw = getEstadoFromLote(lote);
      map[lote.mapId] = getEstadoVariant(estadoRaw);
    });
    return map;
  }, [allLots]);

  // Para cada lote, guardo su estado (para usar colores especiales como VENDIDO)
  const estadoByMapId = useMemo(() => {
    const map = {};
    (allLots || []).forEach((lote) => {
      if (!lote?.mapId) return;
      const estadoRaw = getEstadoFromLote(lote);
      map[lote.mapId] = normalizeEstadoKey(estadoRaw);
    });
    return map;
  }, [allLots]);

  // Para cada lote, el número que quiero mostrar dentro de la parcela
  const labelByMapId = useMemo(() => {
    const map = {};
    (allLots || []).forEach((lote) => {
      if (!lote?.mapId || lote?.numero == null) return;
      map[lote.mapId] = String(lote.numero);
    });
    return map;
  }, [allLots]);

  // Ids de lotes que pasan el filtro actual (solo estos se verán opacos y clickeables)
  // NUNCA usar selectedMapIds para filtrar, solo para resaltar
  const activeMapIds = useMemo(() => {
    // Siempre usar los lotes filtrados, sin importar si hay selectedMapIds en URL
    return filteredLots.map((l) => l.mapId).filter(Boolean);
  }, [filteredLots]);

  // Obtener mapIds desde parámetros de URL (mapId o mapIds o selectedMapIds)
  // selectedMapIds es para resaltar desde la preview, NO para filtrar
  const mapIdsFromUrl = useMemo(() => {
    if (mapIdsParam) {
      // Si viene mapIds como lista separada por comas
      return mapIdsParam.split(',').filter(Boolean);
    }
    if (mapIdParam) {
      // Si viene mapId como un solo valor
      return [mapIdParam];
    }
    return [];
  }, [mapIdParam, mapIdsParam]);

  // Sincronizar con location.state cuando cambie
  useEffect(() => {
    if (mapHighlight) {
      if (mapHighlight.loteIds?.length > 0) {
        setHighlightedFromPreview(mapHighlight.loteIds);

        // Limpiar el state para que no persista en la navegación
        window.history.replaceState({}, document.title);
      }
    } else if (selectedMapIdsParam) {
      // Fallback: si viene por query params (viejo formato)
      const ids = selectedMapIdsParam.split(',').filter(Boolean);
      setHighlightedFromPreview((prev) => {
        const currentIds = prev.join(',');
        const newIds = ids.join(',');
        if (currentIds !== newIds) {
          return ids;
        }
        return prev;
      });
    }
  }, [mapHighlight, selectedMapIdsParam]);

  // Obtener el mapId del lote seleccionado (para destacarlo en el mapa)
  // Prioriza highlightedFromPreview si viene de la preview, sino mapIdsFromUrl, sino selectedLotId del panel
  const selectedMapId = useMemo(() => {
    if (highlightedFromPreview.length > 0) {
      // Si hay highlightedFromPreview de la preview, usar el primero
      return highlightedFromPreview[0];
    }
    if (mapIdsFromUrl.length > 0) {
      // Si hay mapIds en URL, usar el primero como selectedMapId
      return mapIdsFromUrl[0];
    }
    if (!selectedLotId || !showPanel) return null;
    const lote = allLots.find((l) => l.id === selectedLotId);
    return lote?.mapId || null;
  }, [highlightedFromPreview, mapIdsFromUrl, selectedLotId, showPanel, allLots]);

  // Función para limpiar manualmente el resaltado
  const handleClearHighlight = useCallback(() => {
    setHighlightedFromPreview([]);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('selectedMapIds');
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Cuando clickeo un lote en el mapa, abro el side panel del lote correspondiente
  const handleLoteClick = (mapId) => {
    if (!mapId) return;
    const lote = filteredLots.find((l) => l.mapId === mapId);
    if (!lote) return;

    if (typeof openSidePanel === "function") {
      openSidePanel(lote.id);
    } else {
      console.warn(
        "[Map.jsx] openSidePanel no está disponible en el contexto del Outlet."
      );
    }
  };

  return (
    <>
      {/* Título y leyenda */}
      <div className="map-header">
        <div className="map-header-left">
          <h3>Mapa Interactivo de Lotes</h3>
          <div className="map-info-messages">
            {lotsError ? (
              <span className="map-info-empty" role="alert">No se pudieron cargar los lotes</span>
            ) : loadingLots && allLots.length === 0 ? (
              <span className="map-info-count" role="status">Cargando lotes...</span>
            ) : allLots.length === 0 ? (
              <span className="map-info-count">No hay lotes cargados</span>
            ) : filteredLots.length === 0 ? (
              <span className="map-info-empty">No hay lotes que coincidan con este filtro</span>
            ) : (
              <span className="map-info-count">
                {filteredLots.length} {filteredLots.length === 1 ? "Lote mostrado" : "Lotes mostrados"}
              </span>
            )}
            {highlightedFromPreview.length > 0 && (
              <button
                type="button"
                onClick={handleClearHighlight}
                style={{
                  marginLeft: '12px',
                  padding: '4px 12px',
                  fontSize: '0.875rem',
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
                title="Quitar resaltado de selección previa"
              >
                Quitar resaltado ({highlightedFromPreview.length})
              </button>
            )}
          </div>
        </div>
        <LoteLegend />
      </div>

      {/* Barra de filtros */}
      <FilterBarLotes
        variant="map"
        userRole={userRole}
        onParamsChange={handleParamsChange}
      />

      <Container fluid className="map-container-wrapper">
        {/* Contenedor del mapa interactivo */}
        <div className="map-container">
          
          {/* Mapa */}
          <div className="mapa-wrapper">
            <MapaInteractivo
              onLoteClick={handleLoteClick}
              variantByMapId={variantByMapId}
              activeMapIds={activeMapIds}
              labelByMapId={labelByMapId}
              estadoByMapId={estadoByMapId}
              selectedMapId={selectedMapId}
              selectedMapIds={highlightedFromPreview.length > 0 ? highlightedFromPreview : mapIdsFromUrl}
            />
          </div>
        </div>
      </Container>
    </>
  );
}
