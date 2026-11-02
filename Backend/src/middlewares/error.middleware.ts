import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { Prisma } from '../generated/prisma';

const MULTER_INPUT_ERRORS: ReadonlySet<string> = new Set([
  'LIMIT_UNEXPECTED_FILE',
  'LIMIT_FILE_COUNT',
  'LIMIT_PART_COUNT',
  'LIMIT_FIELD_KEY',
  'LIMIT_FIELD_VALUE',
  'LIMIT_FIELD_COUNT',
  'MISSING_FIELD_NAME',
]);

export function handleError(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Manejar errores de Multer (ej. LIMIT_FILE_SIZE) - Etapa 5.4.3
  const errAny = err as { code?: string; message?: string };
  if (errAny?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      code: 'ERROR',
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
    return res.status(400).json({ success: false, code: 'ERROR', message });
  }

  // Manejar errores de parsing JSON de Express
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ 
      success: false,
      code: 'ERROR',
      message: 'Error al parsear el JSON. Verifica el formato de la solicitud.'
    });
  }

  // Manejar errores de Prisma
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, code: 'CONFLICT_UNIQUE', message: 'Violación de unicidad.' });
    }
    if (err.code === 'P2003') {
      const field = (err.meta?.field_name as string | undefined);
      return res.status(409).json({ success: false, code: 'CONFLICT_FK', message: 'Clave foránea inválida.', field });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Registro no encontrado.' });
    }
  }
  
  // Manejar errores de JavaScript con status o statusCode
  if (err instanceof Error) {
    const errorWithStatus = err as Error & { status?: number; statusCode?: number };
    const status = errorWithStatus.status || errorWithStatus.statusCode;
    if (status) {
      return res.status(status).json({ 
        success: false,
        code: status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'ERROR',
        message: err.message || 'Error en la solicitud.'
      });
    }
  }
  
  // Error desconocido
  console.error('Error no manejado:', err);
  return res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Error interno.' });
}
