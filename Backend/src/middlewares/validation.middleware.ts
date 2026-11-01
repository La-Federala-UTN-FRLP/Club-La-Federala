// src/middlewares/validation.middleware.ts
import { z, ZodError, ZodType } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Partes del request cuyo resultado validado se conserva. En Express 5 req.params y req.query
// no se pueden reemplazar de forma fiable (req.query es un getter que re-parsea la URL en cada
// acceso), así que el resultado de Zod vive en req.validated y el input HTTP queda crudo.
type ValidatedSource = 'params' | 'query';

// El resultado se guarda junto al schema que lo produjo: el accessor exige ese mismo schema
// para que el controller no lea algo distinto de lo que validó su ruta.
interface ValidatedPart {
  schema: ZodType;
  data: unknown;
}

declare global {
  namespace Express {
    interface Request {
      validated?: Partial<Record<ValidatedSource, ValidatedPart>>;
    }
  }
}

function sendZodError(res: Response, e: ZodError) {
  return res.status(400).json({
    success: false,
    message: 'Datos inválidos',
    errors: e.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
  });
}

// Lo que hace esto es validar el cuerpo de la query, separe el sendZodError en otra funcion
// xq es mas limpio y reutilizable por si dsp queremos validar otros tipos de datos pero
// seguir mandando el mismo formato de error
export const validate = (schema: ZodType) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (e) {
      if (e instanceof ZodError) return sendZodError(res, e);
      next(e);
    }
  };
};

function validateSource(source: ValidatedSource, schema: ZodType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await schema.parseAsync(req[source]);
      req.validated = { ...req.validated, [source]: { schema, data } };
      next();
    } catch (e) {
      if (e instanceof ZodError) return sendZodError(res, e);
      next(e);
    }
  };
}

function readValidated<S extends ZodType>(req: Request, source: ValidatedSource, schema: S): z.output<S> {
  const part = req.validated?.[source];
  if (!part) throw new Error(`No hay ${source} validados: la ruta no ejecutó su middleware de validación`);
  if (part.schema !== schema) throw new Error(`Los ${source} de la ruta se validaron con otro schema`);
  return part.data as z.output<S>;
}

// Valida los parámetros de la ruta. req.params queda crudo (strings): el controller lee el
// resultado de Zod con validatedParams(req, schema).
export const validateParams = (schema: ZodType) => validateSource('params', schema);

/**
 * Params ya validados y transformados por validateParams(schema) en la ruta.
 * Recibe el mismo schema que la ruta; si la ruta no validó params, o los validó con otro
 * schema, es un error de programación y lanza.
 */
export function validatedParams<S extends ZodType>(req: Request, schema: S): z.output<S> {
  return readValidated(req, 'params', schema);
}

// Valida la query de la ruta. req.query queda crudo (strings, arrays si el parámetro se repite):
// el controller lee el resultado de Zod con validatedQuery(req, schema). Las claves que el
// schema no declara se descartan en silencio (no hay 400 por parámetros desconocidos).
export const validateQuery = (schema: ZodType) => validateSource('query', schema);

/**
 * Query ya validada y transformada por validateQuery(schema) en la ruta.
 * Recibe el mismo schema que la ruta; si la ruta no validó query, o la validó con otro schema,
 * es un error de programación y lanza.
 */
export function validatedQuery<S extends ZodType>(req: Request, schema: S): z.output<S> {
  return readValidated(req, 'query', schema);
}
