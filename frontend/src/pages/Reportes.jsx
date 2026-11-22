// src/pages/Reportes.jsx
// Pantalla de Reportes: pestañas Comercial / Cobranzas y selector de reporte.
// El reporte activo vive en la URL (?reporte=inventario|ventas|cuotas-vencidas) y la pestaña
// se deriva de él. En esta etapa solo se prueba el circuito pantalla → cliente → mock:
// el render de cada reporte (tarjetas, tablas, filtros, estados) llega en 39.2 a 39.5.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, Tab, Form, Alert } from "react-bootstrap";
import { getInventario, getVentas, getCuotasVencidas } from "../lib/api/reportes";
import { parseApiError } from "../lib/http/errors";
import "./Reportes.css";

const REPORTE_DEFAULT = "inventario";
const DIAS_VENTAS_DEFAULT = 30;
const ZONA_NEGOCIO = "America/Argentina/Buenos_Aires";

/** Hoy en Buenos Aires, YYYY-MM-DD (la misma zona que usa el backend para el corte). */
function hoyNegocio() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function sumarDias(ymd, dias) {
  return new Date(Date.parse(ymd) + dias * 86_400_000).toISOString().slice(0, 10);
}

// Cada reporte: etiqueta y cómo se carga por ahora (sin filtros; los obligatorios llevan un default).
const REPORTES = {
  inventario: {
    label: "Inventario de lotes",
    cargar: () => getInventario(),
  },
  ventas: {
    label: "Ventas por período",
    cargar: () => {
      const hasta = hoyNegocio();
      return getVentas({ desde: sumarDias(hasta, -(DIAS_VENTAS_DEFAULT - 1)), hasta });
    },
  },
  "cuotas-vencidas": {
    label: "Cuotas vencidas",
    cargar: () => getCuotasVencidas({ moneda: "USD" }),
  },
};

// Pestañas y los reportes que contiene cada una (el primero es el que se abre al cambiar de pestaña).
const TABS = [
  { key: "comercial", label: "Comercial", reportes: ["inventario", "ventas"] },
  { key: "cobranzas", label: "Cobranzas", reportes: ["cuotas-vencidas"] },
];

const tabDeReporte = (reporte) => TABS.find((t) => t.reportes.includes(reporte));

/** Selector de reporte (solo si la pestaña tiene más de uno) + resultado del reporte activo. */
function PanelReporte({ tab, reporte, onReporteChange }) {
  const [estado, setEstado] = useState({ status: "loading", filas: 0, error: null });

  // Al montar o cambiar de reporte, carga sin filtros. `cancelado` descarta respuestas viejas
  // si el usuario cambia de reporte antes de que lleguen.
  useEffect(() => {
    let cancelado = false;
    setEstado({ status: "loading", filas: 0, error: null });
    REPORTES[reporte]
      .cargar()
      .then((data) => {
        if (!cancelado) setEstado({ status: "ok", filas: data?.filas?.length ?? 0, error: null });
      })
      .catch((err) => {
        if (!cancelado) {
          setEstado({ status: "error", filas: 0, error: parseApiError(err, "No se pudo cargar el reporte") });
        }
      });
    return () => {
      cancelado = true;
    };
  }, [reporte]);

  return (
    <div className="reportes-panel">
      {tab.reportes.length > 1 ? (
        <Form.Group className="reportes-selector">
          <Form.Label htmlFor="reportes-select">Reporte</Form.Label>
          <Form.Select
            id="reportes-select"
            value={reporte}
            onChange={(e) => onReporteChange(e.target.value)}
          >
            {tab.reportes.map((key) => (
              <option key={key} value={key}>
                {REPORTES[key].label}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      ) : (
        <h6 className="reportes-titulo">{REPORTES[reporte].label}</h6>
      )}

      {estado.status === "loading" && <p className="text-muted">Cargando…</p>}
      {estado.status === "error" && <Alert variant="danger">{estado.error}</Alert>}
      {estado.status === "ok" && <p>{estado.filas} filas</p>}
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

  return (
    <div className="container py-3">
      <h5 className="mb-3">Reportes</h5>

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
            <PanelReporte tab={tab} reporte={reporte} onReporteChange={elegirReporte} />
          </Tab>
        ))}
      </Tabs>
    </div>
  );
}
