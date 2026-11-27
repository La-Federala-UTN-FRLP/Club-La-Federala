// src/components/Reportes/VistaVentas.jsx
// Reporte de ventas por período (39.3): filtros, tarjetas comparadas con el período anterior,
// aviso de otras monedas y tabla. Maneja su propia carga; el panel de Reportes solo lo monta.
//
// A diferencia de inventario, el período es obligatorio y no hay nada razonable que consultar
// por cuenta propia: los campos vienen precargados con los últimos 30 días, pero la pantalla no
// pide nada hasta que la persona pulsa Generar.
//
// La pantalla no recalcula cifras: muestra los números que manda el backend. Lo único derivado
// es la diferencia de cantidades enteras del rótulo "+N vs. anterior" y el ancho de las barras,
// que es escala de dibujo y no un dato informado. Los montos de distintas monedas no se suman.

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Alert, Form } from "react-bootstrap";
import AvisoFraccionesTruncadas from "./AvisoFraccionesTruncadas";
import FiltrosReporte from "./FiltrosReporte";
import BotonExportar from "./BotonExportar";
import TarjetaTabla from "./TarjetaTabla";
import TablaReportes from "./TablaReportes";
import { ErrorReporte, IndicadorCarga, ResultadoReporte } from "./EstadosReporte";
import { InsigniaVenta } from "./Insignias";
import { etiquetaLote, fmtMontoMoneda, TEXTO_VACIO } from "./etiquetas";
import { DIAS_PERIODO_DEFAULT, validarPeriodo } from "./periodo";
import useCatalogoFracciones from "./useCatalogoFracciones";
import useReporte from "./useReporte";
import useExportarReporte from "./useExportarReporte";
import { getVentas } from "../../lib/api/reportes";
import { fmtFechaCalendario, hoyNegocio, sumarDias } from "../../lib/fechas";

// Las tres tarjetas del reporte, en el orden del contrato. `aumentoEsBueno` decide el color del
// rótulo de diferencia: más ventas o más escrituras es una buena noticia, más cancelaciones no.
const TARJETAS = [
  { clave: "iniciadas", titulo: "Ventas iniciadas", tono: "iniciadas", aumentoEsBueno: true },
  { clave: "escrituradas", titulo: "Escrituras firmadas", tono: "escrituradas", aumentoEsBueno: true },
  { clave: "canceladas", titulo: "Cancelaciones", tono: "canceladas", aumentoEsBueno: false },
];

/** Las mismas tres métricas, con el rótulo que usa el aviso de otras monedas. */
const METRICAS_OTRA_MONEDA = [
  { clave: "iniciadas", etiqueta: "Iniciadas" },
  { clave: "escrituradas", etiqueta: "Escrituradas" },
  { clave: "canceladas", etiqueta: "Canceladas" },
];

const columnas = [
  { clave: "numero", titulo: "Venta", align: "left" },
  {
    clave: "lote",
    titulo: "Lote",
    align: "left",
    render: (f) => etiquetaLote(f.fraccion, f.loteNumero),
  },
  { clave: "estado", titulo: "Estado", align: "center", render: (f) => <InsigniaVenta estado={f.estado} /> },
  { clave: "fechaAlta", titulo: "Alta", align: "center", render: (f) => fmtFechaCalendario(f.fechaAlta) },
  {
    clave: "fechaEscritura",
    titulo: "Escritura",
    align: "center",
    render: (f) => fmtFechaCalendario(f.fechaEscritura),
  },
  {
    clave: "fechaCancelacion",
    titulo: "Cancelación",
    align: "center",
    render: (f) => fmtFechaCalendario(f.fechaCancelacion),
  },
  {
    clave: "monto",
    titulo: "Monto",
    align: "right",
    // Cada fila lleva su propia moneda: el contrato informa ARS y USD por separado y nunca
    // convierte, así que la celda dice en qué moneda está.
    render: (f) => fmtMontoMoneda(f.monto, f.moneda),
  },
  {
    clave: "accion",
    titulo: "Acción",
    align: "center",
    // El enlace lo arma el backend (`/ventas?openId=<id>`); acá no se reconstruye.
    render: (f) => (
      <Link to={f.enlace} className="reportes-enlace">
        Ver venta
      </Link>
    ),
  },
];

// Proporcional, como en inventario: con columnas fijas el sobrante se iría todo a la primera.
const GRID_TEMPLATE =
  "minmax(130px, 0.9fr) minmax(110px, 0.8fr) minmax(130px, 0.9fr) minmax(100px, 0.7fr) " +
  "minmax(100px, 0.7fr) minmax(110px, 0.7fr) minmax(150px, 1fr) minmax(100px, 0.6fr)";

/** "26/10–24/11": el rango de un período, corto, para la etiqueta de una barra. */
const etiquetaRango = (p) =>
  `${fmtFechaCalendario(p?.desde).slice(0, 5)}–${fmtFechaCalendario(p?.hasta).slice(0, 5)}`;

/**
 * Ancho de una barra. No es un dato que la pantalla informe: es la escala del dibujo, relativa a
 * la cantidad más alta de las seis (tres tarjetas × dos períodos). Sin ninguna venta, no hay
 * escala y todas quedan en cero.
 */
const anchoBarra = (cantidad, maximo) =>
  maximo > 0 ? `${((cantidad / maximo) * 100).toFixed(1)}%` : "0%";

/**
 * Rótulo de la diferencia de cantidades contra el período anterior.
 *
 * Es el único número que calcula la pantalla, y es una resta de enteros que el backend ya
 * informa por separado. No hay porcentajes ni diferencias de monto: eso sería recalcular cifras.
 */
function rotuloDiferencia(cantidad, cantidadAnterior, aumentoEsBueno) {
  const diferencia = cantidad - cantidadAnterior;
  if (diferencia > 0) {
    return { texto: `+${diferencia} vs. anterior`, variante: aumentoEsBueno ? "success" : "danger" };
  }
  if (diferencia === 0) return { texto: "Igual que anterior", variante: "muted" };
  // Una baja no se pinta: que caigan las ventas y que caigan las cancelaciones no significan
  // lo mismo, y la tarjeta no es el lugar para opinar.
  return { texto: `−${Math.abs(diferencia)} vs. anterior`, variante: "muted" };
}

// Variante del rótulo → clase de la pastilla. La lógica de `rotuloDiferencia` no cambia: solo
// cambia cómo se pinta, de las insignias genéricas de estado a una pastilla propia del reporte.
const CLASE_DELTA = { success: "sube", danger: "alerta", muted: "igual" };

/** Una de las tres tarjetas: cantidad, monto en USD y las dos barras comparadas. */
function TarjetaVentasPeriodo({ titulo, tarjeta, periodo, periodoAnterior, maximo, tono, aumentoEsBueno }) {
  const diferencia = rotuloDiferencia(tarjeta.cantidad, tarjeta.cantidadAnterior, aumentoEsBueno);

  return (
    <div className="reporte-venta-kpi">
      <div className="reporte-venta-kpi__cabecera">
        <h3 className="reporte-venta-kpi__titulo">{titulo}</h3>
        <span className={`reporte-delta reporte-delta--${CLASE_DELTA[diferencia.variante]}`}>
          {diferencia.texto}
        </span>
      </div>

      {/* Cantidad y monto en la misma línea: son dos lecturas del mismo hecho. */}
      <div className="reporte-venta-kpi__cifras">
        <span className="reporte-venta-kpi__valor">{tarjeta.cantidad}</span>
        <span className="reporte-venta-kpi__monto">{fmtMontoMoneda(tarjeta.montoUSD, "USD")}</span>
      </div>

      <div className="reporte-barras">
        <div className="reporte-barra">
          <span className="reporte-barra__etiqueta">{etiquetaRango(periodo)}</span>
          <div className="reporte-barra__riel">
            <div
              className={`reporte-barra__relleno reporte-barra__relleno--${tono}`}
              style={{ width: anchoBarra(tarjeta.cantidad, maximo) }}
            />
          </div>
        </div>

        <div className="reporte-barra">
          <span className="reporte-barra__etiqueta">{etiquetaRango(periodoAnterior)}</span>
          <div className="reporte-barra__riel">
            <div
              className="reporte-barra__relleno reporte-barra__relleno--anterior"
              style={{ width: anchoBarra(tarjeta.cantidadAnterior, maximo) }}
            />
          </div>
        </div>
      </div>

      <p className="reporte-venta-kpi__anterior">
        Período anterior: {tarjeta.cantidadAnterior} · {fmtMontoMoneda(tarjeta.montoUSDAnterior, "USD")}
      </p>
    </div>
  );
}

/**
 * Las monedas distintas de USD, cada una con sus tres métricas.
 *
 * Van aparte y no se suman: el contrato las informa por separado porque no hay cotización con la
 * que convertirlas, y sumarlas daría un número que no significa nada.
 */
function AvisoOtrasMonedas({ otrasMonedas }) {
  return (
    <section className="reporte-otras-monedas">
      {/* Decorativo: lo que dice el aviso ya está en el texto, así que el ícono se oculta a
          los lectores de pantalla en lugar de hacerlos leer "imagen". */}
      <svg
        className="reporte-otras-monedas__icono"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5v.5" />
      </svg>

      <div className="reporte-otras-monedas__texto">
      <h3 className="reporte-otras-monedas__titulo">Otras monedas, informadas aparte.</h3>

      {otrasMonedas.map((grupo) => (
        <div key={grupo.moneda} className="reporte-otras-monedas__grupo">
          <h4 className="reporte-otras-monedas__moneda">{grupo.moneda}</h4>
          <ul className="reporte-otras-monedas__lista">
            {METRICAS_OTRA_MONEDA.map(({ clave, etiqueta }) => {
              const t = grupo[clave];
              return (
                <li key={clave} className="reporte-otras-monedas__item">
                  {etiqueta}: {t.cantidad} · {fmtMontoMoneda(t.monto, grupo.moneda)} (anterior:{" "}
                  {t.cantidadAnterior} · {fmtMontoMoneda(t.montoAnterior, grupo.moneda)})
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <p className="reporte-otras-monedas__nota">No se suma a los montos en USD.</p>
      </div>
    </section>
  );
}

/** Borrador inicial: los últimos 30 días, listos para generar, pero sin consultar nada. */
function borradorInicial() {
  const hasta = hoyNegocio();
  return { desde: sumarDias(hasta, -(DIAS_PERIODO_DEFAULT - 1)), hasta, fraccion: "" };
}

// Los rótulos de los dos estados de carga y el fallback del mensaje de error. Van como
// constantes de módulo, igual que el resto de los textos; `MENSAJE_ERROR` además entra en las
// dependencias del efecto de `useReporte`, y así queda claro que ahí nunca cambia.
const TEXTO_CARGANDO = "Cargando ventas…";
const TEXTO_ACTUALIZANDO = "Actualizando ventas…";
const MENSAJE_ERROR = "No se pudo cargar el reporte de ventas";

export default function VistaVentas() {
  // `borrador` es lo que se ve en los campos; `aplicados` es lo que se consultó. Arranca en null
  // porque el período es obligatorio: sin un Generar no hay consulta que tenga sentido hacer.
  //
  // `borradorInicial` se pasa como función y no como objeto: `useState` trata una función como
  // inicializador diferido, así que la fecha de hoy se calcula una vez y no en cada render.
  const {
    borrador,
    cambiarCampo,
    aplicados,
    datos,
    cargando,
    error,
    desactualizado,
    generar,
    reintentar,
  } = useReporte({
    fetcher: getVentas,
    mensajeError: MENSAJE_ERROR,
    filtrosIniciales: borradorInicial,
  });

  const { fracciones, errorFracciones, truncado, totalFracciones } = useCatalogoFracciones();

  const { exportar, descargando, puedeExportar, motivoDeshabilitado } = useExportarReporte({
    ruta: "ventas",
    aplicados,
    datos,
    cargando,
  });

  const tarjetas = datos?.tarjetas;

  // Escala de las barras: la cantidad más alta entre las seis (tres métricas × dos períodos).
  const maximoCantidad = useMemo(() => {
    if (!tarjetas) return 0;
    const cantidades = TARJETAS.flatMap(({ clave }) => [
      tarjetas[clave]?.cantidad ?? 0,
      tarjetas[clave]?.cantidadAnterior ?? 0,
    ]);
    return Math.max(0, ...cantidades);
  }, [tarjetas]);

  const cambiarFiltro = (campo) => (e) => cambiarCampo(campo, e.target.value);

  // Mientras el período no sirva, el botón queda deshabilitado y la tarjeta dice por qué, en
  // lugar de dejar que el backend conteste un 400 con un mensaje más seco.
  const motivo = validarPeriodo(borrador);

  const cantidadFilas = datos?.filas?.length ?? 0;
  const detalleTabla = `${cantidadFilas} ${cantidadFilas === 1 ? "venta" : "ventas"} · todas las monedas`;

  return (
    <div className="reporte-ventas">
      <FiltrosReporte
        onGenerar={generar}
        cargando={cargando}
        deshabilitado={motivo !== null}
        motivo={motivo ?? ""}
        desactualizado={desactualizado}
        acciones={
          <BotonExportar
            onClick={exportar}
            deshabilitado={!puedeExportar}
            descargando={descargando}
            motivo={motivoDeshabilitado}
          />
        }
      >
        <Form.Group className="reporte-filtro">
          <Form.Label htmlFor="ven-desde">Desde</Form.Label>
          <Form.Control
            id="ven-desde"
            type="date"
            value={borrador.desde}
            onChange={cambiarFiltro("desde")}
          />
        </Form.Group>

        <Form.Group className="reporte-filtro">
          <Form.Label htmlFor="ven-hasta">Hasta</Form.Label>
          <Form.Control
            id="ven-hasta"
            type="date"
            value={borrador.hasta}
            onChange={cambiarFiltro("hasta")}
          />
        </Form.Group>

        <Form.Group className="reporte-filtro">
          <Form.Label htmlFor="ven-fraccion">Fracción</Form.Label>
          {/* El value es el id de la fracción, que es lo que espera el parámetro `fraccion` de
              la API; el número es solo lo que se muestra. No son lo mismo. */}
          <Form.Select
            id="ven-fraccion"
            value={borrador.fraccion}
            onChange={cambiarFiltro("fraccion")}
            disabled={fracciones.length === 0}
          >
            <option value="">Todas las fracciones</option>
            {fracciones.map((f) => (
              <option key={f.id} value={f.id}>
                Fracción {f.numero}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </FiltrosReporte>

      {errorFracciones && (
        <Alert variant="warning" className="reportes-aviso">
          {errorFracciones} Podés consultar las ventas sin filtrar por fracción.
        </Alert>
      )}

      {truncado && (
        <AvisoFraccionesTruncadas cantidad={fracciones.length} total={totalFracciones} />
      )}

      {aplicados === null && !cargando && (
        <p className="reporte-sin-consulta">Elegí un período y pulsá Generar</p>
      )}

      {/* La primera consulta no tiene nada que atenuar, así que el indicador va solo. */}
      {cargando && !datos && <IndicadorCarga texto={TEXTO_CARGANDO} />}

      {!cargando && error && <ErrorReporte mensaje={error} onReintentar={reintentar} />}

      {datos && !error && (
        <ResultadoReporte actualizando={cargando} textoActualizando={TEXTO_ACTUALIZANDO}>
          <p className="reportes-corte">Datos al corte del {fmtFechaCalendario(datos.corte)}</p>

          <div className="reporte-kpis">
            {TARJETAS.map(({ clave, titulo, tono, aumentoEsBueno }) => (
              <TarjetaVentasPeriodo
                key={clave}
                titulo={titulo}
                tarjeta={tarjetas[clave]}
                periodo={datos.periodo}
                periodoAnterior={datos.periodoAnterior}
                maximo={maximoCantidad}
                tono={tono}
                aumentoEsBueno={aumentoEsBueno}
              />
            ))}
          </div>

          {datos.otrasMonedas?.length > 0 && <AvisoOtrasMonedas otrasMonedas={datos.otrasMonedas} />}

          <TarjetaTabla titulo="Ventas del período" detalle={detalleTabla}>
            <TablaReportes
              columnas={columnas}
              filas={datos.filas ?? []}
              gridTemplate={GRID_TEMPLATE}
              filaKey={(fila) => fila.ventaId}
              vacio={TEXTO_VACIO}
            />
          </TarjetaTabla>
        </ResultadoReporte>
      )}
    </div>
  );
}
