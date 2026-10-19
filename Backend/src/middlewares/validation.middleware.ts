// src/middlewares/validation.middleware.ts
import { z, ZodError, ZodType } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Partes del request cuyo resultado validado se conserva. El saneamiento de queries
// sumará 'query' con el mismo mecanismo.
type ValidatedSource = 'params';

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

//Lo que hace esto es validar los query params
export const validateQuery = (schema: ZodType) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync(req.query);
      const q = req.query as any;
      for (const k of Object.keys(q)) delete q[k]; // limpio query
      Object.assign(q, parsed); // reasigno los valores parseados
      next();
    } catch (e) {
      if (e instanceof ZodError) return sendZodError(res, e);
      next(e);
    }
  };
};
