// src/pages/Reportes.jsx
// Pantalla de Reportes: pestañas Comercial / Cobranzas y selector de reporte.
// El reporte activo vive en la URL (?reporte=inventario|ventas|cuotas-vencidas) y la pestaña
// se deriva de él. El selector son chips, en la misma fila que las pestañas.
//
// Cada reporte tiene su vista propia, que maneja sus filtros y su carga; esta pantalla solo
// decide cuál se monta.

import { Link, useSearchParams } from "react-router-dom";
import { Tabs, Tab } from "react-bootstrap";
import VistaInventario from "../components/Reportes/VistaInventario";
import VistaVentas from "../components/Reportes/VistaVentas";
import VistaCuotasVencidas from "../components/Reportes/VistaCuotasVencidas";
import "./Reportes.css";

const REPORTE_DEFAULT = "inventario";

// Cada reporte: su etiqueta en el selector y la vista que lo dibuja.
const REPORTES = {
  inventario: { label: "Inventario de lotes", Vista: VistaInventario },
  ventas: { label: "Ventas por período", Vista: VistaVentas },
  "cuotas-vencidas": { label: "Cuotas vencidas", Vista: VistaCuotasVencidas },
};

// Pestañas y los reportes que contiene cada una (el primero es el que se abre al cambiar de pestaña).
const TABS = [
  { key: "comercial", label: "Comercial", reportes: ["inventario", "ventas"] },
  { key: "cobranzas", label: "Cobranzas", reportes: ["cuotas-vencidas"] },
];

const tabDeReporte = (reporte) => TABS.find((t) => t.reportes.includes(reporte));

/** Contenido del reporte activo. El selector vive arriba, en la fila de las pestañas. */
function PanelReporte({ reporte }) {
  const { Vista } = REPORTES[reporte];

  return (
    <div className="reportes-panel">
      <Vista />
    </div>
  );
}

/**
 * Selector de reporte: un chip por cada reporte de la pestaña activa.
 *
 * Hace exactamente lo mismo que el `<select>` que había antes —cambiar `?reporte=`— pero deja
 * los reportes de la pestaña a la vista en lugar de esconderlos en un desplegable. `aria-pressed`
 * dice cuál está activo, que es lo que el select comunicaba con la opción seleccionada.
 */
function ChipsReporte({ tab, reporte, onReporteChange }) {
  return (
    <div className="reportes-chips" role="group" aria-label="Reporte">
      {tab.reportes.map((key) => {
        const activo = key === reporte;
        return (
          <button
            key={key}
            type="button"
            className={`reportes-chip${activo ? " reportes-chip--activo" : ""}`}
            aria-pressed={activo}
            onClick={() => onReporteChange(key)}
          >
            {REPORTES[key].label}
          </button>
        );
      })}
    </div>
  );
}

export default function Reportes() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Sin param o con uno inválido (hasOwn: "constructor" o "__proto__" no son reportes) → inventario.
  const param = searchParams.get("reporte");
  const reporte = Object.prototype.hasOwnProperty.call(REPORTES, param) ? param : REPORTE_DEFAULT;
  const tabActiva = tabDeReporte(reporte);

  // El cambio va a la URL (no solo al estado) para que la vista sea compartible.
  const elegirReporte = (key) => setSearchParams({ reporte: key });
  const elegirTab = (tabKey) => {
    const tab = TABS.find((t) => t.key === tabKey);
    if (tab && tab.key !== tabActiva.key) elegirReporte(tab.reportes[0]);
  };

  // Los chips van después de las pestañas en el DOM y el CSS los acomoda en la misma fila:
  // `Tabs` rinde la barra y el contenido como hermanos, así que no hay dónde insertarlos dentro.
  return (
    <div className="container py-3 reportes-pantalla">
      {/* La ruta sale de lo que ya se sabe: la pestaña activa es la familia y el reporte activo
          da su etiqueta. No hay navegación nueva: solo "Inicio" es un enlace. */}
      <div className="reportes-encabezado">
        <p className="reportes-ruta">
          <Link to="/" className="reportes-ruta__enlace">
            Inicio
          </Link>
          {` / Reportes / ${tabActiva.label} / ${REPORTES[reporte].label}`}
        </p>
        <h1 className="reportes-titulo-pagina">Reportes</h1>
      </div>

      <Tabs
        id="reportes-tabs"
        className="reportes-tabs"
        activeKey={tabActiva.key}
        onSelect={elegirTab}
        transition={false}
        mountOnEnter
        unmountOnExit
      >
        {TABS.map((tab) => (
          <Tab key={tab.key} eventKey={tab.key} title={tab.label}>
            <PanelReporte reporte={reporte} />
          </Tab>
        ))}
      </Tabs>

      <ChipsReporte tab={tabActiva} reporte={reporte} onReporteChange={elegirReporte} />
    </div>
  );
}
