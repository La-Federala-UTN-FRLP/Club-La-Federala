// src/pages/Reservas.jsx
// Página de reservas usando la arquitectura genérica

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "../app/providers/AuthProvider";
import { can, PERMISSIONS } from "../lib/auth/rbac";
import { useToast } from "../app/providers/ToastProvider";
import FilterBarReservas from "../components/FilterBar/FilterBarReservas";
import TablaReservas from "../components/Table/TablaReservas/TablaReservas";
import { getAllReservas, getReservaById, updateReserva, deleteReserva, reactivarReserva } from "../lib/api/reservas";
import { getAllInmobiliarias } from "../lib/api/inmobiliarias";
import { getAllLotes } from "../lib/api/lotes";
import { applyReservaFilters } from "../utils/applyReservaFilters";
import { applySearch } from "../utils/search/searchCore";
import { getReservaSearchFields } from "../utils/search/fields/reservaSearchFields";

// Helper para enriquecer reserva con mapId del lote
const enrichReservaWithMapId = (reserva, lotesById = {}) => {
  const lookupId = reserva?.loteId ?? reserva?.lotId ?? reserva?.lote?.id ?? null;
  const loteRef =
    reserva?.lote?.mapId
      ? reserva.lote
      : lookupId != null
      ? lotesById[String(lookupId)] || null
      : null;
  const displayMapId =
    loteRef?.mapId ??
    reserva?.lotMapId ??
    (lookupId != null ? lotesById[String(lookupId)]?.mapId : null) ??
    null;

  return {
    ...reserva,
    lotMapId: displayMapId ?? reserva?.lotMapId ?? null,
    lote: loteRef
      ? { ...loteRef, mapId: loteRef.mapId ?? displayMapId ?? null }
      : reserva.lote ?? null,
    loteInfo: reserva.loteInfo
      ? {
          ...reserva.loteInfo,
          mapId: reserva.loteInfo.mapId ?? displayMapId ?? null,
        }
      : displayMapId
      ? { mapId: displayMapId }
      : reserva.loteInfo ?? null,
  };
};

import ReservaVerCard from "../components/Cards/Reservas/ReservaVerCard.jsx";
import ReservaEditarCard from "../components/Cards/Reservas/ReservaEditarCard.jsx";
import ReservaCrearCard from "../components/Cards/Reservas/ReservaCrearCard.jsx";
import ReservaEliminarDialog from "../components/Cards/Reservas/ReservaEliminarDialog.jsx";
import ReservaReactivarDialog from "../components/Cards/Reservas/ReservaReactivarDialog.jsx";
import DocumentoDropdown from "../components/Cards/Documentos/DocumentoDropdown.jsx";
import DocumentoVerCard from "../components/Cards/Documentos/DocumentoVerCard.jsx";

export default function Reservas() {
  const { user } = useAuth();
  const { error } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const crearParam = searchParams.get('crear') === 'true';
  const openIdParam = searchParams.get('openId');
  const searchParamsString = searchParams.toString();
  
  // Detectar inmobiliariaId desde query params
  const selectedInmobiliariaParam = useMemo(() => {
    const params = new URLSearchParams(searchParamsString);
    const raw = params.get("inmobiliariaId");
    if (raw == null) return null;
    const trimmed = raw.trim();
    return trimmed.length ? trimmed : null;
  }, [searchParamsString]);
  
  const selectedInmobiliariaKey = selectedInmobiliariaParam != null ? selectedInmobiliariaParam : null;
  
  // Estado de búsqueda local (NO se sincroniza con URL, NO dispara fetch)
  const [searchText, setSearchText] = useState('');
  
  // Handler para cambios en búsqueda (solo actualiza estado local, NO dispara fetch)
  const handleSearchChange = useCallback((newSearchText) => {
    setSearchText(newSearchText ?? '');
  }, []);

  const [params, setParams] = useState(() => ({
    inmobiliarias: selectedInmobiliariaKey ? [selectedInmobiliariaKey] : [],
    estadoOperativo: "OPERATIVO", // Default: mostrar solo operativas
  }));

  // Aplicar filtro de inmobiliaria cuando cambia desde la URL
  // Usar useRef para evitar loops infinitos
  const lastAppliedInmoRef = useRef(null);
  useEffect(() => {
    if (selectedInmobiliariaKey) {
      // Solo aplicar si no se aplicó ya este mismo valor
      if (lastAppliedInmoRef.current === selectedInmobiliariaKey) {
        return;
      }
      setParams(prev => {
        const currentIds = Array.isArray(prev.inmobiliarias) ? prev.inmobiliarias.map(String) : [];
        if (currentIds.includes(String(selectedInmobiliariaKey))) {
          return prev; // Ya está aplicado
        }
        lastAppliedInmoRef.current = selectedInmobiliariaKey;
        return {
          ...prev,
          inmobiliarias: [String(selectedInmobiliariaKey)],
        };
      });
    } else {
      // Si no hay inmobiliariaId en la URL, limpiar el filtro solo si estaba aplicado
      if (lastAppliedInmoRef.current != null) {
        lastAppliedInmoRef.current = null;
        setParams(prev => {
          if (Array.isArray(prev.inmobiliarias) && prev.inmobiliarias.length > 0) {
            return {
              ...prev,
              inmobiliarias: [],
            };
          }
          return prev;
        });
      }
    }
  }, [selectedInmobiliariaKey]);

  const [allReservas, setAllReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [inmobiliarias, setInmobiliarias] = useState([]);
  const [lotes, setLotes] = useState([]);

  // Permisos
  const canReservaView = can(user, PERMISSIONS.RES_VIEW);
  const canReservaEdit = can(user, PERMISSIONS.RES_EDIT);
  const canReservaDelete = can(user, PERMISSIONS.RES_DELETE);

  // Permisos de archivos
  const canUploadFiles = ['ADMINISTRADOR', 'GESTOR', 'TECNICO'].includes(user?.role);
  const canDeleteFiles = ['ADMINISTRADOR', 'GESTOR'].includes(user?.role);



  // Manejar cambios de parámetros
  const handleParamsChange = useCallback((patch) => {
    if (!patch || Object.keys(patch).length === 0) {
      return;
    }
    setParams(prev => {
      const hasInmoInUrl = selectedInmobiliariaKey != null;
      const patchHasInmo = patch.inmobiliarias && Array.isArray(patch.inmobiliarias) && patch.inmobiliarias.length > 0;
      
      // Si el patch incluye inmobiliarias vacías explícitamente Y hay inmobiliariaId en la URL, NO permitir limpiarlo
      if (hasInmoInUrl && patch.inmobiliarias && Array.isArray(patch.inmobiliarias) && patch.inmobiliarias.length === 0) {
        return {
          ...prev,
          ...patch,
          inmobiliarias: prev.inmobiliarias && prev.inmobiliarias.length > 0 
            ? prev.inmobiliarias 
            : [String(selectedInmobiliariaKey)],
        };
      }
      
      // Si el patch no incluye inmobiliarias o las tiene vacías, y hay inmobiliariaId en la URL, preservar
      if (hasInmoInUrl && !patchHasInmo) {
        return {
          ...prev,
          ...patch,
          inmobiliarias: prev.inmobiliarias && prev.inmobiliarias.length > 0 
            ? prev.inmobiliarias 
            : [String(selectedInmobiliariaKey)],
        };
      }
      
      return {
        ...prev,
        ...patch,
      };
    });
  }, [selectedInmobiliariaKey]);

  // Cargar datos según rol: evitar requests duplicados y cargar solo lo necesario
  const hasLoadedRef = useRef(false);
  const lastUserRoleRef = useRef(user?.role);
  
  useEffect(() => {
    // Si cambió el rol del usuario, resetear el flag para permitir recarga
    if (lastUserRoleRef.current !== user?.role) {
      hasLoadedRef.current = false;
      lastUserRoleRef.current = user?.role;
    }
    
    // Evitar doble llamada en React StrictMode (solo en el mismo render)
    // Si ya se cargó y no hay cambio en estadoOperativo, no recargar
    if (hasLoadedRef.current && !params.estadoOperativo) return;
    hasLoadedRef.current = true;

    let alive = true;
    (async () => {
      try {
        setLoading(true);
        
        // Construir query con estadoOperativo desde params
        const queryParams = {
          ...(params.estadoOperativo ? { estadoOperativo: params.estadoOperativo } : {}),
        };
        
        // Si el usuario es INMOBILIARIA, no cargar inmobiliarias (no las necesita)
        if (user?.role === 'INMOBILIARIA') {
          const [reservasResp, lotesResp] = await Promise.all([
            getAllReservas(queryParams), // Backend ya las devuelve filtradas por inmobiliaria y estadoOperativo
            getAllLotes({}),
          ]);
          
          if (alive) {
            // Manejar respuesta de reservas (puede venir con success o directamente con data)
            const reservasData = reservasResp?.success 
              ? (reservasResp.data?.reservas ?? reservasResp.data ?? [])
              : (reservasResp?.data?.reservas ?? reservasResp?.data ?? []);
            
            const lotesData = lotesResp?.data ?? (Array.isArray(lotesResp) ? lotesResp : []);
            const lotesById = {};
            lotesData.forEach((lote) => {
              if (lote && lote.id != null) {
                lotesById[String(lote.id)] = lote;
              }
            });
            const reservasWithMapId = (Array.isArray(reservasData) ? reservasData : []).map((reserva) => 
              enrichReservaWithMapId(reserva, lotesById)
            );
            setAllReservas(reservasWithMapId);
            setLotes(Array.isArray(lotesData) ? lotesData : []);
            // INMOBILIARIA no necesita inmobiliarias
            setInmobiliarias([]);
          }
        } else {
          // ADMIN / GESTOR: cargar todo
          const [reservasResp, inmosResp, lotesResp] = await Promise.all([
            getAllReservas(queryParams),
            getAllInmobiliarias({ pageSize: 1000 }),
            getAllLotes({}),
          ]);
          
          if (alive) {
            if (reservasResp.success) {
              const reservasData = reservasResp.data?.reservas ?? reservasResp.data ?? [];
              const lotesData = lotesResp?.data ?? (Array.isArray(lotesResp) ? lotesResp : []);
              const lotesById = {};
              lotesData.forEach((lote) => {
                if (lote && lote.id != null) {
                  lotesById[String(lote.id)] = lote;
                }
              });
              const reservasWithMapId = (Array.isArray(reservasData) ? reservasData : []).map((reserva) => {
                const lookupId = reserva?.loteId ?? reserva?.lotId ?? reserva?.lote?.id ?? null;
                const loteRef =
                  reserva?.lote?.mapId
                    ? reserva.lote
                    : lookupId != null
                    ? lotesById[String(lookupId)] || null
                    : null;
                const displayMapId =
                  loteRef?.mapId ??
                  reserva?.lotMapId ??
                  (lookupId != null ? lotesById[String(lookupId)]?.mapId : null) ??
                  null;

                return {
                  ...reserva,
                  lotMapId: displayMapId ?? reserva?.lotMapId ?? null,
                  lote: loteRef
                    ? { ...loteRef, mapId: loteRef.mapId ?? displayMapId ?? null }
                    : reserva.lote ?? null,
                  loteInfo: reserva.loteInfo
                    ? {
                        ...reserva.loteInfo,
                        mapId: reserva.loteInfo.mapId ?? displayMapId ?? null,
                      }
                    : displayMapId
                    ? { mapId: displayMapId }
                    : reserva.loteInfo ?? null,
                };
              });
              setAllReservas(reservasWithMapId);
              setLotes(Array.isArray(lotesData) ? lotesData : []);
            } else {
              error(reservasResp.message || 'Error al cargar reservas');
              setAllReservas([]);
              const lotesData = lotesResp?.data ?? (Array.isArray(lotesResp) ? lotesResp : []);
              setLotes(Array.isArray(lotesData) ? lotesData : []);
            }
            
            // Guardar inmobiliarias para pasarlas a los componentes
            // getAllInmobiliarias devuelve { data: [...], meta: {...} }
            const inmosData = inmosResp?.data ?? (Array.isArray(inmosResp) ? inmosResp : []);
            setInmobiliarias(Array.isArray(inmosData) ? inmosData : []);
          }
        }
      } catch (err) {
        if (alive) {
          console.error('❌ Error cargando reservas:', err);
          error('Error al cargar reservas');
          setAllReservas([]);
          setLotes([]);
          setInmobiliarias([]);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => { 
      alive = false;
      // Resetear el flag si el componente se desmonta para permitir recarga al volver a montar
      hasLoadedRef.current = false;
    };
  }, [user?.role, params.estadoOperativo]); // Depender de estadoOperativo para recargar cuando cambia el filtro

  // Pipeline de filtrado: primero búsqueda, luego otros filtros
  const reservas = useMemo(() => {
    // 1. Aplicar búsqueda de texto (100% frontend)
    const afterSearch = applySearch(allReservas, searchText, getReservaSearchFields);
    
    // 2. Aplicar otros filtros (estado, inmobiliarias, fechas, etc.)
    return applyReservaFilters(afterSearch, params);
  }, [allReservas, params, searchText]);

  // Modales/cards
  const [reservaSel, setReservaSel] = useState(null);
  const [openVer, setOpenVer] = useState(false);
  const [openEditar, setOpenEditar] = useState(false);
  const [openCrear, setOpenCrear] = useState(false);
  const [openEliminar, setOpenEliminar] = useState(false);
  const [openReactivar, setOpenReactivar] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  // Abrir el card de crear cuando viene desde el ModulePills (?crear=true)
  useEffect(() => {
    if (crearParam) {
      setOpenCrear(true);
      // limpiar el query param para no reabrir en navegaciones
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('crear');
        return next;
      }, { replace: true });
    }
  }, [crearParam, setSearchParams]);

  // Abrir automáticamente el modal "Ver" cuando viene openId desde navegación (query param o state)
  useEffect(() => {
    // Prioridad: location.state > query param
    const stateId = location.state?.openId;
    const idToUse = stateId != null ? stateId : (openIdParam ? parseInt(openIdParam, 10) : null);
    
    if (idToUse && allReservas.length > 0) {
      const reservaId = typeof idToUse === 'number' ? idToUse : parseInt(idToUse, 10);
      if (!isNaN(reservaId)) {
        const reserva = allReservas.find(r => r.id === reservaId);
        if (reserva) {
          setReservaSel(reserva);
          setOpenVer(true);
          // Limpiar query param si existe
          if (openIdParam) {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete('openId');
              return next;
            }, { replace: true });
          }
          // Limpiar state
          if (stateId != null) {
            window.history.replaceState({}, document.title);
          }
        }
      }
    }
  }, [openIdParam, location.state, allReservas, setSearchParams]);

  // Ver: abre con la fila y luego refina con getReservaById(id) para traer relaciones/fechas
  const onVer = useCallback((reserva) => {
    if (!reserva) return;
    setReservaSel(reserva);
    setOpenVer(true);

    (async () => {
      try {
        const resp = await getReservaById(reserva.id);
        const detail = resp?.data ?? resp ?? {};
        // Enriquecer con mapId del lote
        const enrichedDetail = enrichReservaWithMapId(detail, {});
        setReservaSel((prev) => ({ ...(prev || reserva), ...(enrichedDetail || {}) }));
      } catch (e) {
        console.error("Error obteniendo reserva por id:", e);
      }
    })();
  }, []);

  // Editar: abre siempre y carga datos completos con relaciones
  const onEditar = useCallback((reserva) => {
    if (!reserva) return;
    setReservaSel(reserva);
    setOpenEditar(true);

    // Cargar datos completos con relaciones (cliente, lote, inmobiliaria, fechas)
    (async () => {
      try {
        const resp = await getReservaById(reserva.id);
        const detail = resp?.data ?? resp ?? {};
        // Enriquecer con mapId del lote
        const enrichedDetail = enrichReservaWithMapId(detail, {});
        setReservaSel({ ...(reserva || {}), ...(enrichedDetail || {}) });
      } catch (e) {
        console.error("Error obteniendo reserva por id para editar:", e);
      }
    })();
  }, []);

  const onEliminar = useCallback((reserva) => {
    // No mostrar toast aquí. El botón ya está deshabilitado con tooltip si no se puede eliminar.
    // Solo abrir el modal si se puede eliminar (validación ya hecha en TablaReservas)
    setReservaSel(reserva);
    setOpenEliminar(true);
  }, []);

  const onReactivar = useCallback((reserva) => {
    setReservaSel(reserva);
    setOpenReactivar(true);
  }, []);

  // Estados para documentos
  const [openDocumentoDropdown, setOpenDocumentoDropdown] = useState(false);
  const [openDocumentoVer, setOpenDocumentoVer] = useState(false);
  const [tipoDocumentoSeleccionado, setTipoDocumentoSeleccionado] = useState(null);
  const [labelDocumentoSeleccionado, setLabelDocumentoSeleccionado] = useState(null);

  const onVerDocumentos = useCallback((reserva) => {
    if (!reserva) return;
    setReservaSel(reserva);
    setOpenDocumentoDropdown(true);
  }, []);

  const handleSelectTipoDocumento = useCallback((tipo, label) => {
    setTipoDocumentoSeleccionado(tipo);
    setLabelDocumentoSeleccionado(label);
    setOpenDocumentoDropdown(false);
    setOpenDocumentoVer(true);
  }, []);

  const handleCerrarDocumentoVer = useCallback(() => {
    setOpenDocumentoVer(false);
    setTipoDocumentoSeleccionado(null);
    setLabelDocumentoSeleccionado(null);
  }, []);

  const onAgregarReserva = useCallback(() => {
    setOpenCrear(true);
  }, []);

  // PUT (Editar) - recibe el objeto actualizado completo del componente
  const handleSave = useCallback(
    async (updatedReserva) => {
      if (!updatedReserva?.id) return;
      try {
        setAllReservas((prev) => prev.map((r) => (r.id === updatedReserva.id ? updatedReserva : r)));
        setReservaSel(updatedReserva);
      } catch (e) {
        console.error("Error actualizando reserva:", e);
        error(e?.message || "Error al actualizar reserva");
      }
    },
    [error]
  );

  const handleCreated = useCallback(
    async (newReserva) => {
      if (!newReserva?.id) return;
      try {
        const resp = await getReservaById(newReserva.id);
        const detail = resp?.data ?? resp ?? newReserva;
        setAllReservas((prev) => [detail, ...prev]);
      } catch (e) {
        setAllReservas((prev) => [newReserva, ...prev]);
      } finally {
        window.dispatchEvent(new CustomEvent('reloadLotes'));
      }
    },
    []
  );

  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [showReactivarSuccess, setShowReactivarSuccess] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!reservaSel?.id) return;
    try {
      setDeleting(true);
      const result = await deleteReserva(reservaSel.id);
      const updated = result?.data || result;
      
      // Actualizar en lista: si estoy en vista "Operativas", la reserva debe desaparecer
      // Si estoy en vista "Eliminadas", debe aparecer ahí
      const currentVisibilidad = params.estadoOperativo ?? "OPERATIVO";
      
      if (currentVisibilidad === "OPERATIVO") {
        // Si estoy viendo operativas, remover la reserva de la lista (ya no es operativa)
        setAllReservas((prev) => prev.filter((r) => r.id !== reservaSel.id));
      } else {
        // Si estoy viendo eliminadas, actualizar la reserva con estadoOperativo = ELIMINADO
        setAllReservas((prev) => prev.map((r) => r.id === reservaSel.id ? { ...r, ...updated, estadoOperativo: 'ELIMINADO' } : r));
      }
      
      setOpenEliminar(false);
      setShowDeleteSuccess(true);
      window.dispatchEvent(new CustomEvent('reloadLotes'));
      setTimeout(() => {
        setShowDeleteSuccess(false);
      }, 1500);
    } catch (e) {
      alert(e?.message || "No se pudo eliminar la reserva.");
    } finally {
      setDeleting(false);
    }
  }, [reservaSel, params.estadoOperativo]);

  const handleReactivar = useCallback(async () => {
    if (!reservaSel?.id) return;
    try {
      setReactivating(true);
      const res = await reactivarReserva(reservaSel.id);
      const updated = res.data || res;
      
      // Actualizar en lista: si estoy en vista "Eliminadas", la reserva debe desaparecer
      // Si estoy en vista "Operativas", debe aparecer ahí
      const currentVisibilidad = params.estadoOperativo ?? "OPERATIVO";
      
      if (currentVisibilidad === "ELIMINADO") {
        // Si estoy viendo eliminadas, remover la reserva de la lista (ya no está eliminada)
        setAllReservas((prev) => prev.filter((r) => r.id !== reservaSel.id));
      } else {
        // Si estoy viendo operativas, actualizar la reserva con estadoOperativo = OPERATIVO
        setAllReservas((prev) => prev.map((r) => r.id === reservaSel.id ? { ...r, ...updated, estadoOperativo: 'OPERATIVO' } : r));
      }
      
      setOpenReactivar(false);
      setShowReactivarSuccess(true);
      window.dispatchEvent(new CustomEvent('reloadLotes'));
      setTimeout(() => {
        setShowReactivarSuccess(false);
      }, 1500);
    } catch (e) {
      alert(e?.message || "No se pudo reactivar la reserva.");
    } finally {
      setReactivating(false);
    }
  }, [reservaSel, params.estadoOperativo]);

  // Verificar permisos
  if (!canReservaView) {
    return (
      <div className="container py-3">
        <div className="alert alert-warning">
          <h4>Acceso Restringido</h4>
          <p>No tienes permisos para ver las reservas.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container py-3">
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
          <div className="text-center">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Cargando...</span>
            </div>
            <p className="text-muted">Cargando reservas...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <FilterBarReservas
        variant="dashboard" 
        userRole={user?.role} 
        value={params} 
        onSearchChange={handleSearchChange}
        onChange={(newParams) => {
          handleParamsChange(newParams);
          // Si se quitó el filtro de inmobiliaria, limpiar la URL
          const inmobIds = Array.isArray(newParams.inmobiliarias) ? newParams.inmobiliarias.map(String) : [];
          if (inmobIds.length === 0 && selectedInmobiliariaKey) {
            const next = new URLSearchParams(searchParams);
            if (next.has("inmobiliariaId")) {
              next.delete("inmobiliariaId");
              setSearchParams(next, { replace: true });
            }
          }
        }}
        inmobiliariasOpts={inmobiliarias.map(i => ({ value: i.id, label: i.nombre }))} 
        onClear={() => {
          const next = new URLSearchParams(searchParams);
          if (next.has("inmobiliariaId")) {
            next.delete("inmobiliariaId");
            setSearchParams(next, { replace: true });
          }
          setParams({});
        }} 
      />

      <TablaReservas
        userRole={user?.role}
        reservas={reservas}
        data={reservas}
        lotes={lotes}
        onVer={canReservaView ? onVer : null}
        onEditar={canReservaEdit ? onEditar : null}
        onEliminar={canReservaDelete ? onEliminar : null}
        onReactivar={canReservaDelete ? onReactivar : null}
        onVerDocumentos={canReservaView ? onVerDocumentos : null}
        onAgregarReserva={can(user, PERMISSIONS.RES_CREATE) ? onAgregarReserva : null}
        selectedIds={selectedIds}
        onSelectedChange={setSelectedIds}
        estadoOperativoFilter={params.estadoOperativo}
      />

      {/* Modales */}
      <ReservaVerCard 
        open={openVer} 
        reserva={reservaSel} 
        reservas={allReservas}
        onClose={() => setOpenVer(false)}
        onEdit={canReservaEdit ? (reserva) => {
          setOpenVer(false);
          // Abrir el modal de editar con la misma reserva
          setReservaSel(reserva);
          setOpenEditar(true);
          
          // Cargar datos completos con relaciones
          (async () => {
            try {
              const resp = await getReservaById(reserva.id);
              const detail = resp?.data ?? resp ?? {};
              // Enriquecer con mapId del lote
              const enrichedDetail = enrichReservaWithMapId(detail, {});
              setReservaSel({ ...(reserva || {}), ...(enrichedDetail || {}) });
            } catch (e) {
              console.error("Error obteniendo reserva por id para editar:", e);
            }
          })();
        } : null}
      />

      <ReservaEditarCard
        key={reservaSel?.id} // Forzar re-render cuando cambia la reserva
        open={openEditar}
        reserva={reservaSel}
        reservas={allReservas}
        inmobiliarias={inmobiliarias}
        onCancel={() => setOpenEditar(false)}
        onSaved={handleSave}
      />

      <ReservaCrearCard
        open={openCrear}
        onCancel={() => setOpenCrear(false)}
        onCreated={handleCreated}
      />

      <ReservaReactivarDialog
        open={openReactivar}
        reserva={reservaSel}
        loading={reactivating}
        onCancel={() => setOpenReactivar(false)}
        onConfirm={handleReactivar}
      />

      <ReservaEliminarDialog
        open={openEliminar}
        reserva={reservaSel}
        loading={deleting}
        onCancel={() => setOpenEliminar(false)}
        onConfirm={handleDelete}
      />

      {/* Dropdown de documentos */}
      <DocumentoDropdown
        open={openDocumentoDropdown}
        onClose={() => setOpenDocumentoDropdown(false)}
        onSelectTipo={handleSelectTipoDocumento}
        canUpload={canUploadFiles}
      />

      {/* Modal de visualización de documento */}
      <DocumentoVerCard
        open={openDocumentoVer}
        onClose={handleCerrarDocumentoVer}
        onVolverAtras={() => {
          setOpenDocumentoVer(false);
          setOpenDocumentoDropdown(true);
        }}
        tipoDocumento={tipoDocumentoSeleccionado}
        loteId={reservaSel?.loteId || reservaSel?.lote?.id}
        loteNumero={reservaSel?.lote?.mapId ?? reservaSel?.lotMapId ?? reservaSel?.loteId ?? reservaSel?.lote?.id}
        canUpload={canUploadFiles}
        canDelete={canDeleteFiles}
      />

      {/* Animación de éxito al eliminar */}
      {showDeleteSuccess && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "grid",
            placeItems: "center",
            zIndex: 10000,
            animation: "fadeIn 0.2s ease-in",
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: "32px 48px",
              borderRadius: "12px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              animation: "scaleIn 0.3s ease-out",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "#10b981",
                display: "grid",
                placeItems: "center",
                animation: "checkmark 0.5s ease-in-out",
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: 600,
                color: "#111",
              }}
            >
              ¡Reserva eliminada exitosamente!
            </h3>
          </div>
        </div>
      )}

      {/* Animación de éxito al reactivar */}
      {showReactivarSuccess && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "grid",
            placeItems: "center",
            zIndex: 10000,
            animation: "fadeIn 0.2s ease-in",
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: "32px 48px",
              borderRadius: "12px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              animation: "scaleIn 0.3s ease-out",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "#10b981", // Green for success
                display: "grid",
                placeItems: "center",
                animation: "checkmark 0.5s ease-in-out",
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: 600,
                color: "#111",
              }}
            >
              ¡Reserva reactivada exitosamente!
            </h3>
          </div>
        </div>
      )}
    </>
  );
}