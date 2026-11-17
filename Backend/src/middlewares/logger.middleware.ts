import { Request, Response, NextFunction } from 'express';

// Log de requests: una línea al terminar la respuesta, con método, path, status y duración.
// - Sin query string (puede traer búsquedas con PII: ?q=, filtros): se usa el path, no la URL.
// - Limitación conocida: los path params siguen en el path (p. ej. /api/personas/cuil/:cuil).
//   Reemplazarlos por la plantilla de la ruta requiere el router y queda fuera de este alcance.
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

    // A nivel app, req.path es el path completo y sin query. Se captura ahora porque los routers
    // reescriben req.url mientras atienden el request.
    const method = req.method;
    const path = req.path;
    const start = now();

    res.on('finish', () => {
      const durationMs = Math.round(now() - start);
      log(`[${new Date().toISOString()}] ${method} ${path} ${res.statusCode} ${durationMs}ms`);
    });

    next();
  };
}

export const logRequest = createRequestLogger();
