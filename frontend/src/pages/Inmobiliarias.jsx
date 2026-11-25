// src/pages/Inmobiliarias.jsx
// Página de inmobiliarias usando la arquitectura genérica

import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "../app/providers/AuthProvider";
import { can, PERMISSIONS } from "../lib/auth/rbac";
import { useToast } from "../app/providers/ToastProvider";
import FilterBarInmobiliarias from "../components/FilterBar/FilterBarInmobiliarias";
import TablaInmobiliarias from "../components/Table/TablaInmobiliarias/TablaInmobiliarias";
import {
  getAllInmobiliarias,
  getInmobiliariaById,
  updateInmobiliaria,
  deleteInmobiliaria,
  reactivateInmobiliaria
} from "../lib/api/inmobiliarias";
import { applyInmobiliariaFilters } from "../utils/applyInmobiliariaFilters";
import { applySearch } from "../utils/search/searchCore";
import { getInmobiliariaSearchFields } from "../utils/search/fields/inmobiliariaSearchFields";

import InmobiliariaVerCard from "../components/Cards/Inmobiliarias/InmobiliariaVerCard.jsx";
import InmobiliariaEditarCard from "../components/Cards/Inmobiliarias/InmobiliariaEditarCard.jsx";
import InmobiliariaEliminarDialog from "../components/Cards/Inmobiliarias/InmobiliariaEliminarDialog.jsx";
import InmobiliariaReactivarDialog from "../components/Cards/Inmobiliarias/InmobiliariaReactivarDialog.jsx";
import InmobiliariaCrearCard from "../components/Cards/Inmobiliarias/InmobiliariaCrearCard.jsx";

import { useSearchParams } from "react-router-dom";

export default function Inmobiliarias() {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const crearParam = searchParams.get('crear') === 'true';

  // Estado de búsqueda local (NO se sincroniza con URL, NO dispara fetch)
  const [searchText, setSearchText] = useState('');
  
  // Handler para cambios en búsqueda (solo actualiza estado local, NO dispara fetch)
  const handleSearchChange = useCallback((newSearchText) => {
    setSearchText(newSearchText ?? '');
  }, []);

  // Estado de filtros
  const [params, setParams] = useState({});
  const handleParamsChange = useCallback((patch) => {
    if (!patch || Object.keys(patch).length === 0) {
      setParams({});
      return;
    }
    setParams((prev) => ({ ...prev, ...patch }));
  }, []);

  // Dataset base: obtenemos las inmobiliarias desde la API
  // El backend filtra por estadoOperativo; sin parámetro devuelve solo OPERATIVO.
  // Al elegir "Eliminadas" hay que pedir estadoOperativo=ELIMINADO y recargar.
  const [allInmobiliarias, setAllInmobiliarias] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar inmobiliarias; refetch cuando cambia la visibilidad (Operativas / Eliminadas)
  useEffect(() => {
    let alive = true;
    const estadoOperativo = params.visibilidad ?? 'OPERATIVO';

    (async () => {
      try {
        setLoading(true);
        const res = await getAllInmobiliarias({ estadoOperativo });
        if (alive) {
          const data = res.data || [];
          setAllInmobiliarias(data);
        }
      } catch (err) {
        if (alive) {
          console.error('❌ Error al cargar inmobiliarias:', err);
          error("No pude cargar las inmobiliarias");
          setAllInmobiliarias([]);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => { alive = false; };
  }, [params.visibilidad]);

  // Pipeline de filtrado: primero búsqueda, luego otros filtros
  // Siempre aplicar filtros (como Prioridades/Reservas/Ventas): visibilidad OPERATIVO por defecto
  // cuando params está vacío, para que al eliminar (estado ELIMINADO) el ítem deje de verse al instante
  const inmobiliarias = useMemo(() => {
    // 1. Aplicar búsqueda de texto (100% frontend)
    const afterSearch = applySearch(allInmobiliarias, searchText, getInmobiliariaSearchFields);

    // 2. Aplicar filtros (visibilidad, comxventa, cantidadVentas, etc.)
    // Si params está vacío (FilterBar no ha aplicado aún), usar visibilidad OPERATIVO por defecto
    const effectiveParams = { visibilidad: 'OPERATIVO', ...params };
    try {
      return applyInmobiliariaFilters(afterSearch, effectiveParams);
    } catch (err) {
      console.error('Error aplicando filtros:', err);
      return afterSearch;
    }
  }, [allInmobiliarias, params, searchText]);

  // Estado de selección - TablaBase espera array de IDs (strings)
  const [selectedRows, setSelectedRows] = useState([]);
  const handleSelectionChange = useCallback((selection) => {
    setSelectedRows(selection);
  }, []);

  // Modales/cards
  const [inmobiliariaSel, setInmobiliariaSel] = useState(null);
  const [openVer, setOpenVer] = useState(false);
  const [openEditar, setOpenEditar] = useState(false);
  const [openEliminar, setOpenEliminar] = useState(false);
  const [openReactivar, setOpenReactivar] = useState(false);
  const [openCrear, setOpenCrear] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [lastAction, setLastAction] = useState(null); // 'deactivate' o 'reactivate'

  // Ver: abre con la fila y luego refina con getInmobiliariaById(id) para traer fechas/etc.
  const handleVerInmobiliaria = useCallback((inmobiliaria) => {
    if (!inmobiliaria) return;
    setInmobiliariaSel(inmobiliaria);
    setOpenVer(true);

    (async () => {
      try {
        const resp = await getInmobiliariaById(inmobiliaria.id);
        const detail = resp?.data ?? resp ?? {};
        setInmobiliariaSel((prev) => ({ ...(prev || inmobiliaria), ...(detail || {}) }));
      } catch (e) {
        console.error("Error obteniendo inmobiliaria por id:", e);
      }
    })();
  }, []);

  // Editar: abre siempre y carga datos completos
  const handleEditarInmobiliaria = useCallback((inmobiliaria) => {
    if (!inmobiliaria) return;
    setInmobiliariaSel(inmobiliaria);
    setOpenEditar(true);

    // Cargar datos completos
    (async () => {
      try {
        const resp = await getInmobiliariaById(inmobiliaria.id);
        const detail = resp?.data ?? resp ?? {};
        setInmobiliariaSel({ ...(inmobiliaria || {}), ...(detail || {}) });
      } catch (e) {
        console.error("Error obteniendo inmobiliaria por id para editar:", e);
      }
    })();
  }, []);

  const handleEliminarInmobiliaria = useCallback((inmobiliaria) => {
    setInmobiliariaSel(inmobiliaria);
    setOpenEliminar(true);
  }, []);

  const handleReactivarInmobiliaria = useCallback((inmobiliaria) => {
    setInmobiliariaSel(inmobiliaria);
    setOpenReactivar(true);
  }, []);

  const handleAgregarInmobiliaria = useCallback(() => {
    setOpenCrear(true);
  }, []);

  // Abrir al ingresar con ?crear=true
  useEffect(() => {
    if (crearParam) {
      setOpenCrear(true);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('crear');
        return next;
      }, { replace: true });
    }
  }, [crearParam, setSearchParams]);

  // PUT (Editar) - recibe el objeto actualizado completo del componente
  const handleSave = useCallback(
    async (updatedInmobiliaria) => {
      if (!updatedInmobiliaria?.id) return;
      try {
        // La inmobiliaria actualizada ya viene completa del backend
        // Actualizar la lista con la inmobiliaria actualizada
        setAllInmobiliarias((prev) => prev.map((i) => (i.id === updatedInmobiliaria.id ? updatedInmobiliaria : i)));
        setInmobiliariaSel(updatedInmobiliaria);
      } catch (e) {
        console.error("Error actualizando inmobiliaria:", e);
      }
    },
    []
  );

  // CREATE: agregar la inmobiliaria creada a la lista sin recargar (igual que handleSave al editar)
  const handleCreated = useCallback((created) => {
    setOpenCrear(false);
    if (!created?.id) return;
    setAllInmobiliarias((prev) => (prev.some((i) => i.id === created.id) ? prev : [...prev, created]));
  }, []);

  // DELETE (Eliminar - ahora hace baja lógica)
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const handleDelete = useCallback(async () => {
    if (!inmobiliariaSel?.id) return;
    try {
      setDeleting(true);
      const response = await deleteInmobiliaria(inmobiliariaSel.id);
      // La API devuelve la inmobiliaria actualizada con estadoOperativo = ELIMINADO
      const updated = response?.data ?? response;

      // Actualizar en lista con el objeto completo devuelto por el backend
      setAllInmobiliarias((prev) => prev.map((i) => 
        i.id === inmobiliariaSel.id ? updated : i
      ));

      setOpenEliminar(false);
      setLastAction('deactivate');
      setShowDeleteSuccess(true);
      setTimeout(() => {
        setShowDeleteSuccess(false);
      }, 1500);
    } catch (e) {
      console.error("Error desactivando inmobiliaria:", e);
      alert(e?.message || "No se pudo desactivar la inmobiliaria.");
    } finally {
      setDeleting(false);
    }
  }, [inmobiliariaSel]);

  // Verificar permisos
  const canView = can(user, PERMISSIONS.AGENCY_VIEW);
  const canCreate = can(user, PERMISSIONS.AGENCY_CREATE);
  const canEdit = can(user, PERMISSIONS.AGENCY_EDIT);
  const canDelete = can(user, PERMISSIONS.AGENCY_DELETE);
  const canReactivate = can(user, PERMISSIONS.AGENCY_EDIT); // Reactivar requiere permisos de edición

  if (!canView) {
    return (
      <>
        <div className="container py-4">
          <div className="alert alert-warning">
            No tienes permisos para ver las inmobiliarias.
          </div>
        </div>
      </>
    );
  }

  // Mostrar loading mientras se cargan los datos
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "40vh" }}>
        <div className="spinner-border" role="status" />
        <span className="ms-2">Cargando inmobiliarias…</span>
      </div>
    );
  }

  return (
    <>
      {/* Barra de filtros */}
      <FilterBarInmobiliarias
        variant="dashboard"
        userRole={user?.role}
        onParamsChange={handleParamsChange}
        onSearchChange={handleSearchChange}
        value={params} // Pasar params para sincronizar el estado del filtro
      />

      {/* Tabla de inmobiliarias */}
      <TablaInmobiliarias
        data={inmobiliarias}
        loading={loading}
        onAgregarInmobiliaria={canCreate ? handleAgregarInmobiliaria : undefined}
        onEditarInmobiliaria={canEdit ? handleEditarInmobiliaria : undefined}
        onEliminarInmobiliaria={canDelete ? handleEliminarInmobiliaria : undefined}
        onReactivarInmobiliaria={canReactivate ? handleReactivarInmobiliaria : undefined}
        onVerInmobiliaria={canView ? handleVerInmobiliaria : undefined}
        selectedRows={selectedRows}
        onSelectionChange={handleSelectionChange}
      />

      {/* Modales */}
      <InmobiliariaVerCard
        open={openVer}
        inmobiliaria={inmobiliariaSel}
        inmobiliarias={allInmobiliarias}
        onClose={() => setOpenVer(false)}
        onEdit={(inmobiliaria) => {
          setOpenVer(false);
          // Abrir el modal de editar con la misma inmobiliaria
          setInmobiliariaSel(inmobiliaria);
          setOpenEditar(true);

          // Cargar datos completos
          (async () => {
            try {
              const resp = await getInmobiliariaById(inmobiliaria.id);
              const detail = resp?.data ?? resp ?? {};
              setInmobiliariaSel({ ...(inmobiliaria || {}), ...(detail || {}) });
            } catch (e) {
              console.error("Error obteniendo inmobiliaria por id para editar:", e);
            }
          })();
        }}
      />

      <InmobiliariaEditarCard
        key={inmobiliariaSel?.id} // Forzar re-render cuando cambia la inmobiliaria
        open={openEditar}
        inmobiliaria={inmobiliariaSel}
        inmobiliarias={allInmobiliarias}
        onCancel={() => setOpenEditar(false)}
        onSaved={handleSave}
      />

      <InmobiliariaEliminarDialog
        open={openEliminar}
        inmobiliaria={inmobiliariaSel}
        loading={deleting}
        onCancel={() => setOpenEliminar(false)}
        onConfirm={handleDelete}
      />

      <InmobiliariaReactivarDialog
        open={openReactivar}
        inmobiliaria={inmobiliariaSel}
        loading={reactivating}
        onCancel={() => setOpenReactivar(false)}
        onConfirm={async () => {
          if (!inmobiliariaSel?.id) return;
          try {
            setReactivating(true);
            const response = await reactivateInmobiliaria(inmobiliariaSel.id);
            const updated = response?.data ?? response;

            // Actualizar en lista con el objeto completo devuelto por el backend
            setAllInmobiliarias((prev) => prev.map((i) => 
              i.id === inmobiliariaSel.id ? updated : i
            ));

            setOpenReactivar(false);
            setLastAction('reactivate');
            // Mostrar mensaje de éxito (reutilizar el mismo estado)
            setShowDeleteSuccess(true);
            setTimeout(() => {
              setShowDeleteSuccess(false);
            }, 1500);
          } catch (e) {
            console.error("Error reactivando inmobiliaria:", e);
            alert(e?.message || "No se pudo reactivar la inmobiliaria.");
          } finally {
            setReactivating(false);
          }
        }}
      />

      <InmobiliariaCrearCard
        open={openCrear}
        onCancel={() => setOpenCrear(false)}
        onCreated={handleCreated}
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
              {lastAction === 'reactivate'
                ? "¡Inmobiliaria reactivada exitosamente!"
                : "¡Inmobiliaria desactivada exitosamente!"}
            </h3>
          </div>
        </div>
      )}
    </>
  );
}