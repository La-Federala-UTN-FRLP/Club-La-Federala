// Error público del resumen con IA (contrato V4 de CCLF-37 y OpenAPI: ErrorCode AI_UNAVAILABLE).
// Vive aparte del servicio para que el middleware de errores lo reconozca sin cargar el SDK de IA.
export const AI_UNAVAILABLE_CODE = 'AI_UNAVAILABLE';
export const AI_UNAVAILABLE_STATUS = 502;
// Mensaje público: el mismo del ejemplo AiUnavailable de la OpenAPI. Nunca lleva el detalle del proveedor.
export const AI_UNAVAILABLE_MESSAGE = 'No se pudo generar el resumen. Los reportes siguen disponibles.';

/** Vertex AI no respondió, superó el timeout o devolvió una salida inválida. El detalle va solo al log. */
export class AiUnavailableError extends Error {
    readonly status = AI_UNAVAILABLE_STATUS;
    readonly code = AI_UNAVAILABLE_CODE;

    constructor() {
        super(AI_UNAVAILABLE_MESSAGE);
        this.name = 'AiUnavailableError';
    }
}
