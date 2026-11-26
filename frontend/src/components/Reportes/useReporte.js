// src/components/Reportes/useReporte.js
// Estado de un reporte: borrador de filtros, filtros aplicados, datos, carga y error (39.5).
//
// Era el mismo bloque en VistaVentas y VistaCuotasVencidas: cinco estados, el efecto de carga y
// el `generar`. Entre las dos vistas había dos líneas de diferencia —la función de la API y el
// mensaje de error—, que son justamente los dos parámetros del hook.
//
// Lo que el hook NO hace: no sabe qué campos tiene el filtro (los declara cada vista con
// `filtrosIniciales`), no valida (eso es de la vista: el período de ventas) y no formatea ni
// calcula nada sobre `datos`, porque la interfaz nunca recalcula cifras del backend.

import { useEffect, useState } from "react";
import { parseApiError } from "../../lib/http/errors";

/**
 * @param {object} opciones
 * @param {(filtros: object) => Promise<object>} opciones.fetcher - Una función de módulo de
 *   `lib/api/reportes` (getVentas, getCuotasVencidas…). Tiene que ser una referencia estable:
 *   está en las dependencias del efecto, así que una lambda armada en el render dispararía una
 *   consulta por render.
 * @param {string} opciones.mensajeError - Fallback para cuando el error no trae mensaje propio
 * @param {object|(() => object)} opciones.filtrosIniciales - Valor inicial del borrador, que
 *   además declara sus claves. Puede ser una función que lo devuelva: se resuelve una sola vez,
 *   que es lo que necesita ventas para no recalcular la fecha de hoy en cada render.
 * @param {boolean} [opciones.consultarAlMontar=false] - El reporte se pide solo, sin esperar un
 *   Generar. Lo usa inventario, que es el único con algo razonable que mostrar sin filtros; los
 *   otros dos necesitan un período o una moneda y no tienen nada que consultar por su cuenta.
 * @returns {{borrador: object, cambiarCampo: (campo: string, valor: unknown) => void,
 *   aplicados: object|null, datos: object|null, cargando: boolean, error: string|null,
 *   desactualizado: boolean, generar: () => void, reintentar: () => void}}
 *   `aplicados` en null significa que todavía no se generó nada: no hay consulta en vuelo, no
 *   hay datos y no hay error, y la vista muestra su invitación a generar. Con
 *   `consultarAlMontar` nunca es null.
 */
export default function useReporte({
  fetcher,
  mensajeError,
  filtrosIniciales,
  consultarAlMontar = false,
}) {
  // El borrador inicial se resuelve una sola vez. Si `filtrosIniciales` es una función hay que
  // llamarla exactamente una vez: con `consultarAlMontar` el valor se necesita dos veces —para
  // el borrador y para los aplicados— y dos llamadas darían dos objetos calculados por separado.
  //
  // `aplicados` arranca con una COPIA y no con la misma referencia que el borrador: son dos
  // estados independientes y nada de lo que le pase a uno tiene que verse en el otro.
  const [inicial] = useState(() => {
    const filtros = typeof filtrosIniciales === "function" ? filtrosIniciales() : filtrosIniciales;
    return { borrador: filtros, aplicados: consultarAlMontar ? { ...filtros } : null };
  });

  // `borrador` es lo que se ve en los campos; `aplicados` es lo que se consultó.
  const [borrador, setBorrador] = useState(inicial.borrador);
  const [aplicados, setAplicados] = useState(inicial.aplicados);

  const [datos, setDatos] = useState(null);
  // Con `consultarAlMontar` el efecto ya tiene filtros y va a pedir el reporte en cuanto corra,
  // así que el primer frame tiene que mostrar el indicador y no un hueco.
  const [cargando, setCargando] = useState(consultarAlMontar);
  const [error, setError] = useState(null);

  // Carga del reporte: solo cuando hay filtros aplicados, y una vez por cada Generar.
  // `cancelado` descarta la respuesta si los filtros cambian antes de que llegue.
  //
  // `fetcher` y `mensajeError` van en las dependencias porque son lo que el efecto toma de
  // afuera; las dos vistas pasan constantes de módulo, así que en la práctica no cambian nunca.
  useEffect(() => {
    if (aplicados === null) return undefined;

    let cancelado = false;
    setCargando(true);
    setError(null);
    fetcher(aplicados)
      .then((data) => {
        if (!cancelado) setDatos(data);
      })
      .catch((err) => {
        if (!cancelado) {
          setDatos(null);
          setError(parseApiError(err, mensajeError));
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [aplicados, fetcher, mensajeError]);

  const cambiarCampo = (campo, valor) => setBorrador((prev) => ({ ...prev, [campo]: valor }));

  // Objeto nuevo en cada clic a propósito: con la misma referencia React descarta el setState y
  // el efecto no vuelve a correr, así que Generar no consultaría de nuevo con los mismos filtros.
  const generar = () => setAplicados({ ...borrador });

  // Reintentar es el mismo truco, pero con los filtros que ya se aplicaron y no con el borrador:
  // una copia nueva de `aplicados` hace correr el efecto otra vez, y es una sola consulta.
  // Sin nada aplicado devuelve el mismo null, con lo que React descarta el setState y no pasa
  // nada: así un reintento imposible no termina pidiendo el reporte sin filtros.
  const reintentar = () => setAplicados((prev) => (prev === null ? null : { ...prev }));

  // Los filtros cambiaron después de generar. Sin `datos` no hay ningún resultado que marcar, y
  // sin `aplicados` todavía no se generó nada, que es otro estado y tiene su propio aviso.
  //
  // Clave por clave, y no con `===` ni con JSON.stringify: `aplicados` es siempre una copia
  // superficial de un objeto plano de claves fijas y valores string —nunca falta una clave, y
  // "todas las fracciones" es ""—, así que `===` nunca daría true, porque son objetos distintos
  // a propósito, y stringify haría depender el resultado del orden de las claves.
  const desactualizado =
    datos !== null &&
    aplicados !== null &&
    Object.keys(aplicados).some((k) => aplicados[k] !== borrador[k]);

  return {
    borrador,
    cambiarCampo,
    aplicados,
    datos,
    cargando,
    error,
    desactualizado,
    generar,
    reintentar,
  };
}
