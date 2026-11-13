import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { Prisma } from '../generated/prisma';
import { safeErrorForLog } from '../utils/safeErrorLog';

const MULTER_INPUT_ERRORS: ReadonlySet<string> = new Set([
  'LIMIT_UNEXPECTED_FILE',
  'LIMIT_FILE_COUNT',
  'LIMIT_PART_COUNT',
  'LIMIT_FIELD_KEY',
  'LIMIT_FIELD_VALUE',
  'LIMIT_FIELD_COUNT',
  'MISSING_FIELD_NAME',
]);

// Contrato de error (D4): { success: false, code, message, errors? }.
// `code` distingue la clase de error; `message` es el texto público.
const CODE_BY_STATUS: Readonly<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
};

const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';
const INTERNAL_ERROR_MESSAGE = 'Error interno.';

/** Code público para un status HTTP de error. Cualquier 4xx no listado cae en BAD_REQUEST. */
export function errorCodeForStatus(status: number): string {
  if (status >= 500) return INTERNAL_ERROR_CODE;
  return CODE_BY_STATUS[status] ?? 'BAD_REQUEST';
}

/** status/statusCode del error solo si es un status HTTP de error (400-599). */
function httpErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
  const isHttpErrorStatus = (v: unknown): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= 400 && v <= 599;
  if (isHttpErrorStatus(status)) return status;
  if (isHttpErrorStatus(statusCode)) return statusCode;
  return undefined;
}

// El detalle de un error inesperado va solo al log del servidor, nunca a la respuesta, y en forma
// segura: sin el objeto completo (un error de Prisma puede traer la query con sus argumentos).
function logUnexpected(err: unknown): void {
  console.error('Error no manejado:', safeErrorForLog(err));
}

// Tope de express.json (app.ts). Lo informa el 413 de body-parser.
export const JSON_BODY_LIMIT = '1mb';

/** 404 JSON para cualquier ruta (o método) que ningún router atendió. Va antes de handleError. */
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Ruta no encontrada' });
}

export function handleError(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Manejar errores de Multer (ej. LIMIT_FILE_SIZE) - Etapa 5.4.3
  const errAny = err as { code?: string; message?: string };
  if (errAny?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      code: 'BAD_REQUEST',
      message: 'Archivo demasiado grande. Tamaño máximo permitido: 20 MB.',
    });
  }

  // Otros errores de Multer causados por el input del cliente (campo de archivo que no es "file",
  // demasiados archivos o partes, nombre/valor de campo fuera de límites): son 400, no 500.
  // Los MulterError que no son de input (p. ej. un fallo del storage) siguen su camino habitual.
  if (err instanceof multer.MulterError && MULTER_INPUT_ERRORS.has(err.code)) {
    const message =
      err.code === 'LIMIT_UNEXPECTED_FILE'
        ? 'Campo de archivo inesperado. El archivo debe enviarse en el campo "file".'
        : `Solicitud multipart inválida: ${err.message}`;
    return res.status(400).json({ success: false, code: 'BAD_REQUEST', message });
  }

  // Body JSON por encima del tope de express.json (body-parser: type 'entity.too.large', status 413)
  if ((err as { type?: unknown })?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      message: `El cuerpo de la solicitud supera el tamaño máximo permitido (${JSON_BODY_LIMIT}).`,
    });
  }

  // Manejar errores de parsing JSON de Express
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      code: 'BAD_REQUEST',
      message: 'Error al parsear el JSON. Verifica el formato de la solicitud.'
    });
  }

  // Manejar errores de Prisma (clase del cliente generado: la que realmente lanza la app)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, code: 'CONFLICT_UNIQUE', message: 'Violación de unicidad.' });
    }
    if (err.code === 'P2003') {
      // meta.field_name trae nombres internos (constraint/índice): solo al log saneado, nunca al cliente.
      console.warn('Conflicto de clave foránea:', safeErrorForLog(err));
      return res.status(409).json({ success: false, code: 'CONFLICT_FK', message: 'Clave foránea inválida.' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Registro no encontrado.' });
    }
  }

  // Errores con status/statusCode explícito.
  // 4xx: error conocido de dominio → se conserva su mensaje público.
  // ≥500: se conserva el status, pero el mensaje es genérico (el detalle solo va al log).
  const status = httpErrorStatus(err);
  if (status !== undefined) {
    if (status < 500) {
      const message = err instanceof Error && err.message ? err.message : 'Error en la solicitud.';
      return res.status(status).json({ success: false, code: errorCodeForStatus(status), message });
    }
    logUnexpected(err);
    return res.status(status).json({ success: false, code: INTERNAL_ERROR_CODE, message: INTERNAL_ERROR_MESSAGE });
  }

  // Error desconocido
  logUnexpected(err);
  return res.status(500).json({ success: false, code: INTERNAL_ERROR_CODE, message: INTERNAL_ERROR_MESSAGE });
}
