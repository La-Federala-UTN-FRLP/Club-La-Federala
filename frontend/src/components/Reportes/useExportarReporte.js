// src/components/Reportes/useExportarReporte.js
// Descarga del .xlsx de un reporte (39.5): qué se exporta, cuándo se puede y qué se avisa.
//
// La regla que ordena todo lo demás: se exporta SIEMPRE `aplicados`, nunca el borrador. El
// archivo tiene que traer exactamente las filas que están en pantalla (caso de aceptación
// REP-A5), y el borrador puede haber cambiado desde el último Generar.

import { useRef, useState } from "react";
import { exportarReporte } from "../../lib/api/reportes";
import { descargarBlob } from "../../lib/descargas";
import { parseApiError } from "../../lib/http/errors";
import { useToast } from "../../app/providers/ToastProvider";

const MENSAJE_ERROR = "No se pudo exportar el reporte";
const MOTIVO_SIN_GENERAR = "Generá el reporte para poder exportarlo";

// Con un backend rápido la descarga termina antes del segundo clic de un doble clic, y el guard
// de `enCurso` solo cubre el tramo en vuelo. El botón se mantiene bloqueado este mínimo para que
// un doble clic sea una sola exportación y para que "Preparando archivo…" no parpadee.
const MS_MINIMO_DESCARGA = 1000;

/** Día de calendario, que es la forma del `corte` del contrato. */
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Nombre para cuando no se pudo leer el del backend (header ausente, o un proxy que no lo
 * expone). No reproduce el que arma el backend —ese lleva el período o la moneda—: alcanza con
 * que el archivo se distinga por reporte y por día de corte.
 *
 * @param {string} ruta - "inventario" | "ventas" | "cuotas-vencidas"
 * @param {unknown} corte - `datos.corte`, si llegó
 */
function nombreRespaldo(ruta, corte) {
  const sufijo = typeof corte === "string" && DIA_ISO.test(corte) ? `_corte-${corte}` : "";
  return `reporte-${ruta}${sufijo}.xlsx`;
}

/**
 * @param {object} opciones
 * @param {"inventario"|"ventas"|"cuotas-vencidas"} opciones.ruta
 * @param {object|null} opciones.aplicados - Los filtros de la consulta que está en pantalla
 * @param {object|null} opciones.datos - La respuesta que está en pantalla
 * @param {boolean} opciones.cargando - Hay una consulta en vuelo
 * @returns {{exportar: () => Promise<void>, descargando: boolean, puedeExportar: boolean,
 *   motivoDeshabilitado: string|null}}
 */
export default function useExportarReporte({ ruta, aplicados, datos, cargando }) {
  const { error } = useToast();
  const [descargando, setDescargando] = useState(false);

  // El estado es para la interfaz; el ref es el que corta el doble clic. `setDescargando` no se
  // ve reflejado hasta el próximo render, así que dos clics en el mismo tick pasarían los dos.
  const enCurso = useRef(false);

  const sinResultado = aplicados === null || datos === null;

  // `!cargando` no es decorativo: mientras se recarga, `aplicados` ya son los filtros nuevos
  // pero en pantalla sigue el resultado viejo atenuado. Exportar ahí bajaría un archivo que no
  // coincide con lo que se ve, que es justo lo que REP-A5 pide que no pase.
  const puedeExportar = !sinResultado && !cargando && !descargando;

  let motivoDeshabilitado = null;
  if (sinResultado && !cargando) motivoDeshabilitado = MOTIVO_SIN_GENERAR;

  const exportar = async () => {
    if (enCurso.current || !puedeExportar) return;
    enCurso.current = true;
    setDescargando(true);
    const inicio = Date.now();

    try {
      // `aplicados`, no `borrador`: ver el comentario de arriba del archivo.
      const { blob, nombre } = await exportarReporte(ruta, aplicados);
      descargarBlob(blob, nombre ?? nombreRespaldo(ruta, datos?.corte));
    } catch (e) {
      // El error va en un toast y no en la página: la tabla que se ve sigue siendo correcta, no
      // es ella la que falló, así que no hay nada que reemplazar ni que limpiar después.
      error(parseApiError(e, MENSAJE_ERROR));
    } finally {
      // El archivo ya se bajó y el error ya se avisó: lo único que espera acá es el desbloqueo.
      const resto = MS_MINIMO_DESCARGA - (Date.now() - inicio);
      if (resto > 0) await new Promise((r) => setTimeout(r, resto));

      enCurso.current = false;
      setDescargando(false);
    }
  };

  return { exportar, descargando, puedeExportar, motivoDeshabilitado };
}
