import { Request, Response, NextFunction } from 'express';
import { PersonaService } from '../services/persona.service';
import { getPersonaSchema, cuilParamsSchema, deletePersonaSchema, miembroFamiliarParamsSchema, queryPersonasSchema, CreateMiembroFamiliarInput, CreatePersonaInput, UpdatePersonaInput } from '../validations/persona.validation';
import { GetPersonasResponse, PostPersonaResponse, GetPersonaResponse, PutPersonaResponse, DeletePersonaResponse, PostPersonaRequest, PutPersonaRequest } from '../types/interfacesCCLF';
import { validatedParams, validatedQuery } from '../middlewares/validation.middleware';

const personaService = new PersonaService();

export class PersonaController {
    async create(req: Request, res: Response, next: NextFunction) {
    try {
      // Body ya validado y normalizado por createPersonaSchema en la ruta (IDs ya son number).
      const validatedData = req.body as CreatePersonaInput;
      const user = (req as any).user; // Del middleware de auth

      // Construir CreatePersonaDto
        const createData = {
        identificadorTipo: validatedData.identificadorTipo,
        identificadorValor: validatedData.identificadorValor,
        nombre: validatedData.nombre,
        apellido: validatedData.apellido,
        razonSocial: validatedData.razonSocial,
        telefono: validatedData.telefono,
        email: validatedData.email,
        ...(validatedData.jefeDeFamiliaId !== undefined ? { jefeDeFamiliaId: validatedData.jefeDeFamiliaId } : {}),
        ...(validatedData.inmobiliariaId !== undefined ? { inmobiliariaId: validatedData.inmobiliariaId } : {}),
        };

      const persona = await personaService.create(createData, user);

        const response: PostPersonaResponse = {
            persona,
        message: 'Persona creada exitosamente',
        };

        res.status(201).json({
            success: true,
        ...response,
        });
    } catch (error) {
      next(error);
    }
}

async obtenerTodas(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user; // Del middleware de auth
      
      // Query ya validada y convertida en la ruta: includeInactive es boolean y limit es number.
      const query = validatedQuery(req, queryPersonasSchema);

      const result = await personaService.findAll(user, {
        view: query.view ?? 'ALL',
        q: query.q,
        includeInactive: query.includeInactive ?? false,
        estadoOperativo: query.estado,
        limit: query.limit,
      });

        const response: GetPersonasResponse = {
            personas: result.personas,
        total: result.total,
        };

        res.status(200).json({
            success: true,
            message: 'Personas obtenidas exitosamente',
        ...response,
        });
        } catch (error) {
      next(error);
    }
}

async obtenerPersonaPorId(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = validatedParams(req, getPersonaSchema);
      const user = (req as any).user; // Del middleware de auth

      const persona = await personaService.findById(id, user);

        const response: GetPersonaResponse = {
            persona,
        message: 'Persona obtenida exitosamente',
        };

        res.status(200).json({
            success: true,
        ...response,
        });
    } catch (error) {
      next(error);
    }
}

async actualizarPersona(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = validatedParams(req, getPersonaSchema);
        // Body ya validado y normalizado por updatePersonaSchema en la ruta.
        const validatedData = req.body as UpdatePersonaInput;

      // Construir UpdatePersonaDto: solo incluir campos que vienen en el request
      const updateData: any = {};
      
      if (validatedData.identificadorTipo !== undefined) updateData.identificadorTipo = validatedData.identificadorTipo;
      if (validatedData.identificadorValor !== undefined) updateData.identificadorValor = validatedData.identificadorValor;
      if (validatedData.nombre !== undefined) updateData.nombre = validatedData.nombre;
      if (validatedData.apellido !== undefined) updateData.apellido = validatedData.apellido;
      if (validatedData.razonSocial !== undefined) updateData.razonSocial = validatedData.razonSocial;
      if (validatedData.telefono !== undefined) updateData.telefono = validatedData.telefono;
      if (validatedData.email !== undefined) updateData.email = validatedData.email;
      if (validatedData.jefeDeFamiliaId !== undefined) updateData.jefeDeFamiliaId = validatedData.jefeDeFamiliaId;
      if (validatedData.estado !== undefined) updateData.estado = validatedData.estado;
      if (validatedData.inmobiliariaId !== undefined) updateData.inmobiliariaId = validatedData.inmobiliariaId;

        const result = await personaService.update(id, updateData);

        const response: PutPersonaResponse = {
            persona: result.persona,
        message: result.message,
        };

        res.status(200).json({
            success: true,
        ...response,
        });
    } catch (error) {
      next(error);
    }
}

  async desactivarPersona(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = validatedParams(req, deletePersonaSchema);
      const response: DeletePersonaResponse = await personaService.desactivarPersona(id);

      res.status(200).json({
        success: true,
        ...response,
      });
    } catch (error) {
      next(error);
    }
  }

  async reactivarPersona(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = validatedParams(req, deletePersonaSchema);
      const response: PutPersonaResponse = await personaService.reactivarPersona(id);

      res.status(200).json({
        success: true,
        ...response,
      });
    } catch (error) {
      next(error);
    }
  }

async eliminarPersona(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = validatedParams(req, deletePersonaSchema);
      const response: DeletePersonaResponse = await personaService.deletePersonaDefinitivo(id);

        res.status(200).json({
            success: true,
        ...response,
        });
        } catch (error) {
      next(error);
    }
}

async obtenerPersonaPorCuil(req: Request, res: Response, next: NextFunction) {
    try {
        // CUIL ya validado y normalizado en la ruta: string de 11 dígitos.
        const { cuil } = validatedParams(req, cuilParamsSchema);
        
      // Usar método legacy que busca primero por identificadorTipo=CUIL y luego por campo cuil
        const persona = await personaService.findByCuil(cuil);

        if (!persona) {
          return next(Object.assign(new Error('Persona no encontrada'), { statusCode: 404 }));
        }

        const response: GetPersonaResponse = {
            persona,
        message: 'Persona obtenida exitosamente',
        };

        res.status(200).json({
            success: true,
        ...response,
        });
        } catch (error) {
      next(error);
    }
    }

  async obtenerGrupoFamiliar(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = validatedParams(req, getPersonaSchema);
      const grupo = await personaService.getGrupoFamiliar(id);

      res.status(200).json({
        success: true,
        ...grupo,
      });
    } catch (error) {
      next(error);
    }
  }

  async crearMiembroFamiliar(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = validatedParams(req, getPersonaSchema);
      // Body validado y normalizado por createMiembroFamiliarSchema en la ruta
      const { nombre, apellido, identificadorTipo, identificadorValor } = req.body as CreateMiembroFamiliarInput;

      const miembro = await personaService.crearMiembroFamiliar(id, {
        nombre,
        apellido,
        identificadorTipo,
        identificadorValor,
      });

      res.status(201).json({
        success: true,
        miembro,
        message: 'Miembro familiar creado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  async eliminarMiembroFamiliar(req: Request, res: Response, next: NextFunction) {
    try {
      // Params ya validados y convertidos en la ruta (miembroFamiliarParamsSchema)
      const { id: titularId, miembroId } = validatedParams(req, miembroFamiliarParamsSchema);

      await personaService.eliminarMiembroFamiliar(titularId, miembroId);

      res.status(200).json({
        success: true,
        message: 'Miembro familiar eliminado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }
}
