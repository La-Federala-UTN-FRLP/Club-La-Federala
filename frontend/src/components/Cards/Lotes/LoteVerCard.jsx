import { useEffect, useMemo, useState } from "react";
import "../Base/cards.css";
import LoteEditarCard from "./LoteEditarCard.jsx";
import DocumentoVerCard from "../Documentos/DocumentoVerCard.jsx";
import NiceSelect from "../../Base/NiceSelect.jsx";
import { getArchivosByLote, getFileSignedUrl } from "../../../lib/api/archivos.js";
import { getAllReservas } from "../../../lib/api/reservas.js";
import { getLoteById } from "../../../lib/api/lotes.js";
import { useAuth } from "../../../app/providers/AuthProvider.jsx";
import { ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import { getLoteIdFormatted } from "../../Table/TablaLotes/utils/getters.js";
import { isLoteReservable } from "../../../utils/loteStates.js";

const ESTADOS_LOTE = [
  { value: "DISPONIBLE", label: "Disponible" },
  { value: "RESERVADO", label: "Reservado" },
  { value: "VENDIDO", label: "Vendido" },
  { value: "NO_DISPONIBLE", label: "No Disponible" },
  { value: "ALQUILADO", label: "Alquilado" },
  { value: "EN_PROMOCION", label: "En Promoción" },
];

const SUBESTADOS_LOTE = [
  { value: "NO_CONSTRUIDO", label: "No Construido" },
  { value: "EN_CONSTRUCCION", label: "En Construcción" },
  { value: "CONSTRUIDO", label: "Construido" },
];


/**
 * LoteVerCard
 * - Overlay con tarjeta de dos columnas: detalle del lote + carrusel/documentos.
 * - Alinea las etiquetas calculando un ancho único según el label más largo.
 * - Expone botones de cabecera (Editar / Reservar) y tres botones inferiores para documentos.
 */
const DOC_TIPOS = [
  { label: "Escritura", type: "ESCRITURA" },
  { label: "Boleto CompraVenta", type: "BOLETO" },
  { label: "Planos", type: "PLANOS" },
];

export default function LoteVerCard({
  open,
  onClose,
  onEdit,
  onReserve,
  onUpdated,
  lote,
  loteId,
  lotes,
}) {
  const { user } = useAuth();
  const resolvedLot = useMemo(() => {
    if (lote) return lote;
    if (loteId != null && Array.isArray(lotes)) {
      return lotes.find((l) => `${l.id}` === `${loteId}`) || null;
    }
    return null;
  }, [lote, loteId, lotes]);

  const [currentLot, setCurrentLot] = useState(resolvedLot);
  const [editOpen, setEditOpen] = useState(false);
  const [reservaActiva, setReservaActiva] = useState(null);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docTipoSeleccionado, setDocTipoSeleccionado] = useState(null);

  useEffect(() => {
    setCurrentLot(resolvedLot);
  }, [resolvedLot]);

  // Cargar datos completos con relaciones (propietario, ubicacion) cuando se abre el card
  useEffect(() => {
    let abort = false;
    async function loadCompleteData() {
      if (!open) return;

      const idToUse = currentLot?.id ?? resolvedLot?.id;
      if (!idToUse) return;

      // Verificar si ya tenemos las relaciones necesarias (objeto completo con nombre/calle)
      const hasPropietario = currentLot?.propietario && typeof currentLot.propietario === 'object' && (currentLot.propietario.nombre || currentLot.propietario.apellido);
      const hasUbicacion = currentLot?.ubicacion && typeof currentLot.ubicacion === 'object' && currentLot.ubicacion.calle;
      const hasInquilino = currentLot?.inquilino && typeof currentLot.inquilino === 'object' && (currentLot.inquilino.nombre || currentLot.inquilino.apellido || currentLot.inquilino.razonSocial);

      // Si ya tenemos los datos completos, no hacer la llamada
      // Si el lote tiene ocupación ALQUILADO o alquilerActivo, también necesitamos verificar inquilino
      const needsInquilino = currentLot?.ocupacion === 'ALQUILADO' || currentLot?.alquilerActivo || currentLot?.alquiler === true;
      if (hasPropietario && hasUbicacion && (!needsInquilino || hasInquilino)) return;

      try {
        const response = await getLoteById(idToUse);
        const full = response?.data ?? response;
        if (!abort && full) {
          setCurrentLot((prev) => ({
            ...prev,
            ...full,
            // Preservar mapId si está disponible
            mapId: full.mapId ?? prev?.mapId ?? null,
            // Asegurar que las relaciones estén presentes
            propietario: full.propietario ?? prev?.propietario ?? null,
            ubicacion: full.ubicacion ?? prev?.ubicacion ?? null,
          }));
        }
      } catch (e) {
        console.error("Error obteniendo lote por id:", e);
        // Si falla, mantener los datos que ya tenemos
      }
    }
    loadCompleteData();
    return () => { abort = true; };
  }, [open, currentLot?.id, resolvedLot?.id]);

  // Cargar reserva activa si el lote está reservado
  useEffect(() => {
    if (!open || !currentLot?.id) {
      setReservaActiva(null);
      return;
    }

    const estadoUpper = String(currentLot?.estado || "").toUpperCase();
    if (estadoUpper === "RESERVADO") {
      (async () => {
        try {
          const reservasResp = await getAllReservas({});
          const allReservas = reservasResp?.data?.reservas ?? reservasResp?.data ?? [];
          const reserva = allReservas.find(
            (r) => {
              const rLoteId = r.loteId || r.lote?.id || r.lotId || r.lot?.id;
              const estadoReserva = String(r.estado || "").toUpperCase();
              return (rLoteId === currentLot.id || String(rLoteId) === String(currentLot.id)) && estadoReserva === "ACTIVA";
            }
          );
          setReservaActiva(reserva || null);
        } catch (err) {
          console.error("Error cargando reserva activa:", err);
          setReservaActiva(null);
        }
      })();
    } else {
      setReservaActiva(null);
    }
  }, [open, currentLot?.id, currentLot?.estado]);

  useEffect(() => {
    if (!open) {
      setEditOpen(false);
      setDocModalOpen(false);
      setDocTipoSeleccionado(null);
    }
  }, [open]);

  const lot = currentLot;

  const NA = "Sin información";
  const isBlank = (v) =>
    v === null ||
    v === undefined ||
    (typeof v === "string" && v.trim().length === 0);

  const safe = (v) => (isBlank(v) ? NA : v);

  const titleCase = (s) => {
    if (isBlank(s)) return NA;
    return String(s)
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const fmtMeters = (v) => {
    if (isBlank(v)) return NA;
    const n = Number(v);
    if (!isFinite(n)) return NA;
    return `${n.toLocaleString("es-AR", {
      maximumFractionDigits: 2,
    })} m`;
  };

  const fmtSurface = (v) => {
    if (isBlank(v)) return NA;
    const n = Number(v);
    if (!isFinite(n)) return NA;
    return `${n.toLocaleString("es-AR", {
      maximumFractionDigits: 2,
    })} m²`;
  };

  const fmtMoney = (v) => {
    if (isBlank(v)) return NA;
    const n =
      typeof v === "number"
        ? v
        : Number(String(v).replace(/[^\d.-]/g, ""));
    if (!isFinite(n)) return NA;
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  };

  const fmtBoolean = (v) => {
    if (v === null || v === undefined) return NA;
    return v ? "Si" : "No";
  };

  const fmtDate = (d) => {
    if (isBlank(d)) return NA;
    const date =
      typeof d === "string" || typeof d === "number" ? new Date(d) : d;
    if (!date || isNaN(date?.getTime?.())) return NA;
    // Formato DD/MM/YYYY
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const ownerName = useMemo(() => {
    const p =
      lot?.propietario ||
      lot?.owner ||
      lot?.Propietario ||
      null;
    if (!p) return safe(lot?.owner);
    const nombre =
      p.nombre || p.firstName || p.username || p.name;
    const apellido = p.apellido || p.lastName || p.surname;
    const razonSocial = p.razonSocial;
    const full = razonSocial || [nombre, apellido].filter(Boolean).join(" ");
    return safe(full || nombre || apellido);
  }, [lot]);

  const tenantName = useMemo(() => {
    const i =
      lot?.inquilino ||
      null;
    if (!i) return null;
    const nombre =
      i.nombre || i.firstName || i.username || i.name;
    const apellido = i.apellido || i.lastName || i.surname;
    const razonSocial = i.razonSocial;
    const full = razonSocial || [nombre, apellido].filter(Boolean).join(" ");
    return full || nombre || apellido || null;
  }, [lot]);

  const ubicacion = useMemo(() => {
    const ubicacionCalle = lot?.ubicacion?.calle ?? lot?.ubicacion?.nombre ?? "";
    const ubicacionNumero = lot?.ubicacion?.numero ?? null;
    
    if (ubicacionCalle) {
      const callePart = `Calle ${ubicacionCalle}`;
      const numeroPart = ubicacionNumero != null ? `Nº ${ubicacionNumero}` : "";
      return safe(`${callePart} ${numeroPart}`.trim());
    }
    return "—";
  }, [lot]);

  const fraccion = safe(lot?.fraccion?.numero ?? "");

  // Formatear ID del lote como Lote {fraccion}-{numero}
  const loteDisplayId = useMemo(() => {
    return getLoteIdFormatted(lot) || NA;
  }, [lot]);

  const getEstadoValue = (estado) => {
    if (!estado) return "";
    const normalized = String(estado).toUpperCase().replace(/\s+/g, "_");
    return normalized;
  };

  // Calcular ocupación desde alquilerActivo
  const ocupacion = useMemo(() => {
    if (lot?.ocupacion) return lot.ocupacion === 'ALQUILADO' ? 'Alquilado' : 'No alquilado';
    return 'No alquilado';
  }, [lot]);

  // Obtener inquilino activo (preferir alquilerActivo.inquilino)
  const inquilinoActivo = useMemo(() => {
    if (lot?.alquilerActivo?.inquilino) {
      const i = lot.alquilerActivo.inquilino;
      const nombre = i.nombre || i.firstName || i.username || i.name;
      const apellido = i.apellido || i.lastName || i.surname;
      const razonSocial = i.razonSocial;
      const full = razonSocial || [nombre, apellido].filter(Boolean).join(" ");
      return full || nombre || apellido || null;
    }
    // Fallback: usar inquilino legacy si existe
    return tenantName;
  }, [lot, tenantName]);

  const leftPairs = [
    ["ID", loteDisplayId],
      ["NUMERO PARTIDA", safe(lot?.numPartido ?? lot?.numeroPartida)],
      ["FRACCIÓN", fraccion],
      ["TIPO", titleCase(lot?.tipo)],
      ["ESTADO", getEstadoValue(lot?.estado ?? lot?.status)],
      ["SUB-ESTADO", getEstadoValue(lot?.subestado ?? lot?.subStatus)],
      ["PROPIETARIO", ownerName],
      ["UBICACION", ubicacion],
      ["OCUPACIÓN", ocupacion], // Reemplazar ALQUILER por OCUPACIÓN
    ];
    
    // Agregar INQUILINO solo si está alquilado (ocupación === 'Alquilado')
    if (ocupacion === 'Alquilado' && inquilinoActivo) {
      leftPairs.push(["INQUILINO", safe(inquilinoActivo)]);
    }

  const rightPairs = [
    ["SUPERFICIE", fmtSurface(lot?.superficie ?? lot?.surface)],
    ["PRECIO", fmtMoney(lot?.precio ?? lot?.price)],
    ["DEUDA", fmtBoolean(lot?.deuda)],
    ["CREADO", fmtDate(lot?.createdAt ?? lot?.creadoEl)],
    ["ACTUALIZADO", fmtDate(lot?.updateAt ?? lot?.updatedAt)],
  ];

  const canUploadDocs = useMemo(
    () => ["ADMINISTRADOR", "GESTOR", "TECNICO"].includes(user?.role),
    [user?.role]
  );
  const canDeleteDocs = useMemo(
    () => ["ADMINISTRADOR", "GESTOR"].includes(user?.role),
    [user?.role]
  );

  const [imageUrls, setImageUrls] = useState([]);

  useEffect(() => {
    if (!open || !lot?.id) {
      setImageUrls([]);
      return;
    }

    (async () => {
      try {
        const imagenesConOrden = Array.isArray(lot?.images) && lot.images.length > 0
          ? lot.images.filter(img => img?.id && img?.url)
          : null;
        
        const archivos = await getArchivosByLote(lot.id);
        const imagenes = archivos.filter(a => (a.tipo || "").toUpperCase() === "IMAGEN" && a.id);
        
        const obtenerSignedUrl = async (img) => {
          const signedUrl = await getFileSignedUrl(img.id);
          return signedUrl?.startsWith('http') ? signedUrl : null;
        };
        
        if (imagenesConOrden?.length > 0) {
          const ordenIds = imagenesConOrden.map(img => img.id);
          const imagenesMap = new Map(imagenes.map(img => [img.id, img]));
          
          const urlsOrdenadas = await Promise.all(
            ordenIds.map(id => {
              const img = imagenesMap.get(id);
              return img ? obtenerSignedUrl(img) : null;
            })
          );
          
          setImageUrls(urlsOrdenadas.filter(Boolean));
        } else {
          const urls = await Promise.all(imagenes.map(obtenerSignedUrl));
          setImageUrls(urls.filter(Boolean));
        }
      } catch (err) {
        console.error("Error cargando imágenes:", err);
        setImageUrls([]);
      }
    })();
  }, [open, lot?.id, lot?.images]);

  const imageSources = useMemo(() => {
    return imageUrls.filter(Boolean);
  }, [imageUrls]);

  const descriptionText = safe(lot?.descripcion ?? lot?.description);

  const [currentImage, setCurrentImage] = useState(0);
  useEffect(() => {
    setCurrentImage(0);
  }, [lot?.id, open]);

  const hasImages = imageSources.length > 0;
  const images = hasImages ? imageSources : [];
  const showCarouselControls = imageSources.length > 1;

  const handlePrev = () =>
    setCurrentImage((idx) =>
      idx === 0 ? images.length - 1 : idx - 1
    );
  const handleNext = () =>
    setCurrentImage((idx) =>
      idx === images.length - 1 ? 0 : idx + 1
    );

  const infoPairs = [...leftPairs, ...rightPairs];

  const [labelWidth, setLabelWidth] = useState(190);
  useEffect(() => {
    const labels = infoPairs.map(([label]) => label);
    const longest = Math.max(...labels.map((l) => l.length));
    const computed = Math.min(260, Math.max(160, Math.round(longest * 8.2) + 22));
    setLabelWidth(computed);
  }, [infoPairs, open]);

  // Determinar si se puede ver la reserva (solo si es de la inmobiliaria del usuario)
  // IMPORTANTE: Estos hooks deben estar ANTES del return condicional para cumplir con las reglas de hooks
  const puedeVerReserva = useMemo(() => {
    if (!reservaActiva) return false;
    if (user?.role === 'ADMINISTRADOR' || user?.role === 'GESTOR') return true;
    if (user?.role === 'INMOBILIARIA' && reservaActiva.inmobiliariaId === user.inmobiliariaId) return true;
    return false;
  }, [reservaActiva, user]);

  // Determinar si se puede reservar (solo INMOBILIARIA en lotes DISPONIBLE)
  const puedeReservar = useMemo(() => {
    if (user?.role !== 'INMOBILIARIA') return false;
    return isLoteReservable(currentLot?.estado);
  }, [user?.role, currentLot?.estado]);

  // Early return DESPUÉS de todos los hooks
  if (!open || !lot) return null;

  const valueStyle = (val) => ({
    color: val === NA ? "#6B7280" : "#111827",
  });

  const handleOpenDocModal = (type) => {
    setDocTipoSeleccionado(type);
    setDocModalOpen(true);
  };

  return (
    <div className="cclf-overlay" onClick={onClose}>
      <div
        className="cclf-card"
        onClick={(e) => e.stopPropagation()}
        style={{ ["--sale-label-w"]: `${labelWidth}px` }}
      >
        <div className="cclf-card__header">
          <h2 className="cclf-card__title">{loteDisplayId !== NA ? loteDisplayId : "Lote"}</h2>

          <div className="cclf-card__actions lote-header-actions">
            {/* Botón "Editar Lote": NO se muestra para INMOBILIARIA */}
            {user?.role !== 'INMOBILIARIA' && (
              <button
                type="button"
                className="cclf-tab thin"
                onClick={() => {
                  if (!lot) return;
                  if (onEdit) {
                    onEdit(lot);
                  } else {
                    setEditOpen(true);
                  }
                }}
              >
                Editar Lote
              </button>
            )}
            {/* Botón "Ver Reserva": solo si la reserva es de la inmobiliaria del usuario */}
            {puedeVerReserva && (
              <button
                type="button"
                className="cclf-tab thin reserve"
                onClick={() => currentLot && onReserve?.(currentLot)}
              >
                Ver Reserva
              </button>
            )}
            {/* Botón "Reservar": solo si el lote está disponible y el usuario es INMOBILIARIA */}
            {puedeReservar && (
              <button
                type="button"
                className="cclf-tab thin reserve"
                onClick={() => currentLot && onReserve?.(currentLot)}
              >
                Reservar
              </button>
            )}
            <button
              type="button"
              className="cclf-btn-close"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <span className="cclf-btn-close__x">×</span>
            </button>
          </div>
        </div>

        <div className="cclf-card__body">
          <h3 className="lote-info-title">Información del lote</h3>

          <div
            className="lote-grid"
            style={{ ["--sale-label-w"]: `${labelWidth}px` }}
          >
            <div className="lote-data-col">
              {infoPairs.map(([label, value]) => {
                // Si es ESTADO o SUB-ESTADO, usar NiceSelect disabled pero con estilo normal (sin gris)
                if (label === "ESTADO") {
                  return (
                    <div className="field-row" key={label}>
                      <div className="field-label">{label}</div>
                      <div className="field-value p0">
                        <NiceSelect
                          value={value}
                          options={ESTADOS_LOTE}
                          placeholder="Sin información"
                          disabled={true}
                        />
                      </div>
                    </div>
                  );
                }
                if (label === "SUB-ESTADO") {
                  return (
                    <div className="field-row" key={label}>
                      <div className="field-label">{label}</div>
                      <div className="field-value p0">
                        <NiceSelect
                          value={value}
                          options={SUBESTADOS_LOTE}
                          placeholder="Sin información"
                          disabled={true}
                        />
                      </div>
                    </div>
                  );
                }
                // Para otros campos, mostrar texto normal
                return (
                  <div className="field-row" key={label}>
                    <div className="field-label">{label}</div>
                    <div className="field-value" style={valueStyle(value)}>
                      {value}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="lote-media-col">
              <div className="lote-carousel">
                {hasImages ? (
                  <>
                    <img
                      src={images[currentImage]}
                      alt={`Imagen ${currentImage + 1}`}
                      className="lote-carousel__image"
                    />
                    {showCarouselControls && (
                      <>
                        <button
                          type="button"
                          className="lote-carousel__nav lote-carousel__nav--prev"
                          onClick={handlePrev}
                          aria-label="Imagen anterior"
                        >
                          <ChevronLeft size={24} strokeWidth={2.5} />
                        </button>
                        <button
                          type="button"
                          className="lote-carousel__nav lote-carousel__nav--next"
                          onClick={handleNext}
                          aria-label="Imagen siguiente"
                        >
                          <ChevronRight size={24} strokeWidth={2.5} />
                        </button>
                        <div className="lote-carousel__indicator">
                          {images.map((_, idx) => (
                            <span
                              key={idx}
                              className={`lote-carousel__dot ${
                                idx === currentImage ? "is-active" : ""
                              }`}
                            />
                          ))}
                        </div>
                        <div className="lote-carousel__counter">
                          {currentImage + 1} / {images.length}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="lote-carousel__placeholder">
                    <ImageIcon size={64} strokeWidth={1.5} />
                    <p>Imagen no cargada</p>
                  </div>
                )}
              </div>

              <div className="lote-description">
                <span className="lote-description__icon">ℹ️</span>
                <div className="lote-description__body">
                  <strong>Descripción</strong>
                  <p style={{ margin: "8px 0 0" }}>
                    {descriptionText === NA
                      ? "Sin descripción disponible para este lote."
                      : descriptionText}
                  </p>
                </div>
              </div>

              <div className="lote-doc-buttons" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {DOC_TIPOS.map(({ label, type }, index) => {
                  const flexStyle = index === 0
                    ? { flex: "1 1 100%" }
                    : { flex: "1 1 calc(50% - 4px)" };
                  return (
                    <button
                      key={type}
                      type="button"
                      className="lote-doc-button"
                      disabled={!lot?.id}
                      onClick={() => lot?.id && handleOpenDocModal(type)}
                      style={flexStyle}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      <LoteEditarCard
        open={editOpen}
        lote={lot}
        loteId={lot?.id}
        lotes={lotes}
        onCancel={() => setEditOpen(false)}
        onSaved={(updated) => {
          setEditOpen(false);
          if (updated) {
            setCurrentLot(updated);
            onUpdated?.(updated);
          }
        }}
      />
      {docTipoSeleccionado && (
        <DocumentoVerCard
          open={docModalOpen}
          onClose={() => {
            setDocModalOpen(false);
            setDocTipoSeleccionado(null);
          }}
          tipoDocumento={docTipoSeleccionado}
          loteId={lot?.id}
          loteNumero={loteDisplayId}
          canUpload={canUploadDocs}
          canDelete={canDeleteDocs}
        />
      )}
    </div>
  );
}





