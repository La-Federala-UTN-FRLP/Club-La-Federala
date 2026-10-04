import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import EditarBase from "../Base/EditarBase.jsx";
import SuccessAnimation from "../Base/SuccessAnimation.jsx";
import NiceSelect from "../../Base/NiceSelect.jsx";
import { createReserva } from "../../../lib/api/reservas.js";
import { getAllInmobiliarias } from "../../../lib/api/inmobiliarias.js";
import { getAllPersonas } from "../../../lib/api/personas.js";
import { getAllLotes } from "../../../lib/api/lotes.js";
import PersonaSearchSelect from "../Lotes/PersonaSearchSelect.jsx";
import { useAuth } from "../../../app/providers/AuthProvider.jsx";
import { isLoteReservable } from "../../../utils/loteStates.js";
import { reservaCreateSchema } from "../../../lib/validations/reservaCreate.schema.js";

// Límite de años para el plazo de reserva (Inmobiliaria)
const MAX_YEARS_INMOBILIARIA = 1;

/* -------------------------- Helpers fechas -------------------------- */
function toDateInputValue(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromDateInputToISO(s) {
  if (!s) return null;
  if (s instanceof Date) {
      if (Number.isNaN(s.getTime())) return null;
      // Si ya es date, extraer YYYY-MM-DD para forzar las 12:00
      const yyyy = s.getFullYear();
      const mm = String(s.getMonth() + 1).padStart(2, "0");
      const dd = String(s.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      return new Date(`${dateStr}T12:00:00.000Z`).toISOString();
  }
  if (typeof s !== 'string' || !s.trim()) return null;
  
  // Intenta forzar 12:00 UTC
  // Si viene como "YYYY-MM-DD"
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) {
       const d = new Date(`${s}T12:00:00.000Z`);
       if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  
  // Fallback: parseo simple
  const d2 = new Date(s);
  return Number.isNaN(d2.getTime()) ? null : d2.toISOString();
}

/* ========================================================================== */
export default function ReservaCrearCard({
  open,
  onCancel,
  onCreated,
  loteIdPreSeleccionado, // Opcional: si viene desde el módulo de lotes
  entityType = "Reserva",
  fromSidePanel = false, // Si viene del side panel, el lote debe estar freezado
  lockLote = false, // Si viene desde fila del tablero, bloquear el campo lote
}) {
  const { user } = useAuth();
  const isInmobiliaria = user?.role === "INMOBILIARIA";

  // Calcular fecha máxima permitida para inmobiliaria (Hoy + MAX_YEARS_INMOBILIARIA)
  const maxDateInmob = useMemo(() => {
    if (!isInmobiliaria) return null;
    const d = new Date();
    d.setFullYear(d.getFullYear() + MAX_YEARS_INMOBILIARIA);
    return toDateInputValue(d);
  }, [isInmobiliaria]);

  // Estados de datos
  const [lotes, setLotes] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [inmobiliarias, setInmobiliarias] = useState([]);
  const [loadingLotes, setLoadingLotes] = useState(false);
  const [loadingPersonas, setLoadingPersonas] = useState(false);
  const [loadingInmobiliarias, setLoadingInmobiliarias] = useState(false);

  // Estados de UI
  const [saving, setSaving] = useState(false);
  const [generalError, setGeneralError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [busquedaLote, setBusquedaLote] = useState("");
  const [numeroError, setNumeroError] = useState(null); // Error específico de duplicado backend

  // React Hook Form
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    formState: { errors },
    control,
  } = useForm({
    resolver: zodResolver(reservaCreateSchema),
    defaultValues: {
      fecha: toDateInputValue(new Date()),
      plazoReserva: toDateInputValue(new Date()),
      loteId: loteIdPreSeleccionado ? Number(loteIdPreSeleccionado) : undefined,
      clienteId: undefined,
      inmobiliariaId: undefined,
      ofertaInicial: undefined,
      montoSeña: undefined,
      numero: "",
      userRole: user?.role, // Para validación condicional en Zod
    },
    mode: "onChange",
  });

  const formValues = watch();

  // Calcular el mapId del lote seleccionado cuando viene del side panel o desde fila
  const loteSeleccionadoMapId = useMemo(() => {
    if ((!fromSidePanel && !lockLote) || !formValues.loteId) return null;
    const loteSeleccionado = lotes.find((l) => String(l.id) === String(formValues.loteId));
    if (!loteSeleccionado) return null;
    const mapId = loteSeleccionado.mapId;
    if (!mapId) return null;
    return String(mapId).toLowerCase().startsWith("lote")
      ? mapId
      : `Lote ${mapId}`;
  }, [fromSidePanel, lockLote, formValues.loteId, lotes]);

  // Cargar datos al abrir
  useEffect(() => {
    if (!open) return;

    // Actualizar role en form si cambia (raro, pero correcto)
    setValue("userRole", user?.role);

    // Cargar lotes disponibles (solo DISPONIBLE)
    if (lotes.length === 0) {
      setLoadingLotes(true);
      (async () => {
        try {
          const resp = await getAllLotes({});
          const lotesData = resp?.data || [];
          // Filtrar solo lotes reservables
          let filteredLots = lotesData.filter((l) => isLoteReservable(l.estado || l.status));

          // Si lockLote es true y hay loteIdPreSeleccionado, asegurar que el lote esté en el array
          if (lockLote && loteIdPreSeleccionado) {
            const lotePrecargado = lotesData.find(
              (l) => String(l.id) === String(loteIdPreSeleccionado),
            );
            if (
              lotePrecargado &&
              !filteredLots.find(
                (l) => String(l.id) === String(lotePrecargado.id),
              )
            ) {
              filteredLots = [lotePrecargado, ...filteredLots];
            }
          }
          setLotes(filteredLots);
        } catch (err) {
          console.error("Error cargando lotes:", err);
        } finally {
          setLoadingLotes(false);
        }
      })();
    }

    // Cargar personas
    if (personas.length === 0) {
      setLoadingPersonas(true);
      (async () => {
        try {
          const resp = await getAllPersonas({});
          const personasData =
            resp?.personas ?? resp?.data ?? (Array.isArray(resp) ? resp : []);
          setPersonas(Array.isArray(personasData) ? personasData : []);
        } catch (err) {
          console.error("Error cargando personas:", err);
        } finally {
          setLoadingPersonas(false);
        }
      })();
    }

    // Cargar inmobiliarias
    if (!isInmobiliaria && inmobiliarias.length === 0) {
      setLoadingInmobiliarias(true);
      (async () => {
        try {
          const resp = await getAllInmobiliarias({});
          const inmobData = resp?.data || resp?.inmobiliarias || [];
          const inmobNormalizadas = inmobData.map((i) => ({
            value: String(i.id),
            label: i.nombre || `ID: ${i.id}`,
            inmobiliaria: i,
          }));
          setInmobiliarias(inmobNormalizadas);
        } catch (err) {
          console.error("Error cargando inmobiliarias:", err);
        } finally {
          setLoadingInmobiliarias(false);
        }
      })();
    }
  }, [open, isInmobiliaria, user, lotes.length, personas.length, inmobiliarias.length, lockLote, loteIdPreSeleccionado]);

  // Resetear al abrir/cerrar
  useEffect(() => {
    if (!open) {
      reset({
        fecha: toDateInputValue(new Date()),
        plazoReserva: toDateInputValue(new Date()),
        loteId: undefined, // Resetear loteId
        clienteId: undefined,
        inmobiliariaId: undefined,
        ofertaInicial: undefined,
        montoSeña: undefined,
        numero: "",
        userRole: user?.role,
      });
      setGeneralError(null);
      setNumeroError(null);
      setBusquedaLote("");
    } else if (loteIdPreSeleccionado) {
      // Si se abre con preselección
      setValue("loteId", Number(loteIdPreSeleccionado));
    }
  }, [open, loteIdPreSeleccionado, reset, user, setValue, lotes, formValues.loteId, fromSidePanel, lockLote]);

  // Filtrar lotes según búsqueda
  const lotesFiltrados = useMemo(() => {
    const q = busquedaLote.trim().toLowerCase();
    if (!q) return [];
    return lotes.filter((l) => {
      const mapId = String(l.mapId || "").toLowerCase();
      const numero = String(l.numero || "").toLowerCase();
      const id = String(l.id || l.loteId || "").toLowerCase();
      const textoLote = `Lote ${l.mapId || l.numero || l.id}`.toLowerCase();
      const calle = String(
        l.ubicacion?.calle || l.location || "",
      ).toLowerCase();
      return (
        mapId.includes(q) ||
        numero.includes(q) ||
        id.includes(q) ||
        textoLote.includes(q) ||
        calle.includes(q)
      );
    });
  }, [busquedaLote, lotes]);

  // --- EFFECT REMOVED (Validation moved to onSubmit) ---

  // Calcular ancho de labels

  // Calcular ancho de labels
  const LABELS = [
    "N° RESERVA",
    "LOTE",
    "FECHA RESERVA",
    "COMPRADOR",
    "INMOBILIARIA",
    "PLAZO RESERVA",
    "OFERTA INICIAL",
    "MONTO RESERVA/SEÑA",
  ];
  const computedLabelWidth = Math.min(
    260,
    Math.max(
      160,
      Math.round(Math.max(...LABELS.map((l) => l.length)) * 8.2) + 22,
    ),
  );

  // --- PRIORITY VALIDATION FUNCTION ---
  const validatePriority = (data) => {
    const selectedLote = lotes.find(l => String(l.id) === String(data.loteId));
    if (!selectedLote) return true; // No lot selected, let required validation handle it
    
    const estado = String(selectedLote.estado || selectedLote.status || '').toUpperCase();
    if (estado !== 'CON_PRIORIDAD') return true; // Not a priority lot
    
    const prioridad = selectedLote.prioridades?.[0];
    if (!prioridad) return true; // No priority data (should not happen but graceful fallback)
    
    // Handle INMOBILIARIA priority type
    if (String(prioridad.ownerType) === 'INMOBILIARIA') {
      let myInmoId = null;
      
      if (isInmobiliaria) {
        // For INMOBILIARIA users, use their fixed inmobiliariaId
        myInmoId = user?.inmobiliariaId;
      } else {
        // For Admin/Gestor, use the selected inmobiliariaId from form
        myInmoId = data.inmobiliariaId ? Number(data.inmobiliariaId) : null;
      }
      
      const priorityInmoId = prioridad.inmobiliariaId ? Number(prioridad.inmobiliariaId) : null;
      
      // If IDs don't match, show error
      if (priorityInmoId && myInmoId !== priorityInmoId) {
        const fieldName = isInmobiliaria ? 'loteId' : 'inmobiliariaId';
        const inmobiliariaName = prioridad.inmobiliaria?.nombre || 'otra inmobiliaria';
        setError(fieldName, {
          type: 'manual',
          message: `Este lote tiene prioridad exclusiva para ${inmobiliariaName}.`
        });
        return false;
      }
    } 
    // Handle CCLF priority type
    else if (String(prioridad.ownerType) === 'CCLF') {
      if (isInmobiliaria) {
        setError('loteId', {
          type: 'manual',
          message: 'Este lote tiene prioridad reservada a Administración Central.'
        });
        return false;
      }
    }
    
    return true;
  };

  const onSubmit = async (data) => {
    setGeneralError(null);
    setNumeroError(null);
    
    // Validate priority before processing
    if (!validatePriority(data)) {
      return; // Stop submission if validation fails
    }

    setSaving(true);
    
    // --- VALIDACION DE PRIORIDAD (OnSubmit) Revertida a solitud del usuario
    // Confiamos en el backend

    const numeroTrim = String(data.numero || "").trim();

    try {
      // Formatear fechas a ISO con hora fija (12:00 UTC) vía helper seguro
      const fechaReservaISO = fromDateInputToISO(data.fecha);
      if (!fechaReservaISO) {
          setError("fecha", { type: "manual", message: "Fecha inválida (verifique formato)" });
          setSaving(false);
          return;
      }

      const fechaFinReservaISO = fromDateInputToISO(data.plazoReserva);
      if (!fechaFinReservaISO) {
          setError("plazoReserva", { type: "manual", message: "Fecha inválida (verifique formato)" });
          setSaving(false);
          return;
      }

        const safeNumber = (val) => {
           if (!val) return 0;
           const n = Number(val);
           return Number.isNaN(n) ? 0 : n;
        };
        
        const payload = {
        fechaReserva: fechaReservaISO, 
        loteId: Number(data.loteId),
        clienteId: Number(data.clienteId),
        // Para INMOBILIARIA: no enviar inmobiliariaId
        ...(isInmobiliaria
          ? {}
          : {
              inmobiliariaId: data.inmobiliariaId ? Number(data.inmobiliariaId) : undefined,
            }),
        ofertaInicial: safeNumber(data.ofertaInicial),
        seña: data.montoSeña !== undefined && data.montoSeña !== "" ? safeNumber(data.montoSeña) : undefined, 
        numero: numeroTrim,
        fechaFinReserva: fechaFinReservaISO,
      };

      console.log("📤 Payload Reserva:", payload);
      const response = await createReserva(payload);

      if (!response || !response.success) {
        throw new Error(response?.message || "Error al crear la reserva");
      }

      setShowSuccess(true);
      onCreated?.(response.data);

      setTimeout(() => {
        setShowSuccess(false);
        setSaving(false);
        onCancel?.();
      }, 1500);

    } catch (err) {
      console.error("Error creando reserva:", err);
      let errorMessage = err?.message || "No se pudo crear la reserva.";

      // Manejo de errores de backend (similar al anterior)
      if (err?.response?.data?.errors) {
        // ... Logica de parseo de errores de array
        const errorArr = err.response.data.errors;
        const msg = Array.isArray(errorArr) ? errorArr.map(e => e.message || e).join(", ") : String(errorArr);
          if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("exist")) {
             setNumeroError("Ya existe una reserva con este número");
          }
           errorMessage = msg;
      } else if (err?.response?.data?.message) {
         if (err.response.data.message.toLowerCase().includes("numero")) {
           setNumeroError("Ya existe una reserva con este número");
         }
         errorMessage = err.response.data.message;
      }

      setGeneralError(errorMessage);
      setSaving(false);
    }
  };

  const shouldRender = open || showSuccess;
  if (!shouldRender) return null;

  return (
    <>
      <SuccessAnimation
        show={showSuccess}
        message={`¡${entityType} creada exitosamente!`}
      />

      <EditarBase
        open={open}
        title="Registrar Reserva"
        onCancel={() => {
          if (showSuccess) return;
          onCancel?.();
        }}
        onSave={handleSubmit(onSubmit)}
        saving={saving}
        saveButtonText="Confirmar Reserva"
        headerRight={
          loadingLotes ||
          loadingPersonas ||
          (!isInmobiliaria && loadingInmobiliarias) ? (
            <span className="badge bg-warning text-dark">Cargando...</span>
          ) : null
        }
      >
        <div>
          <h3 className="venta-section-title" style={{ paddingBottom: "6px", marginBottom: "18px" }}>
            Información de la Reserva
          </h3>
          <div className="venta-grid" style={{ ["--sale-label-w"]: `${computedLabelWidth}px` }}>

            {/* Columna Izquierda */}
            <div className="venta-col">
              {/* LOTE */}
              <div className={`fieldRow ${errors.loteId ? "hasError" : ""}`}>
                <div className="field-row">
                  <div className="field-label">LOTE</div>
                  {(fromSidePanel || lockLote) && loteSeleccionadoMapId ? (
                    <div className="field-value is-readonly">{loteSeleccionadoMapId}</div>
                  ) : fromSidePanel || lockLote ? (
                     <div className="field-value is-readonly">—</div>
                  ) : (
                    <div className="field-value p0">
                       <div style={{ position: "relative", width: "100%" }}>
                         <input
                           className={`field-input ${errors.loteId ? "is-invalid" : ""}`}
                           placeholder={formValues.loteId ? "" : "Buscar lote por número o calle"}
                           value={
                             formValues.loteId && !busquedaLote
                               ? (() => {
                                   const l = lotes.find(x => String(x.id) === String(formValues.loteId));
                                   if (!l) return "";
                                   // Formatter logic consistent with other views
                                   const raw = String(l.mapId || l.numero || l.id).trim();
                                   const match = raw.match(/^Lote\s*(\d+)-(\d+)$/i);
                                   if (match) return `Lote ${match[2]}-${match[1]}`;
                                   if (raw.toLowerCase().startsWith('lote')) return raw;
                                   return `Lote ${raw}`;
                                 })()
                               : busquedaLote
                           }
                           onChange={(e) => {
                             setBusquedaLote(e.target.value);
                             if (e.target.value && formValues.loteId) {
                               setValue("loteId", undefined);
                             }
                           }}
                           onFocus={() => {
                             if (formValues.loteId) {
                               setBusquedaLote("");
                               setValue("loteId", undefined);
                             }
                           }}
                         />
                         {/* Search Icon */}
                         <svg
                            width="18" height="18" viewBox="0 0 24 24"
                            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.6 }}
                          >
                            <circle cx="11" cy="11" r="7" stroke="#666" strokeWidth="2" fill="none" />
                            <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#666" strokeWidth="2" />
                          </svg>

                          {/* Dropdown */}
                          {busquedaLote && (
                            <div style={{
                                marginTop: 8, maxHeight: 220, overflowY: "auto", overflowX: "hidden",
                                border: "1px solid #e5e7eb", borderRadius: 8, position: "absolute", width: "100%", zIndex: 1000, background: "#fff"
                              }}>
                                {lotesFiltrados.length === 0 && (
                                  <div style={{ padding: 10, color: "#6b7280" }}>No se encontraron lotes</div>
                                )}
                                {lotesFiltrados.map((l) => {
                                  const raw = String(l.mapId || l.numero || l.id).trim();
                                  let displayText = raw;
                                  const match = raw.match(/^Lote\s*(\d+)-(\d+)$/i);
                                  if (match) displayText = `Lote ${match[2]}-${match[1]}`;
                                  else if (!raw.toLowerCase().startsWith('lote')) displayText = `Lote ${raw}`;

                                  return (
                                    <button
                                      key={l.id} type="button"
                                      onClick={() => {
                                        setValue("loteId", l.id, { shouldValidate: true });
                                        setBusquedaLote("");
                                      }}
                                      style={{
                                        display: "block", width: "100%", textAlign: "left", padding: "10px 12px",
                                        background: "#fff", border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer"
                                      }}
                                      onMouseEnter={(e) => e.target.style.background = "#f9fafb"}
                                      onMouseLeave={(e) => e.target.style.background = "#fff"}
                                    >
                                      {displayText} <span style={{ color: "#6b7280" }}>({String(l.estado || l.status)})</span>
                                    </button>
                                  );
                                })}
                            </div>
                          )}
                       </div>
                    </div>
                  )}
                </div>
                {errors.loteId && <div className="fieldError">{errors.loteId.message}</div>}
              </div>

              {/* FECHA */}
              <div className={`fieldRow ${errors.fecha ? "hasError" : ""}`}>
                <div className="field-row">
                  <div className="field-label">FECHA</div>
                  <div className="field-value p0">
                    <input
                      className={`field-input ${errors.fecha ? "is-invalid" : ""}`}
                      type="date"
                      {...register("fecha")}
                    />
                  </div>
                </div>
                {errors.fecha && <div className="fieldError">{errors.fecha.message}</div>}
              </div>

              {/* COMPRADOR */}
              <div className={`fieldRow ${errors.clienteId ? "hasError" : ""}`}>
                <Controller
                  name="clienteId"
                  control={control}
                  render={({ field: { onChange, value } }) => (
                    <PersonaSearchSelect
                      label="COMPRADOR"
                      value={value ? String(value) : ""}
                      onSelect={(val) => onChange(val ? Number(val) : "")}
                      personas={personas}
                      loading={loadingPersonas}
                      placeholder="Buscar por nombre, apellido o DNI"
                      error={errors.clienteId?.message}
                    />
                  )}
                />
                 {errors.clienteId && <div className="fieldError">{errors.clienteId.message}</div>}
              </div>

              {/* INMOBILIARIA */}
              <div className={`fieldRow ${errors.inmobiliariaId ? "hasError" : ""}`}>
                 <div className="field-row">
                    <div className="field-label">INMOBILIARIA</div>
                    {isInmobiliaria ? (
                        <div className="field-value is-readonly">{user?.inmobiliariaNombre || ""}</div>
                    ) : (
                        <div className="field-value p0">
                            <Controller
                                name="inmobiliariaId"
                                control={control}
                                render={({ field: { onChange, value } }) => (
                                    <NiceSelect
                                        value={value ? String(value) : ""}
                                        options={inmobiliarias}
                                        placeholder="Seleccionar inmobiliaria"
                                        onChange={(val) => onChange(val ? Number(val) : undefined)}
                                    />
                                )}
                            />
                        </div>
                    )}
                 </div>
                 {errors.inmobiliariaId && <div className="fieldError">{errors.inmobiliariaId.message}</div>}
              </div>
            </div>

            {/* Columna Derecha */}
            <div className="venta-col">
              {/* NUMERO RESERVA */}
              <div className={`fieldRow ${errors.numero || numeroError ? "hasError" : ""}`}>
                <div className="field-row">
                  <div className="field-label">NÚMERO DE RESERVA</div>
                  <div className="field-value p0">
                     <input
                        className={`field-input ${errors.numero || numeroError ? "is-invalid" : ""}`}
                        type="text"
                        placeholder="Ej: RES-2025-01"
                        {...register("numero")}
                        onChange={(e) => {
                             register("numero").onChange(e); // Mantener hook form
                             if (numeroError) setNumeroError(null);
                        }}
                     />
                  </div>
                </div>
                {(errors.numero || numeroError) && (
                    <div className="fieldError">{numeroError || errors.numero?.message}</div>
                )}
              </div>

               {/* PLAZO RESERVA */}
               <div className={`fieldRow ${errors.plazoReserva ? "hasError" : ""}`}>
                 <div className="field-row">
                   <div className="field-label">PLAZO RESERVA</div>
                   <div className="field-value p0">
                     <input
                       className={`field-input ${errors.plazoReserva ? "is-invalid" : ""}`}
                       type="date"
                       {...register("plazoReserva")}
                       max={isInmobiliaria ? maxDateInmob : undefined}
                     />
                   </div>
                 </div>
                 {errors.plazoReserva && <div className="fieldError">{errors.plazoReserva.message}</div>}
               </div>

                {/* OFERTA INICIAL */}
                <div className={`fieldRow ${errors.ofertaInicial ? "hasError" : ""}`}>
                    <div className="field-row">
                        <div className="field-label">OFERTA INICIAL</div>
                        <div className="field-value p0" style={{ display: "flex", alignItems: "center", gap: "8px", position: "relative" }}>
                             <input
                                className={`field-input ${errors.ofertaInicial ? "is-invalid" : ""}`}
                                type="number"
                                inputMode="decimal"
                                step="100"
                                placeholder="0"
                                style={{ flex: 1, paddingRight: "50px" }}
                                {...register("ofertaInicial")}
                             />
                             <span style={{ position: "absolute", right: "12px", color: "#6B7280", fontSize: "13.5px", fontWeight: 500 }}>USD</span>
                        </div>
                    </div>
                    {errors.ofertaInicial && <div className="fieldError">{errors.ofertaInicial.message}</div>}
                </div>

                {/* MONTO SEÑA */}
                <div className={`fieldRow ${errors.montoSeña ? "hasError" : ""}`}>
                    <div className="field-row">
                        <div className="field-label">MONTO RESERVA/SEÑA</div>
                        <div className="field-value p0" style={{ display: "flex", alignItems: "center", gap: "8px", position: "relative" }}>
                             <input
                                className={`field-input ${errors.montoSeña ? "is-invalid" : ""}`}
                                type="number"
                                inputMode="decimal"
                                step="100"
                                placeholder="0"
                                style={{ flex: 1, paddingRight: "50px" }}
                                {...register("montoSeña")}
                             />
                             <span style={{ position: "absolute", right: "12px", color: "#6B7280", fontSize: "13.5px", fontWeight: 500 }}>USD</span>
                        </div>
                    </div>
                    {errors.montoSeña && <div className="fieldError">{errors.montoSeña.message}</div>}
                </div>
            </div>
          </div>
        </div>

        {generalError && (
          <div className="lote-error-global">
            {generalError}
          </div>
        )}
      </EditarBase>
    </>
  );
}
