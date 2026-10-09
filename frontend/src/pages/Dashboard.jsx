import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../app/providers/AuthProvider";
import { useToast } from "../app/providers/ToastProvider";
import FilterBarLotes from "../components/FilterBar/FilterBarLotes";
import { applyLoteFilters } from "../utils/applyLoteFilters";
import { applySearch } from "../utils/search/searchCore";
import { getLoteSearchFields } from "../utils/search/fields/loteSearchFields";
import TablaLotes from "../components/Table/TablaLotes/TablaLotes";
import SuccessAnimation from "../components/Cards/Base/SuccessAnimation.jsx";
import LoteVerCard from "../components/Cards/Lotes/LoteVerCard.jsx";
import LoteEditarCard from "../components/Cards/Lotes/LoteEditarCard.jsx";
import LoteEliminarDialog from "../components/Cards/Lotes/LoteEliminarDialog.jsx";
import LoteCrearCard from "../components/Cards/Lotes/LoteCrearCard.jsx";
import PromocionCard from "../components/Cards/Lotes/PromocionCard.jsx";
import ReservaCrearCard from "../components/Cards/Reservas/ReservaCrearCard.jsx";
import VentaCrearCard from "../components/Cards/Ventas/VentaCrearCard.jsx";
import PrioridadCrearCard from "../components/Cards/Prioridades/PrioridadCrearCard.jsx";
import { getAllLotes, getLoteById, deleteLote } from "../lib/api/lotes";
import { getReservaActivaByLoteId } from "../lib/api/reservas";
import ReservaVerCard from "../components/Cards/Reservas/ReservaVerCard.jsx";

/**
 * Dashboard
 * - Orquesta FilterBarLotes (filtros globales) + TablaLotes (presentación/acciones locales).
 */

export default function Dashboard() {
  const { user } = useAuth();
  const { error } = useToast();
  const userRole = (user?.role ?? user?.rol ?? "ADMIN").toString().trim().toUpperCase();
  const navigate = useNavigate();
  const location = useLocation();

  const authRaw = localStorage.getItem("auth:user");
  const authUser = authRaw ? JSON.parse(authRaw) : null;

  const userKey = [
    authUser?.id || authUser?.email || authUser?.username || "anon",
    userRole,
  ].join(":");

  const [loteSel, setLoteSel] = useState(null);
  const [openVer, setOpenVer] = useState(false);
  const [openEditar, setOpenEditar] = useState(false);
  const [openEliminar, setOpenEliminar] = useState(false);
  const [openCrear, setOpenCrear] = useState(false);
  const [openReservaCrear, setOpenReservaCrear] = useState(false);
  const [openReservaVer, setOpenReservaVer] = useState(false);
  const [reservaSel, setReservaSel] = useState(null);
  const [openVentaCrear, setOpenVentaCrear] = useState(false);
  const [loteParaVenta, setLoteParaVenta] = useState(null);
  const [lockLoteVenta, setLockLoteVenta] = useState(false);
  const [lockLoteReserva, setLockLoteReserva] = useState(false);
  const [openPrioridadCrear, setOpenPrioridadCrear] = useState(false);
  const [loteParaPrioridad, setLoteParaPrioridad] = useState(null);
  const [lockLotePrioridad, setLockLotePrioridad] = useState(false);
  const [openPromocion, setOpenPromocion] = useState(false);
  const [loteParaPromocion, setLoteParaPromocion] = useState(null);
  const [modoPromocion, setModoPromocion] = useState("aplicar"); // "aplicar" o "ver"
  const [deleting, setDeleting] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  
  // Declarar allLotes y loading antes de usarlos en los useEffects
  const [allLotes, setAllLotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const goRegistrarVenta = useCallback((lot) => {
    if (!lot) return;
    setLoteParaVenta(lot);
    setOpenVentaCrear(true);
  }, []);

  const handleRegistrarOperacion = useCallback((tipo, lote) => {
    if (!lote) return;
    if (tipo === 'venta') {
      setLoteParaVenta(lote);
      setLockLoteVenta(true); // Bloquear lote cuando viene desde fila
      setOpenVentaCrear(true);
    } else if (tipo === 'reserva') {
      setLoteSel(lote);
      setLockLoteReserva(true); // Bloquear lote cuando viene desde fila
      setOpenReservaCrear(true);
    } else if (tipo === 'prioridad') {
      setLoteParaPrioridad(lote);
      setLockLotePrioridad(true); // Bloquear lote cuando viene desde fila
      setOpenPrioridadCrear(true);
    }
  }, []);

  const handleAplicarPromo = useCallback((lote, modo = "aplicar") => {
    if (!lote) return;
    setLoteParaPromocion(lote);
    setModoPromocion(modo); // "aplicar" o "ver"
    setOpenPromocion(true);
  }, []);

  const handleReservarLote = useCallback(async (lot) => {
    if (!lot) return;
    setLoteSel(lot);
    setOpenVer(false);
    
    // Verificar si el lote está RESERVADO
    const estadoUpper = String(lot?.estado || "").toUpperCase();
    if (estadoUpper === "RESERVADO") {
      // Buscar la reserva ACTIVA para este lote (filtrada en backend, ya normalizada)
      try {
        const reservaActiva = await getReservaActivaByLoteId(lot.id);
        
        if (reservaActiva) {
          // Abrir el modal de ver reserva
          setReservaSel(reservaActiva);
          setOpenReservaVer(true);
        } else {
          // Si no hay reserva activa, permitir crear (caso edge)
          setOpenReservaCrear(true);
        }
      } catch (err) {
        console.error("Error buscando reserva:", err);
        // En caso de error, abrir crear
        setOpenReservaCrear(true);
      }
    } else {
      // Si no está reservado, abrir crear
      setOpenReservaCrear(true);
    }
  }, []);

  const mergeUpdatedLote = useCallback((updated) => {
    if (!updated || updated.id == null) return;
      const idStr = String(updated.id);
      setAllLotes((prev) =>
        prev.map((row) =>
        String(row?.id) === idStr ? { ...row, ...updated } : row
          )
        );
        setLoteSel((prev) =>
          prev && String(prev.id) === idStr ? { ...prev, ...updated } : prev
        );
      }, []);
    
  const fetchAndMergeLote = useCallback(
      async (candidate) => {
        const id =
          candidate?.id ?? candidate?.loteId ?? candidate?.idLote ?? null;
        if (!id) return;
        try {
            const resp = await getLoteById(id);
            const detail = resp?.data ?? resp ?? null;
            if (detail) mergeUpdatedLote(detail);
          } catch (err) {
            console.error("Error obteniendo lote por id:", err);
            error("No pude obtener el detalle del lote.");
          }
        },
        [mergeUpdatedLote, error]
      );
    
      const onVer = useCallback(
        (lot) => {
          if (!lot) return;
          setLoteSel(lot);
          setOpenVer(true);
          fetchAndMergeLote(lot);
        },
        [fetchAndMergeLote]
      );

  // Abrir automáticamente el modal "Ver" cuando viene openLoteId desde navegación
  useEffect(() => {
    const state = location.state;
    if (state?.openLoteId && state?.openMode === 'view' && allLotes.length > 0) {
      const loteId = state.openLoteId;
      const lote = allLotes.find(l => l.id === loteId || String(l.id) === String(loteId));
      if (lote) {
        setLoteSel(lote);
        setOpenVer(true);
        fetchAndMergeLote(lote);
        // Limpiar el state para que no se reabra si refresco
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, allLotes, fetchAndMergeLote]);
    
      const onEditar = useCallback(
        (lot) => {
          if (!lot) return;
          setLoteSel(lot);
          setOpenEditar(true);
          fetchAndMergeLote(lot);
        },
        [fetchAndMergeLote]
      );
    
      const onEliminar = useCallback((lot) => {
        if (!lot) return;
        setLoteSel(lot);
        setOpenEliminar(true);
      }, []);

      const onAgregarLote = useCallback(() => {
        setOpenCrear(true);
      }, []);
    
      const handleEditSaved = useCallback(
        (updated) => {
          if (updated?.id == null) {
            setOpenEditar(false);
            return;
          }
          mergeUpdatedLote(updated);
          setOpenEditar(false);
        },
        [mergeUpdatedLote]
      );
    
      const handleDelete = useCallback(async () => {
        if (!loteSel?.id) return;
        try {
          setDeleting(true);
          await deleteLote(loteSel.id);
          setAllLotes((prev) =>
            prev.filter((row) => String(row?.id) !== String(loteSel.id))
          );
          setOpenEliminar(false);
          setOpenVer(false);
          setOpenEditar(false);
          setLoteSel(null);
          setShowDeleteSuccess(true);
          setTimeout(() => {
            setShowDeleteSuccess(false);
          }, 1500);
        } catch (err) {
          console.error("Error eliminando lote:", err);
          error("No pude eliminar el lote.");
        } finally {
          setDeleting(false);
        }
      }, [loteSel, error]);

      const handleCreated = useCallback(
        async (newLote) => {
          if (!newLote?.id) return;
          try {
            // Obtener el lote completo desde la API
            const resp = await getLoteById(newLote.id);
            const detail = resp?.data ?? resp ?? newLote;
            // Agregar al inicio de la lista
            setAllLotes((prev) => [detail, ...prev]);
          } catch (err) {
            console.error("Error obteniendo lote creado:", err);
            // Aún así agregar el lote que viene del create
            setAllLotes((prev) => [newLote, ...prev]);
          }
        },
        []
      );

  // Estado de búsqueda local (NO se sincroniza con URL, NO dispara fetch)
  const [searchText, setSearchText] = useState('');
  
  // Handler para cambios en búsqueda (solo actualiza estado local, NO dispara fetch)
  const handleSearchChange = useCallback((newSearchText) => {
    setSearchText(newSearchText ?? '');
  }, []);

  const [params, setParams] = useState({});
  const handleParamsChange = useCallback((patch) => {
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
  }, []); // Sin dependencias: solo se ejecuta una vez al montar

  // Centralizamos el fetch de lotes en este componente para evitar
  // múltiples llamadas al endpoint /lotes (mapa + tabla lo reciben por props).
  const hasLoadedLotesRef = useRef(false);
  useEffect(() => {
    // Evitar múltiples cargas (React StrictMode ejecuta 2 veces en desarrollo)
    if (hasLoadedLotesRef.current) {
      // Si ya se cargó, asegurar que loading sea false
      setLoading(false);
      return;
    }
    hasLoadedLotesRef.current = true;
    
    let alive = true;
    
    (async () => {
      try {
        setLoading(true);
        const res = await getAllLotes({});
        if (alive) { 
          // getAllLotes siempre devuelve { data: Array } según lotes.js
          const data = res?.data ?? (Array.isArray(res) ? res : []);
          setAllLotes(Array.isArray(data) ? data : []); 
        }
      } catch (err) {
        if (alive) {
          console.error('❌ Error al cargar lotes:', err);
          error("No pude cargar los lotes");
          setAllLotes([]);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();
    
    return () => { 
      alive = false;
      // Resetear el flag si el componente se desmonta para permitir recarga al volver
      hasLoadedLotesRef.current = false;
    };
  }, []); // Sin dependencias: solo se ejecuta una vez al montar

  // Pipeline de filtrado: primero búsqueda, luego otros filtros
  const lots = useMemo(() => {
    // 1. Aplicar búsqueda de texto (100% frontend)
    const afterSearch = applySearch(allLotes, searchText, getLoteSearchFields);
    
    // 2. Aplicar otros filtros (estado, calle, fraccion, etc.)
    const hasParams = params && Object.keys(params).length > 0;
    const result = hasParams ? applyLoteFilters(afterSearch, params) : afterSearch;
    
    // 3. Ordenar
    return [...result].sort((a, b) => {
      const idA = a?.id ?? a?.idLote ?? 0;
      const idB = b?.id ?? b?.idLote ?? 0;
      return idA - idB;
    });
  }, [allLotes, params, searchText]);

  // Mostrar loading mientras se cargan los datos
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "40vh" }}>
        <div className="spinner-border" role="status" />
        <span className="ms-2">Cargando lotes…</span>
      </div>
    );
  }

  return (
    <>
      <FilterBarLotes 
        variant="dashboard" 
        userRole={userRole} 
        onParamsChange={handleParamsChange}
        onSearchChange={handleSearchChange}
      />

      <TablaLotes
        userRole={userRole}
        userKey={userKey}
        lotes={lots}
        data={lots}
        onVer={onVer}
        onView={onVer}
        onEditar={onEditar}
        onEdit={onEditar}
        onEliminar={onEliminar}
        onDelete={onEliminar}
        onRegistrarVenta={goRegistrarVenta}
        onRegisterSale={goRegistrarVenta}
        onRegistrarOperacion={handleRegistrarOperacion}
        onAgregarLote={onAgregarLote}
        onAplicarPromo={handleAplicarPromo}
      />

      <LoteVerCard
        open={openVer}
        lote={loteSel}
        lotes={allLotes}
        onClose={() => setOpenVer(false)}
        onEdit={(lot) => {
          setOpenVer(false);
          onEditar(lot);
        }}
        onReserve={handleReservarLote}
        onUpdated={mergeUpdatedLote}
      />

      <LoteEditarCard
        key={loteSel?.id ?? "lote-editar"}
        open={openEditar}
        lote={loteSel}
        loteId={loteSel?.id}
        lotes={allLotes}
        onCancel={() => setOpenEditar(false)}
        onSaved={handleEditSaved}
      />

      <LoteEliminarDialog
        open={openEliminar}
        lote={loteSel}
        loading={deleting}
        onCancel={() => setOpenEliminar(false)}
        onConfirm={handleDelete}
      />

      <LoteCrearCard
        open={openCrear}
        onCancel={() => setOpenCrear(false)}
        onCreated={handleCreated}
      />

      <ReservaVerCard
        open={openReservaVer}
        reserva={reservaSel}
        reservas={[]}
        onClose={() => {
          setOpenReservaVer(false);
          setReservaSel(null);
        }}
        onEdit={(reserva) => {
          setOpenReservaVer(false);
          // Redirigir a la página de reservas para editar
          navigate(`/reservas`);
        }}
      />

      <ReservaCrearCard
        open={openReservaCrear}
        onCancel={() => {
          setOpenReservaCrear(false);
          setLoteSel(null);
          setLockLoteReserva(false);
        }}
        onCreated={(newReserva) => {
          setOpenReservaCrear(false);
          setLoteSel(null);
          setLockLoteReserva(false);
        }}
        loteIdPreSeleccionado={loteSel?.id}
        lockLote={lockLoteReserva}
      />

      <VentaCrearCard
        open={openVentaCrear}
        onCancel={() => {
          setOpenVentaCrear(false);
          setLoteParaVenta(null);
          setLockLoteVenta(false);
        }}
        onCreated={(newVenta) => {
          setOpenVentaCrear(false);
          if (loteParaVenta?.id) {
            mergeUpdatedLote({ ...loteParaVenta, estado: "VENDIDO", status: "VENDIDO" });
          }
          setLoteParaVenta(null);
          setLockLoteVenta(false);
        }}
        loteIdPreSeleccionado={loteParaVenta?.id ?? loteParaVenta?.idLote}
        lockLote={lockLoteVenta}
      />

      <PrioridadCrearCard
        open={openPrioridadCrear}
        onCancel={() => {
          setOpenPrioridadCrear(false);
          setLoteParaPrioridad(null);
          setLockLotePrioridad(false);
        }}
        onCreated={(newPrioridad) => {
          setOpenPrioridadCrear(false);
          // Refrescar el lote después de crear prioridad (el backend cambia el estado a CON_PRIORIDAD)
          if (loteParaPrioridad?.id) {
            fetchAndMergeLote(loteParaPrioridad);
          }
          setLoteParaPrioridad(null);
          setLockLotePrioridad(false);
        }}
        loteIdPreSeleccionado={loteParaPrioridad?.id ?? loteParaPrioridad?.idLote}
        lockLote={lockLotePrioridad}
      />

      <PromocionCard
        open={openPromocion}
        lote={loteParaPromocion}
        modo={modoPromocion}
        onCancel={() => {
          setOpenPromocion(false);
          setLoteParaPromocion(null);
          setModoPromocion("aplicar");
        }}
        onCreated={async () => {
          setOpenPromocion(false);
          // Refrescar lotes después de aplicar/quitar promoción
          if (loteParaPromocion?.id) {
            try {
              const resp = await getLoteById(loteParaPromocion.id);
              const updated = resp?.data ?? resp;
              mergeUpdatedLote(updated);
            } catch (err) {
              console.error("Error refrescando lote:", err);
              // Refrescar todos los lotes
              try {
                const res = await getAllLotes({});
                const data = res?.data ?? (Array.isArray(res) ? res : []);
                setAllLotes(Array.isArray(data) ? data : []);
              } catch (refreshErr) {
                console.error("Error refrescando lotes:", refreshErr);
              }
            }
          }
          setLoteParaPromocion(null);
          setModoPromocion("aplicar");
        }}
      />

      <SuccessAnimation show={showDeleteSuccess} message="¡Lote eliminado exitosamente!" />

    </>
  );
}
