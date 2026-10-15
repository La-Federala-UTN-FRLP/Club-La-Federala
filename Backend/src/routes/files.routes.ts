import { Router } from 'express';
import multer from 'multer';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import {
    createFileMetadataSchema,
    updateAprobacionSchema,
    fileIdParamsSchema,
    fileVentaParamsSchema,
    fileLoteParamsSchema,
    filesByVentaQuerySchema,
} from '../validations/filemeta.validation';
import * as fileController from '../controllers/file.controller';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB (Etapa 5.4.3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const router = Router();

// GET /api/files/venta/:ventaId (antes de /:id para evitar conflicto)
router.get(
    '/venta/:ventaId',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO', 'INMOBILIARIA'),
    validateParams(fileVentaParamsSchema),
    validateQuery(filesByVentaQuerySchema),
    fileController.getAllFilesByVentaController);

//GET /api/files/lote/:idLoteAsociado
// Permitido para ADMINISTRADOR, GESTOR, TECNICO e INMOBILIARIA
// INMOBILIARIA puede ver las imágenes/archivos de los lotes
router.get(
    '/lote/:idLoteAsociado',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO', 'INMOBILIARIA'),
    validateParams(fileLoteParamsSchema),
    fileController.getAllFilesController);

//GET /api/files/:id
// Permitido para ADMINISTRADOR, GESTOR, TECNICO e INMOBILIARIA
// INMOBILIARIA puede ver los archivos de los lotes
router.get(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO', 'INMOBILIARIA'),
    validateParams(fileIdParamsSchema),
    fileController.getFileByIdController);

// Obtener URL firmada para descargar/ver archivo
// Permitido para ADMINISTRADOR, GESTOR, TECNICO e INMOBILIARIA
// INMOBILIARIA puede ver las imágenes/archivos de los lotes
router.post(
    '/:id/url',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO', 'INMOBILIARIA'),
    validateParams(fileIdParamsSchema),
    fileController.generateSignedUrlController);

// POST /api/files/:id/restore (Papelera)
router.post(
    '/:id/restore',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(fileIdParamsSchema),
    fileController.restoreFileController);

// DELETE /api/files/:id/purge (Purga definitiva, solo ADMIN)
router.delete(
    '/:id/purge',
    authenticate,
    authorize('ADMINISTRADOR'),
    validateParams(fileIdParamsSchema),
    fileController.purgeFileController);

// PATCH /api/files/:id/aprobaciones (Etapa 5.5)
router.patch(
    '/:id/aprobaciones',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO'),
    validateParams(fileIdParamsSchema),
    validate(updateAprobacionSchema),
    fileController.updateAprobacionController);

// POST /api/files/:id/sustituir (multipart)
router.post(
    '/:id/sustituir',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO'),
    validateParams(fileIdParamsSchema), // antes de multer: no se bufferea el archivo si el id es inválido
    upload.single('file'),
    fileController.sustituirArchivoController);

//POST /api/files
router.post(
    '/',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO'),
    upload.single('file'),
    validate(createFileMetadataSchema), 
    fileController.fileController.upload);

//PUT /api/files/:id
router.put(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    //validateParams(deleteFileMetadataSchema),
    //validate(updateFileMetadataSchema),
    fileController.updateFileController);

//DELETE /api/files/:id
router.delete(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(fileIdParamsSchema),
    fileController.deleteFileController);

export const fileRoutes = router;