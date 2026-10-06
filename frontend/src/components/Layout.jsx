"use client"

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Outlet, useSearchParams, useLocation } from "react-router-dom";
import { useToast } from "../app/providers/ToastProvider";
import { mockUser } from "../lib/data";
import { getAllLotes, updateLote, deleteLote, createLote } from "../lib/api/lotes";

import Header from "./Header";
import ModulePills from "./ModulePills";
import Sidebar from "./sidebar/Sidebar";
import User from "./User";
import LotInfo from "./LotInfo";
import ModalGestionLote from "./ModalGestionLote";
import LoteSidePanel from "./Mapa/LoteSidePanel";
import "./Layout.css";

export default function Layout() {
  const { success, error, info } = useToast();
  const [lotsData, setLotsData] = useState([]);
  const [loadingLots, setLoadingLots] = useState(true);
  const [lotsError, setLotsError] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Leer metadata de lotes resaltados desde location.state (para el flujo de Ver en mapa)
  const mapHighlight = useMemo(() => {
    return location.state?.mapHighlight || null;
  }, [location.state]);

  // lotsData solo lo consume el mapa (Outlet context, LoteSidePanel, LotInfo), así que
  // solo se carga mientras la ruta activa es /map. Las demás páginas cargan lo suyo.
  // Se tolera la barra final: "/map/" también renderiza Map.
  const isMapRoute = location.pathname.replace(/\/+$/, "") === "/map";

  // Cada carga toma un número; solo la más reciente puede escribir estado.
  const loadSeq = useRef(0);

  const loadLotes = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoadingLots(true);
    setLotsError(null);
    try {
      const res = await getAllLotes();
      if (seq !== loadSeq.current) return;
      setLotsData(res.data || []);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      console.error("Error cargando lotes:", err);
      setLotsError(err?.message || "Error al cargar lotes");
      error("No pude cargar los lotes");
    } finally {
      if (seq === loadSeq.current) setLoadingLots(false);
    }
  }, [error]);

  // Carga inicial al entrar al mapa; al salir se descarta cualquier respuesta en vuelo.
  useEffect(() => {
    if (!isMapRoute) return;
    const seqRef = loadSeq;
    loadLotes();
    return () => { seqRef.current++; };
  }, [isMapRoute, loadLotes]);

  // reloadLotes lo emiten Reservas y Prioridades (nunca estando en /map); solo refresca si el mapa está activo.
  useEffect(() => {
    if (!isMapRoute) return;
    window.addEventListener('reloadLotes', loadLotes);
    return () => window.removeEventListener('reloadLotes', loadLotes);
  }, [isMapRoute, loadLotes]);

  const [filters, setFilters] = useState({
    search: "", owner: [], location: [], status: [], subStatus: [],
  });

  const filteredLots = lotsData.filter((lot) => {
    if (filters.search && !String(lot.id).toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.owner.length > 0 && !filters.owner.includes(lot.owner)) return false;
    if (filters.location.length > 0 && !filters.location.includes(lot.location || "")) return false;
    if (filters.status.length > 0 && !filters.status.includes(lot.status)) return false;
    if (filters.subStatus.length > 0 && !filters.subStatus.includes(lot.subStatus)) return false;
    return true;
  });

  const handleClearFilters = () => setFilters({ search: "", owner: [], location: [], status: [], subStatus: [] });
  const handleApplyPromotion = () => info("Acción Aplicar Promoción");

  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState(null);
  const [showLotInfo, setShowLotInfo] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  const handleOpenPanel = (lotId) => { setSelectedLotId(lotId); setShowPanel(true); };
  const handleClosePanel = () => setShowPanel(false);
  const handleViewDetail = (lotId) => { setSelectedLotId(lotId); setShowPanel(false); setShowLotInfo(true); };

  const [modalLote, setModalLote] = useState({ show: false, modo: "crear", datosIniciales: null });

  // El panel lateral, LotInfo y el modal que se lanza desde LotInfo solo viven en el mapa: al salir no deben
  // sobrevivir en otras páginas. Con editLotId en la URL el modal lo abrió el flujo legacy, así que no se toca.
  const hasEditLotId = searchParams.has("editLotId");
  useEffect(() => {
    if (isMapRoute) return;
    setShowPanel(false);
    setShowLotInfo(false);
    setSelectedLotId(null);
    if (!hasEditLotId) setModalLote((prev) => (prev.show ? { ...prev, show: false } : prev));
  }, [isMapRoute, hasEditLotId]);
  const abrirModalCrear = () => setModalLote({ show: true, modo: "crear", datosIniciales: null });
  const abrirModalEditar = (lote) => setModalLote({ show: true, modo: "editar", datosIniciales: lote });
  const abrirModalEliminar = (lote) => setModalLote({ show: true, modo: "borrar", datosIniciales: lote });

  useEffect(() => {
    const editLotId = searchParams.get("editLotId");
    if (!editLotId) return;
    const lot = (lotsData || []).find((l) => String(l.id) === String(editLotId));
    if (lot) setModalLote({ show: true, modo: "editar", datosIniciales: lot });
  }, [searchParams, lotsData]);

  const cerrarModalGestion = () => {
    setModalLote((prev) => ({ ...prev, show: false }));
    if (searchParams.has("editLotId")) {
      const next = new URLSearchParams(searchParams);
      next.delete("editLotId");
      setSearchParams(next);
    }
  };

  const handleStatusChange = async (lotId, newStatus) => {
    try {
      await updateLote(lotId, { status: newStatus });
      setLotsData((prev) => prev.map((l) => (l.id === lotId ? { ...l, status: newStatus } : l)));
      success("Estado actualizado");
    } catch { error("No pude actualizar el estado del lote"); }
  };

  const handleSubStatusChange = async (lotId, newSubStatus) => {
    try {
      await updateLote(lotId, { subStatus: newSubStatus });
      setLotsData((prev) => prev.map((l) => (l.id === lotId ? { ...l, subStatus: newSubStatus } : l)));
      success("Estado-plano actualizado");
    } catch { error("No pude actualizar el estado-plano"); }
  };

  const guardarLote = async (lote) => {
    try {
      if (modalLote.modo === "editar" && lote?.id) {
        const res = await updateLote(lote.id, lote);
        const updated = res?.data || lote;
        setLotsData((prev) => prev.map((l) => (l.id === lote.id ? updated : l)));
        success("Lote actualizado");
      } else {
        const res = await createLote(lote);
        const created = res?.data || lote;
        setLotsData((prev) => [...prev, created]);
        success("Lote creado");
      }
      cerrarModalGestion();
    } catch { error("No pude guardar el lote"); }
  };

  const eliminarLote = async (id) => {
    try {
      await deleteLote(id);
      setLotsData((prev) => prev.filter((l) => l.id !== id));
      cerrarModalGestion();
      success("Lote eliminado");
    } catch { error("No pude eliminar el lote"); }
  };

  return (
    <div className="min-vh-100 d-flex flex-column bg-white">
      <Sidebar />
      <div className="app-content" style={{ marginLeft: '64px' }}>
        <Header onUserClick={() => setShowUserModal(true)} />

        {/* Píldoras de módulos en modo CLARO (fondo blanco del layout) */}
        {/* DESACTIVADO: Se reemplazó por sidebar colapsable. Mantener código para referencia futura. */}
        {/* <div className="container py-2">
          <ModulePills variant="light" />
        </div> */}

        <Outlet
          context={{
            lots: filteredLots,
            allLots: lotsData,
            loadingLots,
            lotsError,
            handleStatusChange,
            handleSubStatusChange,
            handleViewDetail,
            abrirModalEditar,
            abrirModalEliminar,
            openSidePanel: handleOpenPanel,
            selectedLotId,
            showPanel,
          }}
        />
      </div>

      <LoteSidePanel
        show={showPanel}
        onHide={handleClosePanel}
        selectedLotId={selectedLotId}
        onViewDetail={handleViewDetail}
        lots={filteredLots}
        mapHighlight={mapHighlight}
        onLoteUpdated={(updatedLot) => {
          // Actualizar el estado del Layout cuando se edita un lote desde el SidePanel
          if (updatedLot?.id) {
            setLotsData((prev) => prev.map((l) => (l.id === updatedLot.id ? updatedLot : l)));
          }
        }}
      />

      <User show={showUserModal} onHide={() => setShowUserModal(false)} user={mockUser} />

      <LotInfo
        show={showLotInfo}
        onHide={() => setShowLotInfo(false)}
        selectedLotId={selectedLotId}
        lots={filteredLots}
        abrirModalEditar={abrirModalEditar}
        abrirModalEliminar={abrirModalEliminar}
      />

      <ModalGestionLote
        show={modalLote.show}
        modo={modalLote.modo}
        datosIniciales={modalLote.datosIniciales}
        onHide={cerrarModalGestion}
        onSave={guardarLote}
        onDelete={eliminarLote}
      />
    </div>
  );
}
