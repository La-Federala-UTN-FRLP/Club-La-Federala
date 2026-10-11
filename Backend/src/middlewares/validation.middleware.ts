// src/middlewares/validation.middleware.ts
import { ZodError, ZodTypeAny } from 'zod';
import { Request, Response, NextFunction } from 'express';

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
export const validate = (schema: ZodTypeAny) => {
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


// Lo que hace esto es validar los parametros de la ruta
export const validateParams = (schema: ZodTypeAny, remap?: Record<string, string>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = remap
        ? Object.fromEntries(Object.entries(remap).map(([dst, src]) => [dst, (req.params as any)[src]]))
        : req.params;
      await schema.parseAsync(data);
      next();
    } catch (e) {
      if (e instanceof ZodError) return sendZodError(res, e);
      next(e);
    }
  };
};

//Lo que hace esto es validar los query params
export const validateQuery = (schema: ZodTypeAny) => {
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
