// src/components/Reportes/VistaInventario.jsx
// Reporte de inventario de lotes (39.2): filtros, tarjetas de totales y tabla.
// Maneja su propia carga; el panel de Reportes solo lo monta.
//
// Los filtros se aplican con el botón, no en vivo: cada consulta es un GET al backend y
// el contrato recalcula los totales sobre el mismo universo filtrado.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Form } from "react-bootstrap";
import StatusBadge, { fmtEstadoLote } from "../Table/TablaLotes/cells/StatusBadge";
import SubstatusBadge from "../Table/TablaLotes/cells/SubstatusBadge";
import TablaReportes from "./TablaReportes";
import { getInventario, getFraccionesReporte } from "../../lib/api/reportes";
import { parseApiError } from "../../lib/http/errors";
import { fmtFechaCalendario } from "../../lib/fechas";
import { fmtMonto } from "../../utils/pagoUtils";

// Enum EstadoLote del backend sin ELIMINADO: el inventario excluye esos lotes, así que
// ofrecerlo como filtro solo daría resultados vacíos.
const ESTADOS = [
  "OPERATIVO",
  "ALQUILADO",
  "CON_PRIORIDAD",
  "DISPONIBLE",
  "EN_PROMOCION",
  "NO_DISPONIBLE",
  "RESERVADO",
  "VENDIDO",
];

const SUBESTADOS = ["CONSTRUIDO", "NO_CONSTRUIDO", "EN_CONSTRUCCION"];

const SIN_FILTROS = { fraccion: "", estado: "", subestado: "" };

// El precio del inventario no trae moneda (Lote.precio es un decimal suelto en el schema);
// se muestra en USD, que es la moneda de las operaciones.
const MONEDA_PRECIO = "USD";

const etiquetaLote = (fila) =>
  fila.numero == null ? `Lote #${fila.loteId}` : `Lote ${fila.fraccion}-${fila.numero}`;

const columnas = [
  { clave: "lote", titulo: "Lote", align: "left", render: etiquetaLote },
  { clave: "fraccion", titulo: "Fracción", align: "center", render: (f) => `Fracción ${f.fraccion}` },
  { clave: "estado", titulo: "Estado", align: "center", render: (f) => <StatusBadge value={f.estado} /> },
  { clave: "subestado", titulo: "Subestado", align: "center", render: (f) => <SubstatusBadge value={f.subestado} /> },
  {
    clave: "precio",
    titulo: "Precio",
    align: "right",
    render: (f) => (f.precio == null ? "—" : fmtMonto(f.precio, MONEDA_PRECIO)),
  },
  {
    clave: "accion",
    titulo: "Acción",
    align: "center",
    render: (f) => (
      <Link to={f.enlace} className="reportes-enlace">
        Ver lote
      </Link>
    ),
  },
];

// Proporcional en vez de columnas fijas: si fuera fijo, el sobrante se iría todo a la
// primera columna y dejaría un hueco entre el lote y su fracción.
const GRID_TEMPLATE =
  "minmax(150px, 1fr) minmax(110px, 0.7fr) minmax(140px, 0.9fr) minmax(150px, 0.9fr) minmax(120px, 0.8fr) minmax(100px, 0.6fr)";

/** Tarjeta de KPI: número grande y etiqueta. */
function TarjetaKpi({ etiqueta, valor, destacada = false }) {
  return (
    <div className={`reportes-kpi${destacada ? " reportes-kpi--destacada" : ""}`}>
      <div className="reportes-kpi__etiqueta">{etiqueta}</div>
      <div className="reportes-kpi__valor">{valor}</div>
    </div>
  );
}

/** Resumen compacto: lista de pares etiqueta/valor bajo un título. */
function Resumen({ titulo, items }) {
  return (
    <div className="reportes-resumen">
      <h6 className="reportes-resumen__titulo">{titulo}</h6>
      {items.length === 0 ? (
        <p className="reportes-resumen__vacio">Sin datos.</p>
      ) : (
        <ul className="reportes-resumen__lista">
          {items.map((item) => (
            <li key={item.clave} className="reportes-resumen__item">
              <span className="reportes-resumen__etiqueta">{item.etiqueta}</span>
              <span className="reportes-resumen__valor">{item.valor}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function VistaInventario() {
  // `borrador` es lo que se ve en los selects; `aplicados` es lo que se consultó.
  const [borrador, setBorrador] = useState(SIN_FILTROS);
  const [aplicados, setAplicados] = useState(SIN_FILTROS);

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [fracciones, setFracciones] = useState([]);
  const [errorFracciones, setErrorFracciones] = useState(null);

  // Catálogo del filtro de fracción: se pide una vez y no depende de los filtros.
  useEffect(() => {
    let cancelado = false;
    getFraccionesReporte()
      .then((lista) => {
        if (!cancelado) setFracciones(lista);
      })
      .catch((err) => {
        if (!cancelado) {
          setErrorFracciones(parseApiError(err, "No se pudieron cargar las fracciones"));
        }
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Carga del reporte: al montar sin filtros y después cada vez que se aplican.
  // `cancelado` descarta la respuesta si los filtros cambian antes de que llegue.
  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    getInventario(aplicados)
      .then((data) => {
        if (!cancelado) setDatos(data);
      })
      .catch((err) => {
        if (!cancelado) {
          setDatos(null);
          setError(parseApiError(err, "No se pudo cargar el reporte de inventario"));
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [aplicados]);

  const totales = datos?.totales;

  // Total del inventario: el contrato no lo trae como número suelto, sale de porEstado.
  const lotesEnInventario = useMemo(
    () => (totales?.porEstado ?? []).reduce((acc, e) => acc + e.cantidad, 0),
    [totales]
  );

  const cambiarFiltro = (campo) => (e) =>
    setBorrador((prev) => ({ ...prev, [campo]: e.target.value }));

  const aplicarFiltros = (e) => {
    e.preventDefault();
    setAplicados(borrador);
  };

  return (
    <div className="reportes-inventario">
      <form className="reportes-filtros" onSubmit={aplicarFiltros}>
        <Form.Group className="reportes-filtro">
          <Form.Label htmlFor="inv-fraccion">Fracción</Form.Label>
          <Form.Select
            id="inv-fraccion"
            value={borrador.fraccion}
            onChange={cambiarFiltro("fraccion")}
            disabled={fracciones.length === 0}
          >
            <option value="">Todas</option>
            {fracciones.map((f) => (
              <option key={f.id} value={f.id}>
                Fracción {f.numero}
              </option>
            ))}
          </Form.Select>
        </Form.Group>

        <Form.Group className="reportes-filtro">
          <Form.Label htmlFor="inv-estado">Estado</Form.Label>
          <Form.Select id="inv-estado" value={borrador.estado} onChange={cambiarFiltro("estado")}>
            <option value="">Todos</option>
            {ESTADOS.map((estado) => (
              <option key={estado} value={estado}>
                {fmtEstadoLote(estado)}
              </option>
            ))}
          </Form.Select>
        </Form.Group>

        <Form.Group className="reportes-filtro">
          <Form.Label htmlFor="inv-subestado">Subestado</Form.Label>
          <Form.Select
            id="inv-subestado"
            value={borrador.subestado}
            onChange={cambiarFiltro("subestado")}
          >
            <option value="">Todos</option>
            {SUBESTADOS.map((subestado) => (
              <option key={subestado} value={subestado}>
                {fmtEstadoLote(subestado)}
              </option>
            ))}
          </Form.Select>
        </Form.Group>

        <Button type="submit" variant="primary" className="reportes-filtros__boton">
          Aplicar filtros
        </Button>
      </form>

      {errorFracciones && (
        <Alert variant="warning" className="reportes-aviso">
          {errorFracciones} Podés consultar el inventario sin filtrar por fracción.
        </Alert>
      )}

      {cargando && (
        <div className="reportes-cargando">
          <div className="spinner-border" role="status" />
          <span className="ms-2">Cargando inventario…</span>
        </div>
      )}

      {!cargando && error && <Alert variant="danger">{error}</Alert>}

      {!cargando && !error && datos && (
        <>
          <p className="reportes-corte">Datos al {fmtFechaCalendario(datos.corte)}</p>

          <div className="reportes-kpis">
            <TarjetaKpi etiqueta="Ofrecibles" valor={totales?.ofrecibles ?? 0} destacada />
            <TarjetaKpi etiqueta="Lotes en inventario" valor={lotesEnInventario} />
          </div>

          <div className="reportes-resumenes">
            <Resumen
              titulo="Por estado"
              items={(totales?.porEstado ?? []).map((e) => ({
                clave: e.estado,
                etiqueta: fmtEstadoLote(e.estado),
                valor: e.cantidad,
              }))}
            />
            <Resumen
              titulo="Por fracción"
              items={(totales?.porFraccion ?? []).map((f) => ({
                clave: f.fraccionId,
                etiqueta: `Fracción ${f.fraccion}`,
                valor: `${f.cantidad} (${f.ofrecibles} ofrecibles)`,
              }))}
            />
            <Resumen
              titulo="Por subestado"
              items={(totales?.porSubestado ?? []).map((s) => ({
                clave: s.subestado,
                etiqueta: fmtEstadoLote(s.subestado),
                valor: s.cantidad,
              }))}
            />
          </div>

          <TablaReportes
            columnas={columnas}
            filas={datos.filas ?? []}
            gridTemplate={GRID_TEMPLATE}
            filaKey={(fila) => fila.loteId}
            vacio="No hay lotes que coincidan con los filtros."
          />
        </>
      )}
    </div>
  );
}
