// src/components/Reportes/periodo.js
// Validación del período (desde/hasta) de los reportes, del lado del cliente.
//
// Repite las reglas de `queryReporteVentasSchema` (Backend/src/validations/reporte.validation.ts)
// para poder deshabilitar "Generar" y decir qué falta antes de gastar un 400. El backend sigue
// siendo la autoridad: esto no lo reemplaza, le ahorra el viaje.
//
// Sin componentes en este archivo: son funciones puras, igual que etiquetas.js.

import { diasInclusivos, esFechaCalendario } from "../../lib/fechas";

/**
 * Máximo de días de un período, contados de forma inclusiva (desde y hasta incluidos).
 * 366 admite un año bisiesto completo. Es el mismo límite que `MAX_DIAS_PERIODO` del backend.
 */
export const MAX_DIAS_PERIODO = 366;

/**
 * Días que traen precargados los campos de período al abrir un reporte.
 *
 * Es solo el valor inicial de los campos, no un período que se consulte solo: CCLF-37 pide que
 * la persona elija el período, así que la vista no pide nada hasta que pulsa Generar.
 */
export const DIAS_PERIODO_DEFAULT = 30;

/**
 * Valida el período de un reporte y devuelve el primer problema que encuentra.
 *
 * El orden importa: sin fechas no tiene sentido hablar del formato, y sin un formato válido no
 * se pueden comparar ni contar los días.
 *
 * @param {{desde?: string, hasta?: string}} [periodo]
 * @returns {string|null} Mensaje para mostrarle a la persona, o null si el período sirve.
 */
export function validarPeriodo({ desde, hasta } = {}) {
  if (!desde || !hasta) return "Completá desde y hasta";

  if (!esFechaCalendario(desde) || !esFechaCalendario(hasta)) {
    return "Las fechas tienen que ser días válidos";
  }

  // Comparación de texto: en YYYY-MM-DD el orden alfabético es el cronológico, igual que en el
  // backend, así que no hace falta construir dos Date para saber cuál es anterior.
  if (desde > hasta) return "La fecha desde no puede ser posterior a hasta";

  if (diasInclusivos(desde, hasta) > MAX_DIAS_PERIODO) {
    return `El período no puede superar ${MAX_DIAS_PERIODO} días`;
  }

  return null;
}
