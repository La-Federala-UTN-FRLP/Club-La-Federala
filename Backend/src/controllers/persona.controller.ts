import { Request, Response } from 'express';
import { PersonaService, PersonaView } from '../services/persona.service';
import { createPersonaSchema, updatePersonaSchema, getPersonaSchema, deletePersonaSchema } from '../validations/persona.validation';
import { GetPersonasResponse, PostPersonaResponse, GetPersonaResponse, PutPersonaResponse, DeletePersonaResponse, PostPersonaRequest, PutPersonaRequest } from '../types/interfacesCCLF';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

const personaService = new PersonaService();

// Helper para mapear errores Prisma
function mapPrismaError(e: unknown): any {
  if (e instanceof PrismaClientKnownRequestError) {
    if (e.code === 'P2002') {
      const err: any = new Error('Ya existe una persona con ese identificador');
      err.statusCode = 409;
      return err;
    }
    if (e.code === 'P2025') {
      const err: any = new Error('Persona no encontrada');
      err.statusCode = 404;
      return err;
    }
  }
  return e;
}

export class PersonaController {
    async create(req: Request, res: Response) {
    try {
        const validatedData = createPersonaSchema.parse(req.body);
      const user = (req as any).user; // Del middleware de auth

      // Tomar jefeDeFamiliaId si viene en el body (opcional)
        const rawJefe = (req.body as any)?.jefeDeFamiliaId;
      const jefeDeFamiliaId =
        rawJefe !== undefined && rawJefe !== null && !Number.isNaN(Number(rawJefe))
          ? Number(rawJefe)
          : undefined;

      // Construir CreatePersonaDto
        const createData = {
        identificadorTipo: validatedData.identificadorTipo,
        identificadorValor: validatedData.identificadorValor,
        nombre: validatedData.nombre,
        apellido: validatedData.apellido,
        razonSocial: validatedData.razonSocial,
        telefono: validatedData.telefono,
        email: validatedData.email,
        ...(jefeDeFamiliaId !== undefined ? { jefeDeFamiliaId } : {}),
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
    } catch (error: any) {
      const mappedError = mapPrismaError(error);
      if (mappedError.errors) {
            res.status(400).json({
            success: false,
            message: 'Error de validación',
          errors: mappedError.errors,
        });
        } else {
        res.status(mappedError.statusCode || 400).json({
                success: false,
          message: mappedError.message || 'Error al crear la persona',
            });
        }
    }
}

async obtenerTodas(req: Request, res: Response) {
    try {
      const user = (req as any).user; // Del middleware de auth
      
      // Query params
      const view = (req.query.view as PersonaView) || 'ALL';
      const q = req.query.q as string | undefined;
      const includeInactive = req.query.includeInactive === 'true';
      const estado = req.query.estado as 'OPERATIVO' | 'ELIMINADO' | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const result = await personaService.findAll(user, {
        view,
        q,
        includeInactive,
        estadoOperativo: estado,
        limit,
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
        } catch (error: any) {
      const mappedError = mapPrismaError(error);
      res.status(mappedError.statusCode || 500).json({
            success: false,
        message: mappedError.message || 'Error al obtener las personas',
        });
    }
}

async obtenerPersonaPorId(req: Request, res: Response) {
    try {
        const { id } = getPersonaSchema.parse(req.params);
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
    } catch (error: any) {
      const mappedError = mapPrismaError(error);
      if (mappedError.errors) {
            res.status(400).json({
            success: false,
            message: 'Error de validación',
          errors: mappedError.errors,
            });
        } else {
        res.status(mappedError.statusCode || 404).json({
                success: false,
          message: mappedError.message || 'Persona no encontrada',
            });
        }
    }
}

async actualizarPersona(req: Request, res: Response) {
    try {
        const { id } = getPersonaSchema.parse(req.params);
        const validatedData = updatePersonaSchema.parse(req.body);

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
    } catch (error: any) {
      const mappedError = mapPrismaError(error);
      if (mappedError.errors) {
            res.status(400).json({
            success: false,
            message: 'Error de validación',
          errors: mappedError.errors,
            });
        } else {
        res.status(mappedError.statusCode || 400).json({
                success: false,
          message: mappedError.message || 'Error al actualizar la persona',
            });
        }
    }
}

  async desactivarPersona(req: Request, res: Response) {
    try {
      const { id } = deletePersonaSchema.parse(req.params);
      const response: DeletePersonaResponse = await personaService.desactivarPersona(id);

      res.status(200).json({
        success: true,
        ...response,
      });
    } catch (error: any) {
      const mappedError = mapPrismaError(error);
      res.status(mappedError.statusCode || 400).json({
        success: false,
        message: mappedError.message || 'Error al desactivar la persona',
      });
    }
  }

  async reactivarPersona(req: Request, res: Response) {
    try {
      const { id } = deletePersonaSchema.parse(req.params);
      const response: PutPersonaResponse = await personaService.reactivarPersona(id);

      res.status(200).json({
        success: true,
        ...response,
      });
    } catch (error: any) {
      const mappedError = mapPrismaError(error);
      res.status(mappedError.statusCode || 400).json({
        success: false,
        message: mappedError.message || 'Error al reactivar la persona',
      });
    }
  }

async eliminarPersona(req: Request, res: Response) {
    try {
        const { id } = deletePersonaSchema.parse(req.params);
      const response: DeletePersonaResponse = await personaService.deletePersonaDefinitivo(id);

        res.status(200).json({
            success: true,
        ...response,
        });
        } catch (error: any) {
      const mappedError = mapPrismaError(error);
      if (mappedError.statusCode === 409) {
        res.status(409).json({
            success: false,
          message: mappedError.message || 'No se puede eliminar definitivamente porque tiene asociaciones',
            });
        } else {
        res.status(mappedError.statusCode || 400).json({
                success: false,
          message: mappedError.message || 'Error al eliminar la persona',
            });
        }
    }
}

async obtenerPersonaPorCuil(req: Request, res: Response) {
    try {
        const { cuil } = req.params;
        
      // Usar método legacy que busca primero por identificadorTipo=CUIL y luego por campo cuil
        const persona = await personaService.findByCuil(cuil);

        if (!persona) {
            return res.status(404).json({
            success: false,
          message: 'Persona no encontrada',
            });
        }

        const response: GetPersonaResponse = {
            persona,
        message: 'Persona obtenida exitosamente',
        };

        res.status(200).json({
            success: true,
        ...response,
        });
        } catch (error: any) {
      const mappedError = mapPrismaError(error);
      res.status(mappedError.statusCode || 500).json({
                success: false,
        message: mappedError.message || 'Error al buscar la persona',
            });
        }
    }

  async obtenerGrupoFamiliar(req: Request, res: Response) {
    try {
      const { id } = getPersonaSchema.parse(req.params);
      const grupo = await personaService.getGrupoFamiliar(id);

      res.status(200).json({
        success: true,
        ...grupo,
      });
    } catch (error: any) {
      const mappedError = mapPrismaError(error);
      res.status(mappedError.statusCode || 400).json({
        success: false,
        message: mappedError.message || 'Error al obtener grupo familiar',
      });
    }
  }

  async crearMiembroFamiliar(req: Request, res: Response) {
    try {
      const { id } = getPersonaSchema.parse(req.params);
      const { nombre, apellido, identificadorTipo, identificadorValor } = req.body;

      if (!nombre || !apellido || !identificadorTipo || !identificadorValor) {
        return res.status(400).json({
          success: false,
          message: 'Faltan campos requeridos: nombre, apellido, identificadorTipo, identificadorValor',
        });
      }

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
    } catch (error: any) {
      const mappedError = mapPrismaError(error);
      res.status(mappedError.statusCode || 400).json({
        success: false,
        message: mappedError.message || 'Error al crear miembro familiar',
      });
    }
  }

  async eliminarMiembroFamiliar(req: Request, res: Response) {
    try {
      const { id, miembroId } = req.params;
      const titularId = Number(id);
      const miembroIdNum = Number(miembroId);

      if (isNaN(titularId) || isNaN(miembroIdNum)) {
        return res.status(400).json({
          success: false,
          message: 'IDs inválidos',
        });
      }

      await personaService.eliminarMiembroFamiliar(titularId, miembroIdNum);

      res.status(200).json({
        success: true,
        message: 'Miembro familiar eliminado exitosamente',
      });
    } catch (error: any) {
      const mappedError = mapPrismaError(error);
      res.status(mappedError.statusCode || 400).json({
        success: false,
        message: mappedError.message || 'Error al eliminar miembro familiar',
      });
    }
  }
}
