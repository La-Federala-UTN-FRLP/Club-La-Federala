// src/components/Mapa/LoteSidePanel.jsx
// Panel lateral rediseñado para el mapa interactivo
// - Estilo consistente con las tarjetas existentes (Registrar/Editar/Ver Lote)
// - Carrusel de imágenes
// - Mini-resumen compacto
// - Botones basados en roles usando RBAC

import { useMemo, useState, useEffect, useRef } from "react";
import { Offcanvas } from "react-bootstrap";
import { useAuth } from "../../app/providers/AuthProvider";
import { can, PERMISSIONS, userPermissions } from "../../lib/auth/rbac";
import { useNavigate } from "react-router-dom";
import { getLoteById } from "../../lib/api/lotes";
import { useToast } from "../../app/providers/ToastProvider";
import { getArchivosByLote, getFileSignedUrl } from "../../lib/api/archivos";
import SuccessAnimation from "../Cards/Base/SuccessAnimation.jsx";
import LoteImageCarousel from "./LoteImageCarousel";
import StatusBadge, { fmtEstadoLote } from "../Table/TablaLotes/cells/StatusBadge";
import SubstatusBadge from "../Table/TablaLotes/cells/SubstatusBadge";
import LoteEditarCard from "../Cards/Lotes/LoteEditarCard";
import ReservaCrearCard from "../Cards/Reservas/ReservaCrearCard";
import ReservaVerCard from "../Cards/Reservas/ReservaVerCard";
import VentaVerCard from "../Cards/Ventas/VentaVerCard";
import LoteVerCard from "../Cards/Lotes/LoteVerCard";
import { getAllReservas, getReservaById } from "../../lib/api/reservas";
import { getAllVentas, getVentaById } from "../../lib/api/ventas";
import { isLoteReservable } from "../../utils/loteStates";
import "../Cards/Base/cards.css";

// Helper para verificar si es inmobiliaria
const isInmobiliaria = (user) => {
  const perms = new Set(userPermissions(user));
  return perms.has(PERMISSIONS.RES_ACCESS) && !perms.has(PERMISSIONS.SALE_ACCESS);
};

// Helper para formatear valores
const safe = (v) => {
  if (v === null || v === undefined || (typeof v === "string" && v.trim().length === 0)) {
    return "Sin información";
  }
  return v;
};

const fmtMoney = (v) => {
  if (!v && v !== 0) return "Sin información";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  if (!isFinite(n)) return "Sin información";
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
};

const fmtSurface = (v) => {
  if (!v && v !== 0) return "Sin información";
  const n = Number(v);
  if (!isFinite(n)) return "Sin información";
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} m²`;
};

export default function LoteSidePanel({
  show,
  onHide,
  selectedLotId,
  onViewDetail,
  lots = [],
  onLoteUpdated,
  mapHighlight = null,
}) {
  // TODOS LOS HOOKS DEBEN IR AQUÍ, ANTES DE CUALQUIER RETURN CONDICIONAL
  const navigate = useNavigate();
  const authContext = useAuth();
  const user = authContext?.user || null;
  const { error: showError, info: showInfo } = useToast() || { error: () => {}, info: () => {} };

  // Estado para el lote completo cargado
  const [currentLot, setCurrentLot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [descripcionExpanded, setDescripcionExpanded] = useState(false);
  const [loteImages, setLoteImages] = useState([]);
  
  // Estado para metadata de prioridades/reservas/ventas
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  
  // Estados para controlar qué card se muestra
  const [showEditCard, setShowEditCard] = useState(false);
  const [showReserveCard, setShowReserveCard] = useState(false);
  const [showViewCard, setShowViewCard] = useState(false);
  const [showReservaVerCard, setShowReservaVerCard] = useState(false);
  const [showVentaVerCard, setShowVentaVerCard] = useState(false);
  
  // Estados para las reservas/ventas asociadas
  const [reservaAsociada, setReservaAsociada] = useState(null);
  const [ventaAsociada, setVentaAsociada] = useState(null);
  const [loadingReservaVenta, setLoadingReservaVenta] = useState(false);
  
  // Estados para animaciones de éxito
  const [showSuccessEdit, setShowSuccessEdit] = useState(false);
  const [showSuccessReserve, setShowSuccessReserve] = useState(false);

  // Lote mostrado y estado del panel "ahora", para que los handlers async detecten si siguen vigentes.
  const selectedLotIdRef = useRef(selectedLotId);
  const showRef = useRef(show);
  selectedLotIdRef.current = selectedLotId;
  showRef.current = show;
  const isPanelShowingLot = (lotId) =>
    showRef.current && String(selectedLotIdRef.current) === String(lotId);

  // Número de la última operación de handleReserve; cambiar de lote o cerrar el panel invalida la pendiente.
  const reserveOpSeq = useRef(0);

  // Cargar lote completo cuando se selecciona o se abre el panel
  useEffect(() => {
    reserveOpSeq.current++;
    setLoadingReservaVenta(false);

    if (!selectedLotId || !show) {
      setCurrentLot(null);
      setLoading(false);
      setDescripcionExpanded(false); // Resetear descripción cerrada
      // Cerrar cualquier card abierto cuando se cierra el panel
      setShowEditCard(false);
      setShowReserveCard(false);
      setShowViewCard(false);
      setShowReservaVerCard(false);
      setShowVentaVerCard(false);
      setReservaAsociada(null);
      setVentaAsociada(null);
      setLoadingReservaVenta(false);
      setShowSuccessEdit(false);
      setShowSuccessReserve(false);
      setLoteImages([]);
      return;
    }

    // Si el lote cambia, el panel se cierra o se desmonta, las respuestas pendientes no deben escribir estado.
    let active = true;

    const fetchLote = async () => {
      try {
        setLoading(true);
        const resp = await getLoteById(selectedLotId);
        if (!active) return;
        const lot = resp?.data ?? resp ?? null;
        setCurrentLot(lot);

        // Cargar imágenes del lote (misma lógica que en LoteVerCard)
        if (lot?.id) {
          try {
            const archivos = await getArchivosByLote(lot.id);
            if (!active) return;
            const imagenes = (archivos?.data ?? archivos ?? []).filter(
              (a) => ((a.tipo || "").toUpperCase() === "IMAGEN") && a.id
            );

            const obtenerSignedUrl = async (img) => {
              try {
                const signedUrl = await getFileSignedUrl(img.id);
                return typeof signedUrl === "string" && signedUrl.startsWith("http")
                  ? signedUrl
                  : signedUrl?.signedUrl && String(signedUrl.signedUrl).startsWith("http")
                  ? signedUrl.signedUrl
                  : null;
              } catch (e) {
                console.error("Error obteniendo URL firmada para imagen de lote:", img.id, e);
                return null;
              }
            };

            const urls = await Promise.all(imagenes.map(obtenerSignedUrl));
            if (!active) return;
            setLoteImages(urls.filter(Boolean));
          } catch (err) {
            if (!active) return;
            console.error("Error cargando imágenes del lote:", err);
            setLoteImages([]);
          }
        } else {
          setLoteImages([]);
        }
        
        // Buscar reserva/venta asociada si el lote está RESERVADO o VENDIDO
        if (lot) {
          const estadoUpper = String(lot.estado || lot.status || "").toUpperCase();
          
          if (estadoUpper === "RESERVADO") {
            try {
              const reservasResp = await getAllReservas({});
              if (!active) return;
              const allReservas = reservasResp?.data || reservasResp || [];
        const reservaActiva = allReservas.find(
          (r) => {
            const rLoteId = r.loteId || r.lote?.id || r.lotId || r.lot?.id;
            const estadoReserva = String(r.estado || "").toUpperCase();
            // Comparar IDs como números y strings para asegurar que coincidan
            const lotIdNum = Number(lot.id);
            const rLoteIdNum = Number(rLoteId);
            return (rLoteIdNum === lotIdNum || String(rLoteId) === String(lot.id)) && estadoReserva === "ACTIVA";
          }
        );
              // Cargar datos completos de la reserva si se encontró
              if (reservaActiva) {
                try {
                  const reservaCompleta = await getReservaById(reservaActiva.id || reservaActiva.idReserva);
                  if (!active) return;
                  const fullReserva = reservaCompleta?.data ?? reservaCompleta ?? reservaActiva;
                  setReservaAsociada(fullReserva);
                } catch (err) {
                  if (!active) return;
                  console.error("Error obteniendo reserva completa al cargar lote:", err);
                  setReservaAsociada(reservaActiva);
                }
              } else {
                setReservaAsociada(null);
              }
              setVentaAsociada(null);
            } catch (err) {
              if (!active) return;
              console.error("Error buscando reserva:", err);
              setReservaAsociada(null);
            }
          } else if (estadoUpper === "VENDIDO") {
            try {
              const ventasResp = await getAllVentas({});
              if (!active) return;
              const allVentas = ventasResp?.data || ventasResp || [];
              const ventaDelLote = allVentas.find(
                (v) => {
                  const vLoteId = v.loteId || v.lote?.id || v.lotId || v.lot?.id;
                  return vLoteId === lot.id;
                }
              );
              // Cargar datos completos de la venta si se encontró
              if (ventaDelLote) {
                try {
                  const ventaCompleta = await getVentaById(ventaDelLote.id);
                  if (!active) return;
                  const fullVenta = ventaCompleta?.data ?? ventaCompleta ?? ventaDelLote;
                  setVentaAsociada(fullVenta);
                } catch (err) {
                  if (!active) return;
                  console.error("Error obteniendo venta completa al cargar lote:", err);
                  setVentaAsociada(ventaDelLote);
                }
              } else {
                setVentaAsociada(null);
              }
              setReservaAsociada(null);
            } catch (err) {
              if (!active) return;
              console.error("Error buscando venta:", err);
              setVentaAsociada(null);
            }
          } else {
            setReservaAsociada(null);
            setVentaAsociada(null);
          }
        }
      } catch (err) {
        if (!active) return;
        console.error("Error obteniendo lote por id:", err);
        showError("No pude obtener el detalle del lote.");
        setCurrentLot(null);
        setReservaAsociada(null);
        setVentaAsociada(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchLote();
    return () => { active = false; };
  }, [selectedLotId, show, showError]);

  // Usar las imágenes cargadas desde getArchivosByLote, con fallback a las del lote
  const images = useMemo(() => {
    if (loteImages.length > 0) return loteImages;
    return currentLot ? (currentLot.images || currentLot.imagenes || []) : [];
  }, [loteImages, currentLot]);

  // Permisos basados en RBAC (manejar caso cuando user es null)
  const hasReservePermission = user ? can(user, PERMISSIONS.RES_CREATE) : false;
  const canEdit = user ? can(user, PERMISSIONS.LOT_EDIT) : false;
  const canViewDetail = user ? can(user, PERMISSIONS.LOT_VIEW) : false;

  // Verificar si es inmobiliaria
  const isInmo = user ? isInmobiliaria(user) : false;

  // Computar acciones disponibles - ESTE USEMEMO DEBE EJECUTARSE SIEMPRE
  const availableActions = useMemo(() => {
    if (isInmo) {
      return {
        reserve: hasReservePermission,
        edit: false,
        viewDetail: canViewDetail,
      };
    }
    return {
      reserve: hasReservePermission,
      edit: canEdit,
      viewDetail: canViewDetail,
    };
  }, [isInmo, hasReservePermission, canEdit, canViewDetail]);

  // Obtener datos formateados (con valores por defecto si currentLot es null)
  const estadoRaw = currentLot ? (currentLot.estado || currentLot.status || "") : "";
  const subEstadoRaw = currentLot ? (currentLot.subestado || currentLot.subStatus || "") : "";
  
  // Obtener número de fracción (similar a LoteVerCard)
  const fraccionNumero = useMemo(() => {
    if (!currentLot) return null;
    return (
      currentLot?.fraccion?.numero ??
      currentLot?.fraccionNumero ??
      currentLot?.fraccionId ??
      (typeof currentLot?.fraccion === "number" ? currentLot.fraccion : null)
    );
  }, [currentLot]);

  // Determinar el estado del lote y la lógica del botón de reserva
  const estadoLote = useMemo(() => {
    if (!currentLot) return null;
    return String(currentLot.estado || currentLot.status || "").toUpperCase();
  }, [currentLot]);

  // Determinar si el botón debe estar deshabilitado
  const isReserveButtonDisabled = useMemo(() => {
    if (!currentLot) return true;
    const estado = estadoLote;
    // Accionable solo si hay una acción válida: reservar, ver reserva o ver venta
    return !(isLoteReservable(estado) || estado === "RESERVADO" || estado === "VENDIDO");
  }, [currentLot, estadoLote]);

  // Obtener metadata de prioridades/reservas/ventas para el lote actual
  const loteMetadata = useMemo(() => {
    if (!mapHighlight || !currentLot?.id) return null;
    
    const metaByLoteId = mapHighlight.metaByLoteId || {};
    const source = mapHighlight.source;
    
    // Buscar metadata por el ID del lote actual
    const metadata = metaByLoteId[currentLot.id];
    
    if (!metadata || (Array.isArray(metadata) && metadata.length === 0)) {
      return null;
    }
    
    // Retornar array completo con source
    const items = Array.isArray(metadata) ? metadata : [metadata];
    
    return { items, source, count: items.length };
  }, [mapHighlight, currentLot]);

  // Texto del botón según el estado
  const reserveButtonText = useMemo(() => {
    if (!currentLot) return "Reservar";
    const estado = estadoLote;
    if (estado === "RESERVADO") return "Ver Reserva";
    if (estado === "VENDIDO") return "Ver Venta";
    return "Reservar";
  }, [currentLot, estadoLote]);

  // Handlers - deben ejecutarse siempre pero solo funcionarán si currentLot existe
  const handleReserve = async () => {
    if (!currentLot || isReserveButtonDisabled) return;
    const estado = estadoLote;
    const lotId = currentLot.id;
    const seq = ++reserveOpSeq.current;
    // La operación deja de ser vigente si cambió el lote, se cerró el panel o arrancó otra operación.
    const isStale = () => seq !== reserveOpSeq.current || !isPanelShowingLot(lotId);

    if (estado === "RESERVADO") {
      // Si ya tenemos la reserva, abrir el card
      if (reservaAsociada) {
        setShowReservaVerCard(true);
        return;
      }
      
      // Si no la tenemos, buscarla ahora con loading
      setLoadingReservaVenta(true);
      try {
        const reservasResp = await getAllReservas({});
        if (isStale()) return;
        const allReservas = reservasResp?.data || reservasResp || [];
        const reservaActiva = allReservas.find(
          (r) => {
            const rLoteId = r.loteId || r.lote?.id || r.lotId || r.lot?.id;
            const estadoReserva = String(r.estado || "").toUpperCase();
            // Comparar IDs como números y strings para asegurar que coincidan
            const lotIdNum = Number(lotId);
            const rLoteIdNum = Number(rLoteId);
            return (rLoteIdNum === lotIdNum || String(rLoteId) === String(lotId)) && estadoReserva === "ACTIVA";
          }
        );

        if (reservaActiva) {
          // Cargar datos completos de la reserva usando getReservaById
          try {
            const reservaCompleta = await getReservaById(reservaActiva.id || reservaActiva.idReserva);
            if (isStale()) return;
            const fullReserva = reservaCompleta?.data ?? reservaCompleta ?? reservaActiva;
            setReservaAsociada(fullReserva);
            setShowReservaVerCard(true);
          } catch (err) {
            if (isStale()) return;
            console.error("Error obteniendo reserva completa:", err);
            // Si falla, usar la reserva encontrada como fallback
            setReservaAsociada(reservaActiva);
            setShowReservaVerCard(true);
          }
        } else {
          console.warn("No se encontró reserva activa para el lote", lotId);
          showError("No se encontró la reserva activa para este lote.");
        }
      } catch (err) {
        if (isStale()) return;
        console.error("Error buscando reserva:", err);
        showError("Error al buscar la reserva del lote.");
      } finally {
        // Una operación vieja no debe pisar el loading de una más nueva.
        if (seq === reserveOpSeq.current) setLoadingReservaVenta(false);
      }
    } else if (estado === "VENDIDO") {
      // Si ya tenemos la venta, abrir el card
      if (ventaAsociada) {
        setShowVentaVerCard(true);
        return;
      }
      
      // Si no la tenemos, buscarla ahora con loading
      setLoadingReservaVenta(true);
      try {
        const ventasResp = await getAllVentas({});
        if (isStale()) return;
        const allVentas = ventasResp?.data || ventasResp || [];
        const ventaDelLote = allVentas.find(
          (v) => {
            const vLoteId = v.loteId || v.lote?.id || v.lotId || v.lot?.id;
            const lotIdNum = Number(lotId);
            const vLoteIdNum = Number(vLoteId);
            return (vLoteIdNum === lotIdNum || String(vLoteId) === String(lotId));
          }
        );

        if (ventaDelLote) {
          // Cargar datos completos de la venta usando getVentaById
          try {
            const ventaCompleta = await getVentaById(ventaDelLote.id);
            if (isStale()) return;
            const fullVenta = ventaCompleta?.data ?? ventaCompleta ?? ventaDelLote;
            setVentaAsociada(fullVenta);
            setShowVentaVerCard(true);
          } catch (err) {
            if (isStale()) return;
            console.error("Error obteniendo venta completa:", err);
            // Si falla, usar la venta encontrada como fallback
            setVentaAsociada(ventaDelLote);
            setShowVentaVerCard(true);
          }
        } else {
          console.warn("No se encontró venta para el lote", lotId);
          showError("No se encontró la venta para este lote.");
        }
      } catch (err) {
        if (isStale()) return;
        console.error("Error buscando venta:", err);
        showError("Error al buscar la venta del lote.");
      } finally {
        if (seq === reserveOpSeq.current) setLoadingReservaVenta(false);
      }
    } else if (isLoteReservable(estado)) {
      setShowReserveCard(true);
    }
  };

  const handleEdit = () => {
    if (!currentLot) return;
    setShowEditCard(true);
  };

  const handleViewDetail = () => {
    if (!currentLot) return;
    setShowViewCard(true);
  };
  
  // Handlers para cerrar los cards y volver al SidePanel
  const handleCloseEditCard = () => {
    setShowEditCard(false);
  };
  
  const handleCloseReserveCard = () => {
    setShowReserveCard(false);
  };
  
  const handleCloseViewCard = () => {
    setShowViewCard(false);
  };
  
  const handleCloseReservaVerCard = () => {
    setShowReservaVerCard(false);
  };
  
  const handleCloseVentaVerCard = () => {
    setShowVentaVerCard(false);
  };
  
  // Handler para cuando se guarda/crea algo en los cards
  const handleEditSaved = (updatedLot) => {
    if (updatedLot) {
      setCurrentLot(updatedLot);
      // Notificar al Layout para que actualice el estado
      if (typeof onLoteUpdated === "function") {
        onLoteUpdated(updatedLot);
      }
    }
    setShowEditCard(false);
    // Mostrar animación de éxito
    setShowSuccessEdit(true);
    setTimeout(() => {
      setShowSuccessEdit(false);
    }, 1500);
  };
  
  const handleReserveCreated = () => {
    // La reserva ya fue creada: cerrar la card y mostrar éxito pase lo que pase con la sincronización
    setShowReserveCard(false);
    setShowSuccessReserve(true);
    setTimeout(() => {
      setShowSuccessReserve(false);
    }, 1500);

    if (!selectedLotId) return;
    const lotId = selectedLotId;

    const syncFailed = () =>
      showInfo("La reserva se creó, pero no se pudo actualizar la vista. Recargá para ver el estado actual.");

    // Refrescar el lote local y notificar al Layout para que el mapa refleje el nuevo estado
    getLoteById(lotId)
      .then((resp) => {
        const lot = resp?.data ?? resp ?? null;
        if (!lot) {
          syncFailed();
          return;
        }
        // Estado local: solo si el panel sigue mostrando ese lote.
        if (isPanelShowingLot(lotId)) setCurrentLot(lot);
        // Estado global del mapa: el lote actualizado es válido aunque el usuario ya haya cambiado de lote.
        if (typeof onLoteUpdated === "function") {
          onLoteUpdated(lot);
        }
      })
      .catch((err) => {
        console.error("Error sincronizando lote tras crear reserva:", err);
        syncFailed();
      });
  };

  // AHORA SÍ, después de todos los hooks, verificar si debemos renderizar
  if (!show) return null;

  return (
    <>
      {/* Backdrop personalizado que oscurece el fondo pero no cierra el panel */}
      {show && (
        <div
          className="lote-side-panel-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            zIndex: 1040,
            pointerEvents: "none", // No intercepta clicks, solo oscurece
            animation: "fadeIn 0.3s ease-in",
          }}
        />
      )}

      <SuccessAnimation show={showSuccessEdit} message="¡Lote guardado exitosamente!" />
      <SuccessAnimation show={showSuccessReserve} message="¡Reserva creada exitosamente!" />

      <style>{`
        .lote-side-panel.offcanvas {
          border-left: 1px solid rgba(0,0,0,.08);
          border-top-left-radius: 8px;
          border-bottom-left-radius: 8px;
          border-top-right-radius: 0;
          border-bottom-right-radius: 0;
        }
        .lote-side-panel .offcanvas-header {
          background: #eaf3ed;
          border-bottom: 1px solid rgba(0,0,0,.06);
          padding: 18px 20px 16px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .lote-side-panel .offcanvas-body {
          padding: 22px 26px 26px;
          overflow-y: auto;
        }
        
        /* Animaciones modernas para la entrada del panel */
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        
        @keyframes fadeInUp {
          from {
            transform: translateY(12px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        /* Aplicar animación cuando el panel se muestra */
        .lote-side-panel.offcanvas.showing {
          animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        .lote-side-panel.offcanvas.show:not(.hiding) {
          animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        /* Animación para el backdrop */
        .offcanvas-backdrop.showing {
          transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        /* Animación escalonada para el contenido interno cuando el panel está visible */
        .lote-side-panel.offcanvas.show .offcanvas-header {
          animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
        }
        
        .lote-side-panel.offcanvas.show .offcanvas-body > * {
          animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.25s both;
        }
        
        .lote-side-panel.offcanvas.show .offcanvas-body > *:nth-child(2) {
          animation-delay: 0.3s;
        }
        
        .lote-side-panel.offcanvas.show .offcanvas-body > *:nth-child(3) {
          animation-delay: 0.35s;
        }
        
        .lote-side-panel.offcanvas.show .offcanvas-body > *:nth-child(4) {
          animation-delay: 0.4s;
        }
        .lote-side-panel__header-wrapper {
          flex: 1;
          min-width: 0;
        }
        .lote-side-panel__header-title {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
        }
        .lote-side-panel.offcanvas .offcanvas-header .cclf-btn-close {
          width: 29px !important;
          height: 29px !important;
          min-width: 28px !important;
          min-height: 28px !important;
          flex-shrink: 0;
          padding: 0;
          display: grid !important;
          place-items: center !important;
        }
        .lote-side-panel.offcanvas .offcanvas-header .cclf-btn-close__x {
          font-size: 22px !important;
          line-height: 1;
          padding-bottom: 0.5
          margin: 0;
          transform: translateY(-1px) !important;
        }
        .lote-side-panel__mini-summary {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 20px;
        }
        .lote-side-panel__field {
          background: #fff;
          border: 1px solid rgba(0,0,0,.18);
          border-radius: 8px;
          padding: 10px 12px;
          box-shadow: 0 2px 4px rgba(0,0,0,.10);
        }
        .lote-side-panel__field-label {
          font-size: 11px;
          font-weight: 700;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        .lote-side-panel__field-value {
          font-size: 14px;
          font-weight: 600;
          color: #111;
        }
        .lote-side-panel__field--full {
          grid-column: span 2;
        }
        .lote-side-panel__descripcion {
          margin-top: 18px;
          border: 1px solid rgba(0,0,0,.18);
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 2px 4px rgba(0,0,0,.10);
        }
        .lote-side-panel__descripcion-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 12px;
          cursor: pointer;
          user-select: none;
          transition: background-color 0.12s ease;
        }
        .lote-side-panel__descripcion-header:hover {
          background-color: #f9fafb;
        }
        .lote-side-panel__descripcion-label {
          font-size: 14px;
          font-weight: 500;
          color: #111;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        .lote-side-panel__descripcion-icon {
          font-size: 18px;
          color: #000;
          transition: transform 0.2s ease;
          opacity: 0.8;
          font-weight: normal;
        }
        .lote-side-panel__descripcion-icon.expanded {
          transform: rotate(180deg);
        }
        .lote-side-panel__descripcion-content {
          padding: 0 12px 12px;
          font-size: 14px;
          color: #111;
          line-height: 1.5;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .lote-side-panel__metadata-header {
          background-color: #f0f9ff;
        }
        .lote-side-panel__metadata-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
          font-size: 13px;
        }
        .lote-side-panel__metadata-item {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 8px 16px;
        }
        .lote-side-panel__metadata-item--separated {
          padding-bottom: 16px;
          border-bottom: 1px solid #e5e7eb;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .lote-side-panel__footer {
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .lote-side-panel__footer-row {
          display: flex;
          gap: 12px;
        }
        .lote-side-panel__footer .cclf-tab.thin {
          padding: 8px 24px;
          border: 1px solid rgba(0,0,0,.85);
          border-radius: 6px;
          background: #EBB648;
          font-weight: 500;
          cursor: pointer;
          transition: 200ms ease;
        }
        .lote-side-panel__footer .cclf-tab.thin:hover {
          background: #cb9828;
          transform: translateY(-1px);
        }
        .lote-side-panel__footer .cclf-tab.thin.reserve {
          background: #0b8b67;
          border-color: #0b8b67;
          color: #fff;
        }
        .lote-side-panel__footer .cclf-tab.thin.reserve:hover:not(:disabled) {
          filter: brightness(1.08);
        }
        .lote-side-panel__footer .cclf-tab.thin.reserve:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          pointer-events: none;
        }
      `}</style>

      <Offcanvas
        show={show}
        onHide={() => {}} // Prevenir cierre al hacer click fuera
        placement="end"
        className="lote-side-panel"
        backdrop={false} // No mostrar backdrop para evitar clicks fuera
        style={{
          width: "420px",
          boxShadow: "0 18px 42px rgba(0,0,0,.20)",
          zIndex: 1045,
        }}
      >
        <Offcanvas.Header>
          <div className="lote-side-panel__header-wrapper">
            <Offcanvas.Title 
              as="h2" 
              className="lote-side-panel__header-title"
              id="lote-side-panel-title"
            >
              {loading ? (
                "Cargando..."
              ) : currentLot ? (
                <>
                  Lote N° {safe(currentLot?.numero)}
                  {fraccionNumero != null && ` - Fracción ${fraccionNumero}`}
                </>
              ) : (
                "Lote"
              )}
            </Offcanvas.Title>
          </div>
          <button
            type="button"
            className="cclf-btn-close"
            onClick={onHide}
            aria-label="Cerrar panel lateral"
            aria-describedby="lote-side-panel-title"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onHide();
              }
            }}
          >
            <span className="cclf-btn-close__x" aria-hidden="true">×</span>
          </button>
        </Offcanvas.Header>

        <Offcanvas.Body>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#6b7280" }}>
              Cargando información del lote...
            </div>
          ) : !currentLot ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#6b7280" }}>
              No se pudo cargar la información del lote.
            </div>
          ) : (
            <>
              {/* Carrusel de imágenes */}
              <div style={{ marginBottom: "24px" }}>
                <LoteImageCarousel images={images} />
              </div>

              {/* Mini-resumen */}
              <div className="lote-side-panel__mini-summary">
            <div className="lote-side-panel__field">
              <div className="lote-side-panel__field-label">Estado</div>
              <div className="lote-side-panel__field-value">
                {estadoRaw && estadoRaw.trim() !== "" ? (
                  <StatusBadge value={estadoRaw} />
                ) : (
                  fmtEstadoLote(estadoRaw)
                )}
              </div>
            </div>

            {subEstadoRaw && (
              <div className="lote-side-panel__field">
                <div className="lote-side-panel__field-label">Sub-estado</div>
                <div className="lote-side-panel__field-value">
                  {subEstadoRaw && subEstadoRaw.trim() !== "" ? (
                    <SubstatusBadge value={subEstadoRaw} />
                  ) : (
                    fmtEstadoLote(subEstadoRaw)
                  )}
                </div>
              </div>
            )}

                {(currentLot.superficie || currentLot.surface) && (
                  <div className="lote-side-panel__field">
                    <div className="lote-side-panel__field-label">Superficie</div>
                    <div className="lote-side-panel__field-value">
                      {fmtSurface(currentLot.superficie || currentLot.surface)}
                    </div>
                  </div>
                )}

                {(currentLot.precio || currentLot.price) && (
                  <div className="lote-side-panel__field">
                    <div className="lote-side-panel__field-label">Precio</div>
                    <div className="lote-side-panel__field-value">
                      {fmtMoney(currentLot.precio || currentLot.price)}
                    </div>
                  </div>
                )}

                {/* Indicador visual de deuda */}
                {currentLot.deuda && (
                  <div className="lote-side-panel__field" style={{ position: "relative" }}>
                    <div className="lote-side-panel__field-label">Deuda</div>
                    <div className="lote-side-panel__field-value" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "#dc2626", fontWeight: 700 }}>Sí</span>
                      <span style={{ 
                        display: "inline-flex", 
                        alignItems: "center", 
                        justifyContent: "center",
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        backgroundColor: "#fee2e2",
                        color: "#dc2626",
                        fontSize: "12px",
                        fontWeight: 700
                      }}>!</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Descripción desplegable */}
              {currentLot?.descripcion && (
                <div className="lote-side-panel__descripcion">
                  <div
                    className="lote-side-panel__descripcion-header"
                    id="descripcion-header"
                    onClick={() => setDescripcionExpanded(!descripcionExpanded)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={descripcionExpanded}
                    aria-label={descripcionExpanded ? "Ocultar descripción" : "Mostrar descripción"}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDescripcionExpanded(!descripcionExpanded);
                      }
                    }}
                  >
                    <div className="lote-side-panel__descripcion-label">Descripción</div>
                    <span
                      className={`lote-side-panel__descripcion-icon ${descripcionExpanded ? "expanded" : ""}`}
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </div>
                  {descripcionExpanded && (
                    <div 
                      className="lote-side-panel__descripcion-content"
                      role="region"
                      aria-labelledby="descripcion-header"
                    >
                      {safe(currentLot.descripcion)}
                    </div>
                  )}
                </div>
              )}

              {/* Sección de metadata de prioridades/reservas/ventas */}
              {loteMetadata && (
                <div className="lote-side-panel__descripcion" style={{ marginTop: "18px" }}>
                  <div
                    className="lote-side-panel__descripcion-header lote-side-panel__metadata-header"
                    id="metadata-header"
                    onClick={() => setMetadataExpanded(!metadataExpanded)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={metadataExpanded}
                    aria-label={metadataExpanded ? `Ocultar información de ${loteMetadata.source}` : `Mostrar información de ${loteMetadata.source}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setMetadataExpanded(!metadataExpanded);
                      }
                    }}
                  >
                    <div className="lote-side-panel__descripcion-label">
                      {loteMetadata.source === "prioridades" && (loteMetadata.count > 1 ? `Prioridades Seleccionadas (${loteMetadata.count})` : "Prioridad Seleccionada")}
                      {loteMetadata.source === "reservas" && (loteMetadata.count > 1 ? `Reservas Seleccionadas (${loteMetadata.count})` : "Reserva Seleccionada")}
                      {loteMetadata.source === "ventas" && (loteMetadata.count > 1 ? `Ventas Seleccionadas (${loteMetadata.count})` : "Venta Seleccionada")}
                    </div>
                    <span
                      className={`lote-side-panel__descripcion-icon ${metadataExpanded ? "expanded" : ""}`}
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </div>
                  {metadataExpanded && (
                    <div 
                      className="lote-side-panel__descripcion-content lote-side-panel__metadata-list"
                      role="region"
                      aria-labelledby="metadata-header"
                    >
                      {loteMetadata.items.map((item, index) => (
                        <div 
                          key={index}
                          className={`lote-side-panel__metadata-item ${index < loteMetadata.items.length - 1 ? "lote-side-panel__metadata-item--separated" : ""}`}
                        >
                          {loteMetadata.source === "prioridades" && (
                            <>
                              {item.numero && (
                                <>
                                  <strong>N° Prioridad:</strong>
                                  <span>{item.numero}</span>
                                </>
                              )}
                              {item.estado && (
                                <>
                                  <strong>Estado:</strong>
                                  <span>{item.estado}</span>
                                </>
                              )}
                              {item.inmobiliaria && (
                                <>
                                  <strong>Inmobiliaria:</strong>
                                  <span>{item.inmobiliaria}</span>
                                </>
                              )}
                              {item.fechaInicio && (
                                <>
                                  <strong>Inicio:</strong>
                                  <span>{new Date(item.fechaInicio).toLocaleDateString()}</span>
                                </>
                              )}
                              {item.fechaFin && (
                                <>
                                  <strong>Vence:</strong>
                                  <span>{new Date(item.fechaFin).toLocaleDateString()}</span>
                                </>
                              )}
                            </>
                          )}
                          {loteMetadata.source === "reservas" && (
                            <>
                              {item.numero && (
                                <>
                                  <strong>N° Reserva:</strong>
                                  <span>{item.numero}</span>
                                </>
                              )}
                              {item.estado && (
                                <>
                                  <strong>Estado:</strong>
                                  <span>{item.estado}</span>
                                </>
                              )}
                              {item.cliente && (
                                <>
                                  <strong>Cliente:</strong>
                                  <span>{item.cliente}</span>
                                </>
                              )}
                              {item.inmobiliaria && (
                                <>
                                  <strong>Inmobiliaria:</strong>
                                  <span>{item.inmobiliaria}</span>
                                </>
                              )}
                              {item.montoSeña && (
                                <>
                                  <strong>Seña:</strong>
                                  <span>{fmtMoney(item.montoSeña)}</span>
                                </>
                              )}
                            </>
                          )}
                          {loteMetadata.source === "ventas" && (
                            <>
                              {item.numero && (
                                <>
                                  <strong>N° Venta:</strong>
                                  <span>{item.numero}</span>
                                </>
                              )}
                              {item.estado && (
                                <>
                                  <strong>Estado:</strong>
                                  <span>{item.estado}</span>
                                </>
                              )}
                              {/* Etapa 4: soporta compradores[] (múltiples) y comprador (legacy string) */}
                              {(item.compradores?.length > 0 || item.comprador) && (
                                <>
                                  <strong>Comprador{item.compradores?.length > 1 ? 'es' : ''}:</strong>
                                  <span>
                                    {item.compradores?.length > 0
                                      ? (() => {
                                          const c0 = item.compradores[0];
                                          const primero = [c0.nombre, c0.apellido].filter(Boolean).join(' ')
                                            || c0.razonSocial
                                            || `Persona ${c0.id}`;
                                          return item.compradores.length > 1
                                            ? `${primero} (+${item.compradores.length - 1})`
                                            : primero;
                                        })()
                                      : item.comprador}
                                  </span>
                                </>
                              )}
                              {item.inmobiliaria && (
                                <>
                                  <strong>Inmobiliaria:</strong>
                                  <span>{item.inmobiliaria}</span>
                                </>
                              )}
                              {item.montoTotal && (
                                <>
                                  <strong>Monto Total:</strong>
                                  <span>{fmtMoney(item.montoTotal)}</span>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Botones de acción en el footer según roles */}
              <div className="lote-side-panel__footer">
                {isInmo ? (
                  <>
                    {/* Inmobiliarias: Reservar (verde) + Ver Detalle Completo (amarillo) - ambos full-width */}
                    {availableActions.reserve && (
                      <button
                        type="button"
                        className="cclf-tab thin reserve"
                        onClick={handleReserve}
                        disabled={isReserveButtonDisabled || loadingReservaVenta}
                        aria-label={loadingReservaVenta ? "Cargando..." : reserveButtonText}
                        aria-disabled={isReserveButtonDisabled || loadingReservaVenta}
                        style={{ 
                          width: "100%",
                          opacity: isReserveButtonDisabled ? 0.5 : 1,
                          cursor: (isReserveButtonDisabled || loadingReservaVenta) ? "not-allowed" : "pointer",
                          position: "relative"
                        }}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && !isReserveButtonDisabled && !loadingReservaVenta) {
                            e.preventDefault();
                            handleReserve();
                          }
                        }}
                      >
                        {loadingReservaVenta ? (
                          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                            <span style={{
                              display: "inline-block",
                              width: "14px",
                              height: "14px",
                              border: "2px solid currentColor",
                              borderTopColor: "transparent",
                              borderRadius: "50%",
                              animation: "spin 0.6s linear infinite"
                            }}></span>
                            Cargando...
                          </span>
                        ) : (
                          reserveButtonText
                        )}
                      </button>
                    )}
                    {availableActions.viewDetail && (
                      <button
                        type="button"
                        className="cclf-tab thin"
                        onClick={handleViewDetail}
                        style={{ width: "100%" }}
                      >
                        Ver Detalle Completo
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {/* Admin y Gestor: Editar + Reservar lado a lado, luego Ver Detalle full-width */}
                    {/* Técnicos: Solo Editar + Ver Detalle */}
                    <div className="lote-side-panel__footer-row">
                      {availableActions.edit && (
                        <button
                          type="button"
                          className="cclf-tab thin"
                          onClick={handleEdit}
                          aria-label="Editar información del lote"
                          style={{ flex: 1 }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleEdit();
                            }
                          }}
                        >
                          Editar lote
                        </button>
                      )}
                      {availableActions.reserve && (
                        <button
                          type="button"
                          className="cclf-tab thin reserve"
                          onClick={handleReserve}
                          disabled={isReserveButtonDisabled || loadingReservaVenta}
                          aria-label={loadingReservaVenta ? "Cargando..." : reserveButtonText}
                          aria-disabled={isReserveButtonDisabled || loadingReservaVenta}
                          style={{ 
                            flex: 1,
                            opacity: isReserveButtonDisabled ? 0.5 : 1,
                            cursor: (isReserveButtonDisabled || loadingReservaVenta) ? "not-allowed" : "pointer",
                            position: "relative"
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && !isReserveButtonDisabled && !loadingReservaVenta) {
                              e.preventDefault();
                              handleReserve();
                            }
                          }}
                        >
                          {loadingReservaVenta ? (
                            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                              <span style={{
                                display: "inline-block",
                                width: "14px",
                                height: "14px",
                                border: "2px solid currentColor",
                                borderTopColor: "transparent",
                                borderRadius: "50%",
                                animation: "spin 0.6s linear infinite"
                              }}></span>
                              Cargando...
                            </span>
                          ) : (
                            reserveButtonText
                          )}
                        </button>
                      )}
                    </div>
                    {availableActions.viewDetail && (
                      <button
                        type="button"
                        className="cclf-tab thin"
                        onClick={handleViewDetail}
                        style={{ width: "100%" }}
                      >
                        Ver Detalle Completo
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </Offcanvas.Body>
      </Offcanvas>

      {/* Cards como overlay encima del SidePanel */}
      {showEditCard && currentLot && (
        <LoteEditarCard
          open={showEditCard}
          lote={currentLot}
          loteId={currentLot.id}
          lotes={[currentLot]}
          onCancel={handleCloseEditCard}
          onSaved={handleEditSaved}
          fromSidePanel={true}
        />
      )}

      {showReserveCard && currentLot && (
        <ReservaCrearCard
          open={showReserveCard}
          onCancel={handleCloseReserveCard}
          onCreated={handleReserveCreated}
          loteIdPreSeleccionado={currentLot.id}
          entityType="Reserva"
          fromSidePanel={true}
        />
      )}

      {showViewCard && currentLot && (
        <LoteVerCard
          open={showViewCard}
          onClose={handleCloseViewCard}
          onEdit={(lot) => {
            setShowViewCard(false);
            setShowEditCard(true);
          }}
          onReserve={(lot) => {
            setShowViewCard(false);
            setShowReserveCard(true);
          }}
          onOpenDocument={onViewDetail}
          onUpdated={(updatedLot) => {
            if (updatedLot) {
              setCurrentLot(updatedLot);
            }
          }}
          lote={currentLot}
          loteId={currentLot.id}
          lotes={[currentLot]}
          fromSidePanel={true}
        />
      )}

      {showReservaVerCard && reservaAsociada && (
        <ReservaVerCard
          open={showReservaVerCard}
          onClose={handleCloseReservaVerCard}
          reserva={reservaAsociada}
          reservaId={reservaAsociada.id || reservaAsociada.idReserva}
          reservas={reservaAsociada ? [reservaAsociada] : []}
          fromSidePanel={true}
        />
      )}

      {showVentaVerCard && ventaAsociada && (
        <VentaVerCard
          open={showVentaVerCard}
          onClose={handleCloseVentaVerCard}
          venta={ventaAsociada}
          ventaId={ventaAsociada.id}
          ventas={[ventaAsociada]}
          fromSidePanel={true}
        />
      )}
    </>
  );
}

