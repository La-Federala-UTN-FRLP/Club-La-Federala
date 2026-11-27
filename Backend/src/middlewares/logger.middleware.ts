import { Request, Response, NextFunction } from 'express';

// Log de requests: una línea al terminar la respuesta, con método, path, status y duración.
// - Sin query string (puede traer búsquedas con PII: ?q=, filtros): se usa el path, no la URL.
// - Solo plantilla de la ruta al terminar: ni parámetros de path ni paths desconocidos.
// - En NODE_ENV=test no loguea: el ruido de miles de requests taparía los errores reales.
//   Los logs de error (console.error del handler) no pasan por acá y se mantienen.

type RequestLoggerOptions = {
  enabled?: boolean;
  log?: (line: string) => void;
  now?: () => number;
};

export function createRequestLogger(options: RequestLoggerOptions = {}) {
  const enabled = options.enabled ?? process.env.NODE_ENV !== 'test';
  const log = options.log ?? ((line: string) => console.log(line));
  const now = options.now ?? (() => performance.now());

  return function logRequest(req: Request, res: Response, next: NextFunction) {
    if (!enabled) return next();

    const method = req.method;
    const start = now();

    res.on('finish', () => {
      const durationMs = Math.round(now() - start);
      const path = typeof req.route?.path === 'string' ? `${req.baseUrl}${req.route.path}` : '<unmatched>';
      log(`[${new Date().toISOString()}] ${method} ${path} ${res.statusCode} ${durationMs}ms`);
    });

    next();
  };
}

export const logRequest = createRequestLogger();
