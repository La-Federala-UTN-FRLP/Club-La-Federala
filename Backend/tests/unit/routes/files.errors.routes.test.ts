// Errores de /api/files que dependen del input del cliente (ruta → controller → service real, Prisma mockeado).
// Regresión:
// - Multer corta un multipart con un campo de archivo que no es "file" con MulterError
//   (LIMIT_UNEXPECTED_FILE) y el middleware global lo trataba como error desconocido: 500.
// - POST /:id/restore y POST /:id/sustituir de un archivo inexistente respondían 400 porque el
//   controller detectaba el caso por message.includes("encontrado"); sustituir un tipo no soportado
//   respondía 500 (el mensaje no coincidía con ninguna de las subcadenas).
// El resto de los catches de Files no se toca acá.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        archivos: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
        venta: { findUnique: jest.fn() },
        $transaction: jest.fn(),
    },
}));

import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/config/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';

const archivosFindUnique = (prisma as any).archivos.findUnique as jest.Mock;
const archivosUpdate = (prisma as any).archivos.update as jest.Mock;

useTestWebEnv();

beforeEach(() => {
    archivosFindUnique.mockReset();
    archivosUpdate.mockReset();
});

const ADMIN = authHeader('ADMINISTRADOR');
const PDF = Buffer.from('%PDF-1.4 contenido de prueba');
const adjuntarPdf = (req: request.Test) => req.attach('file', PDF, { filename: 'doc.pdf', contentType: 'application/pdf' });

describe('POST /api/files — input multipart inválido', () => {
    test('un campo de archivo inesperado (foo) responde 400, no 500', async () => {
        const res = await request(app)
            .post('/api/files')
            .set(ADMIN)
            .field('idLoteAsociado', '1')
            .field('tipo', 'IMAGEN')
            .attach('foo', PDF, { filename: 'doc.pdf', contentType: 'application/pdf' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toEqual(expect.stringContaining('file'));
    });

    test('el campo de archivo inesperado también responde 400 en POST /:id/sustituir', async () => {
        const res = await request(app)
            .post('/api/files/7/sustituir')
            .set(ADMIN)
            .attach('foo', PDF, { filename: 'doc.pdf', contentType: 'application/pdf' });

        expect(res.status).toBe(400);
        expect(archivosFindUnique).not.toHaveBeenCalled();
    });

    test('LIMIT_FILE_SIZE conserva su respuesta: 400 con el mensaje de tamaño máximo', async () => {
        const grande = Buffer.alloc(20 * 1024 * 1024 + 1024, 0x41);
        const res = await request(app)
            .post('/api/files')
            .set(ADMIN)
            .field('idLoteAsociado', '1')
            .field('tipo', 'IMAGEN')
            .attach('file', grande, { filename: 'grande.pdf', contentType: 'application/pdf' });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Archivo demasiado grande. Tamaño máximo permitido: 20 MB.');
    });

    // No se convierte cualquier error de upload en 400: un fallo interno (no de Multer) sigue siendo 500.
    // (La exposición del mensaje en los catches de Files queda fuera de este bloque.)
    test('un error interno que no es de input del cliente sigue siendo 500', async () => {
        archivosFindUnique.mockRejectedValue(new Error('conexión caída'));
        const res = await adjuntarPdf(request(app).post('/api/files/7/sustituir').set(ADMIN));
        expect(res.status).toBe(500);
    });
});

describe('POST /api/files/:id/restore', () => {
    test('archivo inexistente responde 404 (antes 400)', async () => {
        archivosFindUnique.mockResolvedValue(null);
        const res = await request(app).post('/api/files/7/restore').set(ADMIN);
        expect(res.status).toBe(404);
        expect(res.body.message).toBe('Archivo no encontrado');
        expect(archivosUpdate).not.toHaveBeenCalled();
    });

    test('archivo que no está eliminado conserva su 400', async () => {
        archivosFindUnique.mockResolvedValue({ id: 7, estadoOperativo: 'OPERATIVO' });
        const res = await request(app).post('/api/files/7/restore').set(ADMIN);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Solo se pueden restaurar archivos eliminados');
        expect(archivosUpdate).not.toHaveBeenCalled();
    });
});

describe('POST /api/files/:id/sustituir', () => {
    test('archivo inexistente responde 404 (antes 400)', async () => {
        archivosFindUnique.mockResolvedValue(null);
        const res = await adjuntarPdf(request(app).post('/api/files/7/sustituir').set(ADMIN));
        expect(res.status).toBe(404);
        expect(res.body.message).toBe('Archivo no encontrado');
    });

    test('archivo eliminado conserva su 400', async () => {
        archivosFindUnique.mockResolvedValue({ id: 7, estadoOperativo: 'ELIMINADO', tipo: 'PLANO' });
        const res = await adjuntarPdf(request(app).post('/api/files/7/sustituir').set(ADMIN));
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('No se puede sustituir un archivo eliminado');
    });

    test('tipo no sustituible responde 400 (antes 500)', async () => {
        archivosFindUnique.mockResolvedValue({ id: 7, estadoOperativo: 'OPERATIVO', tipo: 'IMAGEN' });
        const res = await adjuntarPdf(request(app).post('/api/files/7/sustituir').set(ADMIN));
        expect(res.status).toBe(400);
        expect(res.body.message).toEqual(expect.stringContaining('IMAGEN'));
    });
});
