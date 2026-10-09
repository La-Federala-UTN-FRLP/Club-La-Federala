import { useEffect, useMemo, useState, useRef } from "react";
import { Info } from "lucide-react";
import EditarBase from "../Base/EditarBase.jsx";
import SuccessAnimation from "../Base/SuccessAnimation.jsx";
import NiceSelect from "../../Base/NiceSelect.jsx";
import { updateLote, getLoteById } from "../../../lib/api/lotes.js";
import { getVentaAsociadaByLoteId } from "../../../lib/api/ventas.js";
import { getAllPersonas } from "../../../lib/api/personas.js";
import { uploadArchivo, getArchivosByLote, deleteArchivo, getFileSignedUrl } from "../../../lib/api/archivos.js";
import { useToast } from "../../../app/providers/ToastProvider.jsx";
import { getLoteIdFormatted } from "../../Table/TablaLotes/utils/getters.js";
import PersonaSearchSelect from "./PersonaSearchSelect.jsx";
import LoteImageUploader from "./LoteImageUploader.jsx";

const TIPOS = [
  { value: "Lote Venta", label: "Lote Venta" },
  { value: "Espacio Comun", label: "Espacio Común" },
];

// Estados editables: solo los que se pueden seleccionar manualmente
const ESTADOS_EDITABLES_LOTE = [
  { value: "Disponible", label: "Disponible" },
  { value: "No Disponible", label: "No Disponible" },
  { value: "Vendido", label: "Vendido" },
];

const SUBESTADOS = [
  { value: "No Construido", label: "No Construido" },
  { value: "En Construccion", label: "En Construcción" },
  { value: "Construido", label: "Construido" },
];

// Estados derivados (NO editables manualmente) - ALQUILADO ya no es estado derivado
const ESTADOS_DERIVADOS = ["Reservado", "En Promoción", "Con Prioridad"];

// Listado de calles disponibles (enum NombreCalle del backend)
const CALLES_OPTIONS = [
  { value: "REINAMORA", label: "REINAMORA" },
  { value: "MACA", label: "MACA" },
  { value: "ZORZAL", label: "ZORZAL" },
  { value: "CAUQUEN", label: "CAUQUEN" },
  { value: "ALONDRA", label: "ALONDRA" },
  { value: "JACANA", label: "JACANA" },
  { value: "TACUARITO", label: "TACUARITO" },
  { value: "JILGUERO", label: "JILGUERO" },
  { value: "GOLONDRINA", label: "GOLONDRINA" },
  { value: "CALANDRIA", label: "CALANDRIA" },
  { value: "AGUILAMORA", label: "AGUILAMORA" },
  { value: "LORCA", label: "LORCA" },
  { value: "MILANO", label: "MILANO" },
];

const LABELS = [
  "ID",
  "NÚMERO PARTIDA",
  "TIPO",
  "ESTADO",
  "SUB-ESTADO",
  "SUPERFICIE",
  "PRECIO",
  "PROPIETARIO",
  "UBICACIÓN",
  "OCUPACIÓN",
  "DEUDA",
  "DESCRIPCIÓN",
];

const FROM_PRISMA_MAP = {
  LOTE_VENTA: "Lote Venta",
  ESPACIO_COMUN: "Espacio Comun",
  DISPONIBLE: "Disponible",
  RESERVADO: "Reservado",
  VENDIDO: "Vendido",
  NO_DISPONIBLE: "No Disponible",
  EN_PROMOCION: "En Promoción",
  CON_PRIORIDAD: "Con Prioridad",
  EN_CONSTRUCCION: "En Construccion",
  NO_CONSTRUIDO: "No Construido",
  CONSTRUIDO: "Construido",
};

const OCUPACION_OPTIONS = [
  { value: "NO_ALQUILADO", label: "No alquilado" },
  { value: "ALQUILADO", label: "Alquilado" },
];

const toFriendly = (value) => {
  if (value == null) return "";
  return FROM_PRISMA_MAP[value] || value;
};

const toNumberOrNull = (val) => {
  if (val === "" || val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
};

const buildInitialForm = (lot) => {
  if (!lot) {
    return {
      id: "",
      tipo: "",
      estado: "",
      subestado: "",
      numPartido: "",
      propietarioId: "",
      superficie: "",
      precio: "",
      ocupacion: "NO_ALQUILADO",
      deuda: false,
      descripcion: "",
      ubicacionId: "",
      ubicacionCalle: "",
      ubicacionNumero: "",
      nombreEspacioComun: "",
      capacidad: "",
      images: [],
    };
  }

  const propietario = lot?.propietario || lot?.owner || lot?.Propietario || {};
  // Preferir inquilino de alquilerActivo si existe
  const inquilino = lot?.alquilerActivo?.inquilino || lot?.inquilino || {};
  const ubicacion = lot?.ubicacion ?? {};

  // Calcular ocupación inicial
  let ocupacionInicial = "NO_ALQUILADO";
  if (lot?.ocupacion === 'ALQUILADO' || lot?.alquilerActivo || (lot?.alquiler === true && lot?.inquilinoId)) {
    ocupacionInicial = "ALQUILADO";
  }

  // Obtener inquilinoId (preferir alquilerActivo)
  const inquilinoId = lot?.alquilerActivo?.inquilino?.id || lot?.alquilerActivo?.inquilinoId || lot?.inquilinoId || inquilino?.id || "";

  return {
    id: lot.id ?? "",
    tipo: toFriendly(lot?.tipo),
    estado: toFriendly(lot?.estado ?? lot?.status),
    subestado: toFriendly(lot?.subestado ?? lot?.subStatus),
    numPartido: lot?.numPartido ?? lot?.numeroPartida ?? "",
    propietarioId: lot?.propietarioId ?? propietario?.id ?? "",
    inquilinoId: inquilinoId,
    superficie: lot?.superficie ?? lot?.surface ?? "",
    precio: lot?.precio ?? lot?.price ?? "",
    ocupacion: ocupacionInicial,
    deuda: Boolean(lot?.deuda),
    descripcion: lot?.descripcion ?? lot?.description ?? "",
    ubicacionId: lot?.ubicacionId ?? ubicacion?.id ?? "",
    ubicacionCalle: ubicacion?.calle ?? ubicacion?.nombre ?? "",
    ubicacionNumero: ubicacion?.numero ?? "",
    nombreEspacioComun: lot?.nombreEspacioComun ?? "",
    capacidad: lot?.capacidad ?? "",
    images: [], // Siempre inicializar vacío, se cargan desde el backend
  };
};

export default function LoteEditarCard({
  open,
  onCancel,
  onSaved,
  lote,
  loteId,
  lotes,
}) {
  const { success, error: showError } = useToast();
  const [detalle, setDetalle] = useState(lote || null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [form, setForm] = useState(buildInitialForm(lote));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fracciones, setFracciones] = useState([]);
  const [loadingFracciones, setLoadingFracciones] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [ventaAsociada, setVentaAsociada] = useState(null);
  const [archivosParaBorrar, setArchivosParaBorrar] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [loadingPersonas, setLoadingPersonas] = useState(false);
  const [errors, setErrors] = useState({});

  // Cargar personas al abrir
  useEffect(() => {
    if (!open) return;
    if (personas.length > 0) return;
    setLoadingPersonas(true);
    (async () => {
      try {
        const resp = await getAllPersonas({});
        const personasData = resp?.personas ?? (Array.isArray(resp) ? resp : []);
        setPersonas(Array.isArray(personasData) ? personasData : []);
      } catch (err) {
        console.error("Error cargando personas:", err);
        setPersonas([]);
      } finally {
        setLoadingPersonas(false);
      }
    })();
  }, [open, personas.length]);

  // Validación solo al guardar, no en tiempo real

  const computedLabelWidth = useMemo(() => {
    const longest = Math.max(...LABELS.map((l) => l.length));
    return Math.min(260, Math.max(160, Math.round(longest * 8.2) + 22));
  }, []);

  // Opciones de estado: incluir estado actual si es derivado (no editable) para mostrarlo
  const opcionesEstado = useMemo(() => {
    const estadoActual = form.estado;
    const esEditable = ESTADOS_EDITABLES_LOTE.some(e => e.value === estadoActual);
    
    // Si el estado actual no es editable, agregarlo temporalmente para mostrarlo (pero readonly)
    if (estadoActual && !esEditable) {
      return [{ value: estadoActual, label: estadoActual }, ...ESTADOS_EDITABLES_LOTE];
    }
    
    return ESTADOS_EDITABLES_LOTE;
  }, [form.estado]);

  // Determinar si el estado actual es derivado (readonly)
  const estadoEsDerivado = useMemo(() => {
    return ESTADOS_DERIVADOS.includes(form.estado);
  }, [form.estado]);

  // Mensaje tooltip para estado derivado
  const getTooltipEstadoDerivado = () => {
    const estado = form.estado;
    if (estado === "Reservado") return "Este estado se gestiona desde el módulo de Reservas.";
    if (estado === "En Promoción") return "Este estado se gestiona desde el módulo de Promociones.";
    if (estado === "Con Prioridad") return "Este estado se gestiona desde el módulo de Prioridades.";
    return "Este estado se gestiona desde su módulo correspondiente.";
  };

  // Validar si se puede cambiar ocupación a ALQUILADO
  const puedeAlquilar = useMemo(() => {
    const estadoUpper = String(form.estado || "").toUpperCase();
    return estadoUpper !== "NO_DISPONIBLE" && estadoUpper !== "NO DISPONIBLE";
  }, [form.estado]);

  // Formatear ID del lote
  const loteDisplayId = useMemo(() => {
    if (!detalle) return "—";
    return getLoteIdFormatted(detalle) || "—";
  }, [detalle]);

  const fallbackDetalle = useMemo(() => {
    if (lote) return lote;
    if (loteId != null && Array.isArray(lotes)) {
      return lotes.find((l) => `${l.id}` === `${loteId}`) || null;
    }
    return null;
  }, [lote, loteId, lotes]);

  useEffect(() => {
    if (fallbackDetalle) setDetalle(fallbackDetalle);
  }, [fallbackDetalle]);

  useEffect(() => {
    if (!open) return;
    if (!detalle && loteId != null && !loadingDetalle) {
      setLoadingDetalle(true);
      (async () => {
        try {
          const resp = await getLoteById(loteId);
          const lot = resp?.data ?? resp ?? null;
          setDetalle(lot);
        } catch (err) {
          console.error("Error obteniendo lote por id:", err);
          setError("No se pudo cargar el lote seleccionado.");
        } finally {
          setLoadingDetalle(false);
        }
      })();
    }
  }, [open, detalle, loteId, loadingDetalle]);

  useEffect(() => {
    if (!open) return;
    if (!detalle) return;

    setForm(buildInitialForm(detalle));
    setArchivosParaBorrar([]);
    setError(null);
    setErrors({}); // Limpiar errores de validación al abrir
    setShowSuccess(false);
  }, [detalle?.id, open]);

  useEffect(() => {
    if (!open || !detalle?.id) return;

    let cancelled = false;

    (async () => {
      try {
        const resp = await getArchivosByLote(detalle.id);
        if (cancelled) return;
        
        const archivos = Array.isArray(resp) ? resp : (resp?.archivos ?? resp?.data?.archivos ?? []);
        const imagenes = archivos.filter(a => (a.tipo || "").toUpperCase() === "IMAGEN" && a.id);
        
        const imagenesConUrls = await Promise.all(
          imagenes.map(async (img) => {
            const signedUrl = await getFileSignedUrl(img.id);
            return signedUrl?.startsWith('http') ? { id: img.id, url: signedUrl } : null;
          })
        );
        
        if (cancelled) return;
        
        const imagenesValidas = imagenesConUrls.filter(i => i?.id && i?.url);
        setForm(prev => {
          const existingFiles = (prev.images || []).filter(img => img instanceof File && img.objectURL);
          return { ...prev, images: [...existingFiles, ...imagenesValidas] };
        });
      } catch (err) {
        if (!cancelled) console.error("Error cargando archivos del lote:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [detalle?.id, open]);

  // Venta válida del lote (OPERATIVA y no CANCELADA): habilita el guard de VENDIDO
  useEffect(() => {
    setVentaAsociada(null);
    if (!open || !detalle?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const venta = await getVentaAsociadaByLoteId(detalle.id);
        if (!cancelled) setVentaAsociada(venta);
      } catch (err) {
        if (!cancelled) console.error("Error cargando la venta del lote:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [open, detalle?.id]);

  const updateForm = (patch) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  const handleReset = () => {
    setForm(buildInitialForm(detalle));
    setError(null);
    setErrors({}); // Limpiar errores de validación al resetear
    setArchivosParaBorrar([]);
  };

  // Callback para manejar cambios en las imágenes desde el componente reutilizable
  const handleImagesChange = (newImages) => {
    setForm(prev => ({ ...prev, images: newImages }));
  };

  // Callback para manejar IDs de imágenes eliminadas (para borrar del backend)
  const handleDeletedIdsChange = (deletedIds) => {
    setArchivosParaBorrar(deletedIds);
  };

  const buildPayload = () => {
    try {
      const payload = {};
      if (form.tipo) payload.tipo = form.tipo;
      
      // Solo enviar estado si no es derivado (y si el usuario lo cambió a uno editable)
      if (form.estado && !estadoEsDerivado) {
        payload.estado = form.estado;
      }
      
      if (form.subestado) payload.subestado = form.subestado;

      const numPartido = toNumberOrNull(form.numPartido);
      if (numPartido != null) payload.numPartido = numPartido;

      const superficie = toNumberOrNull(form.superficie);
      if (superficie != null && superficie >= 0) payload.superficie = superficie;

      const precio = toNumberOrNull(form.precio);
      if (precio != null) payload.precio = precio;

      if (form.descripcion != null) payload.descripcion = form.descripcion;
      payload.deuda = Boolean(form.deuda);

      const propietarioId = toNumberOrNull(form.propietarioId);
      if (propietarioId) payload.propietarioId = propietarioId;

      // Manejar ocupación (nueva lógica)
      if (form.ocupacion) {
        payload.ocupacion = form.ocupacion;

        // Si ocupación = ALQUILADO, enviar inquilinoId (obligatorio)
        if (form.ocupacion === "ALQUILADO") {
          const inquilinoId = toNumberOrNull(form.inquilinoId);
          if (inquilinoId) {
            payload.inquilinoId = inquilinoId;
          }
        }
        // Si ocupación = NO_ALQUILADO, no enviar inquilinoId (el backend finalizará el alquiler activo)
      }

      // Ubicación: enviar solo si hay cambios
      const ubicacionOriginal = detalle?.ubicacion;
      const calleOriginal = ubicacionOriginal?.calle;
      const numeroOriginal = ubicacionOriginal?.numero;
      
      const calleForm = form.ubicacionCalle?.trim() || null;
      const numeroForm = toNumberOrNull(form.ubicacionNumero);
      
      // Determinar si hay cambios
      const calleCambio = calleForm && calleForm !== calleOriginal;
      const numeroCambio = numeroForm != null && numeroForm > 0 && numeroForm !== numeroOriginal;
      
      if (calleCambio || numeroCambio) {
        // Si hay ubicación existente, enviar ambos valores (el que cambió + el original del otro)
        if (form.ubicacionId && calleOriginal) {
          payload.calle = calleForm || calleOriginal;
          const numeroAEnviar = numeroCambio ? numeroForm : (numeroOriginal || null);
          if (numeroAEnviar != null && numeroAEnviar > 0) {
            payload.numeroCalle = numeroAEnviar;
          }
        } else if (calleForm) {
          // Crear nueva ubicación solo si hay calle
          payload.calle = calleForm;
          if (numeroForm != null && numeroForm > 0) {
            payload.numeroCalle = numeroForm;
          }
        }
      }

      if (form.tipo === "Espacio Comun") {
        if (form.nombreEspacioComun != null && form.nombreEspacioComun.trim()) {
          payload.nombreEspacioComun = form.nombreEspacioComun.trim();
        }
        const capacidad = toNumberOrNull(form.capacidad);
        if (capacidad != null && capacidad >= 0) payload.capacidad = capacidad;
      }

      return payload;
    } catch (err) {
      console.error("Error en buildPayload:", err);
      return {};
    }
  };

  const handleSave = async () => {
    if (!detalle?.id) return;
    
    // Validación: si ocupación=ALQUILADO, inquilinoId es requerido
    if (form.ocupacion === "ALQUILADO" && !form.inquilinoId) {
      setErrors({ inquilinoId: "Debes seleccionar un inquilino si la ocupación es Alquilado." });
      setSaving(false);
      return;
    }

    // Validación: NO_DISPONIBLE no permite ocupación ALQUILADO
    const estadoUpper = String(form.estado || "").toUpperCase();
    if (form.ocupacion === "ALQUILADO" && (estadoUpper === "NO_DISPONIBLE" || estadoUpper === "NO DISPONIBLE")) {
      setError("No se puede alquilar un lote en estado NO DISPONIBLE.");
      setSaving(false);
      return;
    }
    
    // Limpiar errores de validación si todo está bien
    setErrors({});
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      const nuevoEstado = payload.estado || form.estado;
      const estadoUpperPayload = String(nuevoEstado || "").toUpperCase();

      // Validación de VENDIDO: solo permitir si hay una venta válida (no CANCELADA)
      if (estadoUpperPayload === "VENDIDO") {
        if (!ventaAsociada) {
          setError("No se puede establecer el estado VENDIDO sin una venta registrada para este lote.");
          setSaving(false);
          return;
        }
      }

      const resp = await updateLote(detalle.id, payload);
      const updated = resp?.data ?? resp ?? {};

      // Subir nuevos archivos
      const newFiles = (form.images || []).filter(img => img instanceof File);
      if (newFiles.length > 0) {
        try {
          await Promise.all(newFiles.map(file => uploadArchivo(file, detalle.id, "IMAGEN")));
        } catch (uploadErr) {
          console.error("Error subiendo imágenes:", uploadErr);
          showError("Se actualizaron datos del lote, pero hubo un error subiendo algunas imágenes");
        }
      }

      // Borrar archivos marcados
      if (archivosParaBorrar.length > 0) {
        try {
          await Promise.allSettled(
            archivosParaBorrar.map(id => 
              deleteArchivo(id).catch(err => {
                console.warn(`Error borrando archivo ${id}:`, err);
                return null;
              })
            )
          );
        } catch (delErr) {
          console.error("Error borrando archivos:", delErr);
        }
      }

      const ordenActual = (form.images || [])
        .filter(img => !(img instanceof File) && img?.id)
        .map(img => img.id);
      
      let imagenesActualizadas = [];
      try {
        const resp = await getArchivosByLote(detalle.id);
        const archivos = Array.isArray(resp) ? resp : (resp?.archivos ?? resp?.data?.archivos ?? []);
        const imagenes = archivos.filter(a => (a.tipo || "").toUpperCase() === "IMAGEN" && a.id);
        
        imagenesActualizadas = await Promise.all(
          imagenes.map(async (img) => {
            const signedUrl = await getFileSignedUrl(img.id);
            return signedUrl?.startsWith('http') ? { id: img.id, url: signedUrl } : null;
          })
        );
        imagenesActualizadas = imagenesActualizadas.filter(i => i?.id && i?.url);
        
        const imagenesMap = new Map(imagenesActualizadas.map(img => [img.id, img]));
        const imagenesOrdenadas = [];
        
        ordenActual.forEach(id => {
          const img = imagenesMap.get(id);
          if (img) {
            imagenesOrdenadas.push(img);
            imagenesMap.delete(id);
          }
        });
        
        imagenesMap.forEach(img => imagenesOrdenadas.push(img));
        imagenesActualizadas = imagenesOrdenadas;
        
        setForm(prev => ({ ...prev, images: imagenesActualizadas }));
      } catch (err) {
        console.error("Error recargando imágenes:", err);
        imagenesActualizadas = (form.images || []).filter(img => !(img instanceof File) && img?.id && img?.url);
        setForm(prev => ({ ...prev, images: imagenesActualizadas }));
      }

      // Usar los datos actualizados del backend que ya incluyen todas las relaciones y la ocupación correcta
      const enriched = {
        ...(updated || {}),
        images: imagenesActualizadas,
        // Asegurar que el estado viene del backend
        estado: updated?.estado ?? detalle?.estado,
        // Asegurar que ocupación viene del backend
        ocupacion: updated?.ocupacion ?? payload.ocupacion ?? detalle?.ocupacion,
        // Asegurar que alquilerActivo viene del backend
        alquilerActivo: updated?.alquilerActivo ?? null,
        // Asegurar que inquilino viene del backend con la relación completa (preferir alquilerActivo)
        inquilino: updated?.alquilerActivo?.inquilino || updated?.inquilino || null,
        inquilinoId: updated?.alquilerActivo?.inquilinoId || updated?.inquilinoId || null,
      };

      setDetalle(enriched);
      onSaved?.(enriched);
      setErrors({}); // Limpiar errores de validación al guardar exitosamente
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setSaving(false);
        onCancel?.();
      }, 1500);
    } catch (err) {
      console.error("Error guardando lote:", err);
      setError(err?.message || "No se pudo guardar el lote. Intenta nuevamente.");
      setSaving(false);
    }
  };

  if (!open && !showSuccess) return null;

  return (
    <>
      <SuccessAnimation show={showSuccess} message="¡Lote guardado exitosamente!" />

      <EditarBase
        open={open}
        title={`Editar Lote N° ${loteDisplayId}`}
        onCancel={() => { 
          if (showSuccess) return; 
          setSaving(false); 
          setShowSuccess(false);
          setErrors({}); // Limpiar errores al cancelar
          // Resetear formulario al cancelar para que no persistan cambios no guardados
          if (detalle) {
            setForm(buildInitialForm(detalle));
          }
          onCancel?.(); 
        }}
        saveButtonText={saving ? "Guardando..." : "Guardar cambios"}
        onSave={handleSave}
        onReset={detalle ? handleReset : undefined}
        saving={saving}
        headerRight={loadingDetalle ? <span className="badge bg-warning text-dark">Cargando...</span> : null}
      >
        {!detalle && (
          <div style={{ padding: "30px 10px" }}>
            <p style={{ margin: 0, color: "#6B7280" }}>
              {loadingDetalle ? "Cargando información del lote..." : "No se encontró información del lote."}
            </p>
          </div>
        )}

        {detalle && (
          <div className="lote-grid" style={{ ["--sale-label-w"]: `${computedLabelWidth}px` }}>
            <div className="lote-data-col">
              <div className="field-row"><div className="field-label">ID</div><div className="field-value is-readonly">{loteDisplayId}</div></div>
              <div className="field-row"><div className="field-label">Número Partida</div><div className="field-value p0"><input className="field-input" type="number" inputMode="numeric" value={form.numPartido ?? ""} onChange={(e) => updateForm({ numPartido: e.target.value })} placeholder="Número de partida" /></div></div>
              <div className="field-row"><div className="field-label">Tipo</div><div className="field-value p0"><NiceSelect value={form.tipo} options={TIPOS} placeholder="" onChange={(value) => updateForm({ tipo: value, nombreEspacioComun: value === "Espacio Comun" ? form.nombreEspacioComun : "", capacidad: value === "Espacio Comun" ? form.capacidad : "" })} /></div></div>

              {form.tipo === "Espacio Comun" && (
                <>
                  <div className="field-row"><div className="field-label">Nombre del Espacio Común</div><div className="field-value p0"><input className="field-input" type="text" value={form.nombreEspacioComun ?? ""} onChange={(e) => updateForm({ nombreEspacioComun: e.target.value })} placeholder="Ej. Piscina" /></div></div>
                  <div className="field-row"><div className="field-label">Capacidad</div><div className="field-value p0"><input className="field-input" type="number" inputMode="numeric" value={form.capacidad ?? ""} onChange={(e) => updateForm({ capacidad: e.target.value })} placeholder="Ej. 100" /></div></div>
                </>
              )}

              <div className="field-row">
                <div className="field-label">
                  Estado
                </div>
                <div className="field-value p0" style={{ position: "relative" }}>
                  <NiceSelect 
                    value={form.estado} 
                    options={opcionesEstado} 
                    placeholder="" 
                    onChange={(value) => updateForm({ estado: value })} 
                    disabled={estadoEsDerivado}
                  />
                  {estadoEsDerivado && (
                    <span
                      className="propietario-info-icon-inline estado-tooltip-icon"
                      data-tooltip={getTooltipEstadoDerivado()}
                    >
                      <Info size={14} />
                    </span>
                  )}
                </div>
              </div>
              <div className="field-row"><div className="field-label">Sub-Estado</div><div className="field-value p0"><NiceSelect value={form.subestado} options={SUBESTADOS} placeholder="" onChange={(value) => updateForm({ subestado: value })} /></div></div>
              <div className="field-row"><div className="field-label">Superficie</div><div className="field-value p0"><input className="field-input" type="number" inputMode="decimal" value={form.superficie ?? ""} onChange={(e) => updateForm({ superficie: e.target.value })} placeholder="m²" /></div></div>
              <div className="field-row"><div className="field-label">Precio</div><div className="field-value p0"><input className="field-input" type="number" inputMode="decimal" value={form.precio ?? ""} onChange={(e) => updateForm({ precio: e.target.value })} placeholder="USD" /></div></div>
              
              <PersonaSearchSelect
                label="Propietario"
                value={form.propietarioId}
                onSelect={(id) => updateForm({ propietarioId: id || "" })}
                personas={personas}
                loading={loadingPersonas}
                placeholder="Buscar por nombre, apellido o DNI"
                tooltipText="Si no aparece en la lista, primero registrá a la persona en el módulo Personas."
              />

              <div className="field-row"><div className="field-label">Calle</div><div className="field-value p0"><NiceSelect value={form.ubicacionCalle ?? ""} options={CALLES_OPTIONS} placeholder="Seleccionar calle" onChange={(value) => updateForm({ ubicacionCalle: value || "" })} /></div></div>
              <div className="field-row"><div className="field-label">Número</div><div className="field-value p0"><input className="field-input" type="number" inputMode="numeric" value={form.ubicacionNumero ?? ""} onChange={(e) => updateForm({ ubicacionNumero: e.target.value })} placeholder="Ej. 202" /></div></div>
              
              <div className="field-row">
                <div className="field-label">Ocupación</div>
                <div className="field-value p0">
                  <NiceSelect 
                    value={form.ocupacion} 
                    options={OCUPACION_OPTIONS} 
                    placeholder="Seleccionar ocupación" 
                    onChange={(value) => {
                      // Prevenir cambio a ALQUILADO si no puede alquilar
                      if (value === "ALQUILADO" && !puedeAlquilar) {
                        return;
                      }
                      updateForm({ 
                        ocupacion: value || "NO_ALQUILADO",
                        // Si se cambia a NO_ALQUILADO, limpiar inquilinoId
                        inquilinoId: value === "ALQUILADO" ? form.inquilinoId : ""
                      });
                      // Limpiar errores al cambiar ocupación
                      setErrors(prev => {
                        const newErrors = { ...prev };
                        delete newErrors.inquilinoId;
                        return newErrors;
                      });
                    }}
                    disabled={!puedeAlquilar}
                  />
                </div>
              </div>

              {form.ocupacion === "ALQUILADO" && (
                <div className={errors.inquilinoId ? "hasError" : ""}>
                  <PersonaSearchSelect
                    label="Inquilino"
                    value={form.inquilinoId}
                    onSelect={(id) => {
                      updateForm({ inquilinoId: id || "" });
                      // Limpiar error cuando se selecciona un inquilino
                      if (id) {
                        setErrors(prev => {
                          const newErrors = { ...prev };
                          delete newErrors.inquilinoId;
                          return newErrors;
                        });
                      }
                    }}
                    personas={personas}
                    loading={loadingPersonas}
                    placeholder="Buscar por nombre, apellido o DNI"
                    tooltipText="Para elegir un inquilino, la persona debe existir como cliente previamente."
                    error={errors.inquilinoId ? true : false}
                  />
                  {errors.inquilinoId && (
                    <div className="fieldError">{errors.inquilinoId}</div>
                  )}
                </div>
              )}
              <div className="field-row"><div className="field-label">Deuda</div><div className="field-value boolean-value"><input type="checkbox" checked={form.deuda} onChange={(e) => updateForm({ deuda: e.target.checked })} /><span>{form.deuda ? "Sí" : "No"}</span></div></div>
            </div>

            <div className="lote-media-col">
              {/* Reutilizamos el mismo componente de subida de imágenes en Crear y Editar lote
                  para garantizar un comportamiento consistente. */}
              <LoteImageUploader
                images={form.images || []}
                onChange={handleImagesChange}
                onDeletedIdsChange={handleDeletedIdsChange}
                inputId="file-input-lote-editar"
              />

              <div className="lote-description">
                <span className="lote-description__icon">ℹ️</span>
                <div className="lote-description__body">
                  <strong>Descripción</strong>
                  <textarea style={{ margin: "8px 0 0", width: "100%", minHeight: "80px", padding: "8px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px", fontFamily: "inherit", resize: "vertical" }} value={form.descripcion ?? ""} onChange={(e) => updateForm({ descripcion: e.target.value })} placeholder="Notas relevantes del lote…" />
                </div>
              </div>

              <div className="lote-doc-buttons" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button type="button" className="lote-doc-button" disabled style={{ flex: "1 1 100%" }}>Escritura</button>
                <button type="button" className="lote-doc-button" disabled style={{ flex: "1 1 calc(50% - 4px)" }}>Boleto CompraVenta</button>
                <button type="button" className="lote-doc-button" disabled style={{ flex: "1 1 calc(50% - 4px)" }}>Planos</button>
              </div>
            </div>
          </div>
        )}

        {error && <div style={{ marginTop: 18, padding: "10px 14px", borderRadius: 10, background: "#fee2e2", color: "#991b1b", fontSize: 13.5 }}>{error}</div>}
      </EditarBase>
    </>
  );
}
