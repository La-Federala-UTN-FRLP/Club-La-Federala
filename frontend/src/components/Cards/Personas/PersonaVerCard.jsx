import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getPersona } from "../../../lib/api/personas";
import { getLoteById } from "../../../lib/api/lotes";
import { getReservaById } from "../../../lib/api/reservas";
import { getVentaById } from "../../../lib/api/ventas";
import { useAuth } from "../../../app/providers/AuthProvider";
import { can, PERMISSIONS } from "../../../lib/auth/rbac";
import { canEditByEstadoOperativo } from "../../../utils/estadoOperativo";
import { extractEmail, extractTelefono } from "../../../utils/personaContacto";
import LoteVerCard from "../Lotes/LoteVerCard";
import ReservaVerCard from "../Reservas/ReservaVerCard";
import VentaVerCard from "../Ventas/VentaVerCard";

/** PersonaVerCard */
export default function PersonaVerCard({
  open,
  onClose,
  onEdit,
  persona,
  personaId,
  personas,
}) {
  const { user } = useAuth();
  const userRole = (user?.role ?? user?.rol ?? "ADMIN").toString().trim().toUpperCase();
  const isAdminOrGestor = userRole === "ADMINISTRADOR" || userRole === "GESTOR";

  const [detalleCompleto, setDetalleCompleto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openAccordions, setOpenAccordions] = useState({});
  
  // Estados para modales de Ver Lote/Reserva/Venta
  const [openLoteVer, setOpenLoteVer] = useState(false);
  const [loteSeleccionado, setLoteSeleccionado] = useState(null);
  const [openReservaVer, setOpenReservaVer] = useState(false);
  const [reservaSeleccionada, setReservaSeleccionada] = useState(null);
  const [openVentaVer, setOpenVentaVer] = useState(false);
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  
  // Estado para modal de edición
  const [openEditar, setOpenEditar] = useState(false);
  
  const isInmobiliaria = userRole === "INMOBILIARIA";


  // Cargar datos completos cuando se abre el card
  useEffect(() => {
    let abort = false;
    async function run() {
      if (!open) {
        setDetalleCompleto(null);
        setOpenAccordions({});
        return;
      }

      // INMOBILIARIA: GET /personas/:id no la acepta (D6 de la matriz RBAC); el detalle usa solo los datos de la lista.
      if (isInmobiliaria) {
        const deLista = persona ?? (personaId != null && Array.isArray(personas)
          ? personas.find(p => `${p.id}` === `${personaId}`) ?? null
          : null);
        if (!abort) setDetalleCompleto(deLista);
        return;
      }

      const idToUse = persona?.id ?? personaId;

      if (idToUse != null) {
        try {
          setLoading(true);
          const full = await getPersona(idToUse);
          if (!abort && full) {
            setDetalleCompleto(full);
          }
        } catch (e) {
          console.error("Error obteniendo persona por id:", e);
          if (persona && !abort) {
            setDetalleCompleto(persona);
          } else if (personaId != null && Array.isArray(personas) && !abort) {
            const found = personas.find(p => `${p.id}` === `${personaId}`);
            if (found) {
              setDetalleCompleto(found);
            }
          }
        } finally {
          if (!abort) setLoading(false);
        }
      } else if (persona) {
        if (!abort) setDetalleCompleto(persona);
      }
    }
    run();
    return () => { abort = true; };
  }, [open, persona?.id, personaId, persona, personas, isInmobiliaria]);

  const pers = useMemo(() => {
    if (detalleCompleto) return detalleCompleto;
    if (persona) return persona;
    if (personaId != null && Array.isArray(personas)) {
      return personas.find((p) => `${p.id}` === `${personaId}`) || null;
    }
    return null;
  }, [detalleCompleto, persona, personaId, personas]);

  const NA = "—"; // por si no hay

  // DisplayName: razonSocial o nombre+apellido
  const displayName = pers?.razonSocial 
    ? pers.razonSocial 
    : `${pers?.nombre || ''} ${pers?.apellido || ''}`.trim() || NA;

  // Identificador formateado
  const identificadorTexto = pers?.identificadorTipo && pers?.identificadorValor
    ? `${pers.identificadorTipo} ${pers.identificadorValor}`
    : NA;

  // Cliente de: inmobiliaria.nombre o "La Federala"
  const clienteDe = pers?.inmobiliaria?.nombre || "La Federala";

  // Extraer teléfono y email usando helpers centralizados
  const telefono = extractTelefono(pers?.telefono, pers?.contacto);
  const email = extractEmail(pers?.email, pers?.contacto);
  
  const telefonoTexto = telefono || "Sin información";
  const emailTexto = email || "Sin información";

  // Counts
  const countLotesPropios = pers?._count?.lotesPropios ?? 0;
  const countLotesAlquilados = pers?._count?.alquileres ?? pers?._count?.lotesAlquilados ?? 0;
  const countReservas = pers?._count?.Reserva ?? 0;
  const countVentas = pers?._count?.Venta ?? 0;

  // Arrays para mini detalles
  const lotesPropios = pers?.lotesPropios || [];
  const lotesAlquilados = pers?.alquileresActivos || pers?.lotesAlquilados || [];
  const reservas = pers?.reservas || [];
  const ventas = pers?.ventas || [];

  // Grupo familiar
  const jefeDeFamilia = pers?.jefeDeFamilia;
  const miembrosFamilia = pers?.miembrosFamilia || [];

  const getDisplayName = (miembro) => {
    if (!miembro) return NA;
    const nombreCompleto = `${miembro.nombre || ''} ${miembro.apellido || ''}`.trim();
    return nombreCompleto || NA;
  };

  // Helper para formatear texto de lote: "Lote 20 - 3" (como en Ver Lote dsp por ahi cambiarlo si hacemos el cambio a Lote FR - N°)
  const formatLoteTexto = (lote) => {
    const num = lote.numero != null ? `Lote ${lote.numero}` : 'Lote —';
    const fraccion = lote.fraccionNumero != null ? ` - ${lote.fraccionNumero}` : '';
    return `${num}${fraccion}`;
  };

  // Helper para formatear texto de reserva
  const formatReservaTexto = (reserva) => {
    if (reserva.numero) return `Reserva ${reserva.numero}`;
    if (reserva.createdAt) {
      const date = new Date(reserva.createdAt);
      return `Reserva ${date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    }
    return 'Reserva';
  };

  // Helper para formatear texto de venta
  const formatVentaTexto = (venta) => {
    return venta.numero ? `Venta ${venta.numero}` : 'Venta';
  };

  // Abrir modales de Ver sin navegar con transición suave
  const handleVerLote = async (loteId) => {
    try {
      const response = await getLoteById(loteId);
      const lote = response?.data ?? response;
      if (lote) {
        setLoteSeleccionado(lote);
        // Pequeño delay para transición suave
        setTimeout(() => {
          setOpenLoteVer(true);
        }, 50);
      }
    } catch (e) {
      console.error("Error obteniendo lote por id:", e);
    }
  };

  const handleVerReserva = async (reservaId) => {
    try {
      const response = await getReservaById(reservaId);
      const reserva = response?.data ?? response;
      if (reserva) {
        setReservaSeleccionada(reserva);
        setOpenReservaVer(true);
      }
    } catch (e) {
      console.error("Error obteniendo reserva por id:", e);
    }
  };

  const handleVerVenta = async (ventaId) => {
    try {
      const response = await getVentaById(ventaId);
      const venta = response?.data ?? response;
      if (venta) {
        setVentaSeleccionada(venta);
        setOpenVentaVer(true);
      }
    } catch (e) {
      console.error("Error obteniendo venta por id:", e);
    }
  };

  // Toggle accordion
  const toggleAccordion = (key) => {
    setOpenAccordions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Handler para abrir modal de edición (usa el callback del padre)
  const handleEditarPersona = () => {
    // RBAC: INMOBILIARIA solo puede editar sus clientes
    if (isInmobiliaria && pers?.inmobiliariaId !== user?.inmobiliariaId) {
      alert("No puede editar personas que no son sus clientes.");
      return;
    }
    // Usar el callback del padre para abrir el modal de edición
    if (onEdit && typeof onEdit === 'function' && pers) {
      onEdit(pers);
    }
  };

  // Componente reutilizable para accordion de asociación
  const AssociationAccordion = ({ 
    title, 
    count, 
    items, 
    emptyText, 
    onView, 
    viewLabel,
    formatItem,
    formatSecondary,
    canView 
  }) => {
    if (!canView) return null;

    const key = title.toLowerCase().replace(/\s+/g, '_');
    const isOpen = openAccordions[key] || false;

    return (
      <div className="card" style={{ marginBottom: '4px', marginTop: '0', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => toggleAccordion(key)}
          className="d-flex justify-content-between align-items-center w-100"
          style={{
            padding: '12px 16px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          <div className="d-flex align-items-center gap-2">
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
              {title}
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
              ({count})
            </span>
          </div>
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        
        {isOpen && (
          <div style={{ borderTop: '1px solid #e5e7eb', maxHeight: '300px', overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: '16px', fontSize: '0.875rem', color: '#6B7280', textAlign: 'center' }}>
                {emptyText}
              </div>
            ) : (
              <div className="d-flex flex-column">
                {items.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="d-flex justify-content-between align-items-center"
                    style={{
                      padding: '12px 16px',
                      borderBottom: idx < items.length - 1 ? '1px solid #f3f4f6' : 'none'
                    }}
                  >
                    <div className="d-flex flex-column" style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.875rem', color: '#111827', fontWeight: 500 }}>
                        {formatItem(item)}
                      </span>
                      {formatSecondary && formatSecondary(item) && (
                        <span style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '4px' }}>
                          {formatSecondary(item)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="cclf-tab thin"
                      style={{
                        fontSize: '0.875rem',
                        padding: '6px 16px',
                        marginLeft: '12px',
                        flexShrink: 0,
                        border: '1px solid rgba(0,0,0,.85)',
                        borderRadius: '6px',
                        background: '#EBB648',
                        fontWeight: 500,
                        color: '#111827',
                        cursor: 'pointer',
                        transition: '200ms ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#cb9828';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#EBB648';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onView(item.id);
                      }}
                    >
                      {viewLabel}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Configuración de accordions
  const accordionsConfig = useMemo(() => {
    const canViewLotes = can(user, PERMISSIONS.LOT_VIEW);
    const canViewReservas = can(user, PERMISSIONS.RES_VIEW);
    const canViewVentas = can(user, PERMISSIONS.SALE_VIEW);

    const secciones = [
      {
        title: "PROPIETARIO",
        count: countLotesPropios,
        items: lotesPropios,
        emptyText: "Sin lotes propios",
        onView: handleVerLote,
        viewLabel: "Ver Lote",
        formatItem: formatLoteTexto,
        formatSecondary: null,
        canView: canViewLotes
      },
      {
        title: "INQUILINO",
        count: countLotesAlquilados,
        items: lotesAlquilados,
        emptyText: "Sin lotes alquilados",
        onView: handleVerLote,
        viewLabel: "Ver Lote",
        formatItem: formatLoteTexto,
        formatSecondary: null,
        canView: canViewLotes
      },
      {
        title: "RESERVAS",
        count: countReservas,
        items: reservas,
        emptyText: "Sin reservas",
        onView: handleVerReserva,
        viewLabel: "Ver Reserva",
        formatItem: formatReservaTexto,
        formatSecondary: null,
        canView: canViewReservas
      },
      {
        title: "VENTAS",
        count: countVentas,
        items: ventas,
        emptyText: "Sin ventas",
        onView: handleVerVenta,
        viewLabel: "Ver Venta",
        formatItem: formatVentaTexto,
        formatSecondary: null,
        canView: canViewVentas
      }
    ];
    // INMOBILIARIA (bug QA 17): "Mis clientes" no incluye propietarios ni inquilinos, así que
    // esas secciones siempre daban 0. Solo ve Reservas con su inmobiliaria (Ventas no se dibuja: no tiene SALE_VIEW).
    return isInmobiliaria
      ? secciones.filter((s) => s.title !== "PROPIETARIO" && s.title !== "INQUILINO")
      : secciones;
  }, [
    countLotesPropios, countLotesAlquilados, countReservas, countVentas,
    lotesPropios, lotesAlquilados, reservas, ventas,
    user, isInmobiliaria
  ]);

  if (!open) return null;

  const getValueStyle = (val) => {
    return { color: val === NA ? "#6B7280" : "#111827" };
  };

  // Determinar si hay algún modal abierto
  const hasModalOpen = openLoteVer || openReservaVer || openVentaVer;

  return (
    <>
      {/* Card principal de Persona */}
      <div 
        className="cclf-overlay" 
        onClick={onClose}
        style={{ 
          zIndex: hasModalOpen ? 2600 : 2601
        }}
      >
        <div
          className="cclf-card"
          onClick={(e) => e.stopPropagation()}
          style={{ 
            maxWidth: '900px', 
            width: '90%',
            opacity: hasModalOpen ? 0.3 : 1,
            pointerEvents: hasModalOpen ? 'none' : 'auto'
          }}
        >
          <div className="cclf-card__header">
            <h2 className="cclf-card__title">{displayName}</h2>
            <div className="cclf-card__actions">
              {can(user, PERMISSIONS.PEOPLE_EDIT) && canEditByEstadoOperativo(pers) && (
                <button
                  type="button"
                  className="cclf-tab thin"
                  onClick={handleEditarPersona}
                >
                  Editar Persona
                </button>
              )}
              <button type="button" className="cclf-btn-close" onClick={onClose}>
                <span className="cclf-btn-close__x">×</span>
              </button>
            </div>
          </div>

          <div className="cclf-card__body">
            {loading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#6b7280" }}>
                Cargando información de la persona...
              </div>
            ) : (
              <>
                <h3 className="venta-section-title">Información de la persona</h3>

                {/* Grid responsive para información superior */}
                <div 
                  className="row g-3"
                  style={{ marginTop: '8px', marginBottom: '20px' }}
                >
                  {/* Fila 1: Nombre Completo | Identificador */}
                  <div className="col-md-6">
                    <div className="field-row">
                      <div className="field-label">NOMBRE COMPLETO</div>
                      <div className="field-value" style={getValueStyle(displayName)}>
                        {displayName}
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="field-row">
                      <div className="field-label">IDENTIFICADOR</div>
                      <div className="field-value" style={getValueStyle(identificadorTexto)}>
                        {identificadorTexto}
                      </div>
                    </div>
                  </div>
                  
                  {/* Fila 2: Estado | Cliente de */}
                  {isAdminOrGestor && (
                    <div className="col-md-6">
                      <div className="field-row">
                        <div className="field-label">ESTADO</div>
                        <div className="field-value" style={getValueStyle(pers?.estado || "OPERATIVO")}>
                          {pers?.estado || "OPERATIVO"}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="col-md-6">
                    <div className="field-row">
                      <div className="field-label">CLIENTE DE</div>
                      <div 
                        className="field-value" 
                        style={{
                          ...getValueStyle(clienteDe),
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={clienteDe}
                      >
                        {clienteDe}
                      </div>
                    </div>
                  </div>
                  
                  {/* Fila 3: Teléfono | Mail */}
                  <div className="col-md-6">
                    <div className="field-row">
                      <div className="field-label">TELÉFONO</div>
                      <div className="field-value" style={getValueStyle(telefonoTexto === "Sin información" ? null : telefonoTexto)}>
                        {telefonoTexto}
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="field-row">
                      <div className="field-label">MAIL</div>
                      <div className="field-value" style={getValueStyle(emailTexto === "Sin información" ? null : emailTexto)}>
                        {emailTexto}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Asociaciones en accordions 2x2 */}
                <h3 className="venta-section-title" style={{ marginTop: "24px", fontSize: '1rem', marginBottom: '4px' }}>Asociaciones</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginTop: '14px' }}>
                  {accordionsConfig.map((config, idx) => (
                    <div key={config.title}>
                      <AssociationAccordion {...config} />
                    </div>
                  ))}
                </div>

                {/* Grupo Familiar */}
                {(jefeDeFamilia || miembrosFamilia.length > 0) && (
                  <>
                    <h3 className="venta-section-title" style={{ marginTop: "24px" }}>
                      Grupo Familiar
                    </h3>
                    <div className="row g-3" style={{ marginTop: '8px' }}>
                      <div className="col-md-12">
                        {jefeDeFamilia && (
                          <div className="field-row">
                            <div className="field-label">TITULAR</div>
                            <div className="field-value" style={getValueStyle(getDisplayName(jefeDeFamilia))}>
                              {getDisplayName(jefeDeFamilia)}
                            </div>
                          </div>
                        )}
                        {miembrosFamilia.length > 0 && (
                          <div className="field-row" style={{ marginTop: '12px' }}>
                            <div className="field-label">MIEMBROS</div>
                            <div className="field-value" style={getValueStyle("")}>
                              <div className="d-flex flex-column gap-1">
                                {miembrosFamilia.map((miembro, idx) => (
                                  <div key={miembro.idPersona || idx}>
                                    {getDisplayName(miembro)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>


      {/* Modal Ver Lote - se renderiza encima del PersonaVerCard con z-index mayor */}
      {openLoteVer && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            zIndex: 2700,
            animation: 'fadeIn 200ms ease-in-out'
          }}
        >
          <style>{`
            @keyframes fadeIn {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }
          `}</style>
          <LoteVerCard
            open={true}
            onClose={() => {
              setOpenLoteVer(false);
              setLoteSeleccionado(null);
            }}
            onEdit={null} // No permitir editar desde aquí
            onReserve={null} // No permitir reservar desde aquí
            onOpenDocument={null}
            lote={loteSeleccionado}
            loteId={loteSeleccionado?.id}
            lotes={[]}
          />
        </div>
      )}

      {/* Modal Ver Reserva */}
      {openReservaVer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2700 }}>
          <ReservaVerCard
            open={true}
            onClose={() => {
              setOpenReservaVer(false);
              setReservaSeleccionada(null);
            }}
            onEdit={null} // No permitir editar desde aquí
            reserva={reservaSeleccionada}
            reservas={[]}
            fromSidePanel={true}
          />
        </div>
      )}

      {/* Modal Ver Venta */}
      {openVentaVer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2700 }}>
          <VentaVerCard
            open={true}
            onClose={() => {
              setOpenVentaVer(false);
              setVentaSeleccionada(null);
            }}
            onEdit={null} // No permitir editar desde aquí
            venta={ventaSeleccionada}
            ventaId={ventaSeleccionada?.id}
            ventas={[]}
            fromSidePanel={true}
          />
        </div>
      )}
    </>
  );
}
