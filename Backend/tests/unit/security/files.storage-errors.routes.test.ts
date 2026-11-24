// Errores del SDK de storage, a través del adaptador real y del controller.
// Un statusCode 4xx del proveedor no es un error de dominio: la respuesta es 500
// y el mensaje interno no sale. El 409 de path duplicado sí conserva su contrato.
const supabaseUpload = jest.fn();
const supabaseRemove = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({
        storage: {
            from: () => ({
                upload: supabaseUpload,
                remove: supabaseRemove,
                createSignedUrl: jest.fn(),
            }),
        },
    })),
}));

jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        archivos: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
        venta: { findUnique: jest.fn() },
        lote: { findUnique: jest.fn() },
    },
}));

import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/config/prisma';
import { resetObjectStorageForTests } from '../../../src/storage';
import { authHeader, useTestWebEnv } from '../../support/http';

const db = prisma as unknown as {
    archivos: { findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock };
};

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');
const PDF = Buffer.from('%PDF-1.4 contenido de prueba');
const MARKER = 'MARKER-storage-interno';
const fila = {
    id: 7,
    tipo: 'PLANO',
    ventaId: null,
    estadoOperativo: 'OPERATIVO',
    idLoteAsociado: 3,
    linkArchivo: 'lote-3/PLANO/a.pdf',
};

beforeEach(() => {
    resetObjectStorageForTests();
    supabaseUpload.mockReset();
    supabaseRemove.mockReset();
    db.archivos.findUnique.mockReset().mockResolvedValue(fila);
    db.archivos.delete.mockReset().mockResolvedValue(fila);
    db.archivos.create.mockReset();
});

const subir = () =>
    request(app)
        .post('/api/files')
        .set(ADMIN)
        .field('idLoteAsociado', '3')
        .field('tipo', 'PLANO')
        .attach('file', PDF, { filename: 'doc.pdf', contentType: 'application/pdf' });

function expect500SinDetalle(res: request.Response, message: string) {
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, code: 'INTERNAL_ERROR', message });
    expect(JSON.stringify(res.body)).not.toContain(MARKER);
}

describe('errores del proveedor en HTTP', () => {
    test('403 del SDK al subir responde 500 y no expone el mensaje', async () => {
        supabaseUpload.mockResolvedValue({
            error: Object.assign(new Error(`${MARKER} permission denied`), { statusCode: 403, status: 403 }),
        });

        const res = await subir();

        expect500SinDetalle(res, 'Error al subir archivo');
        expect(db.archivos.create).not.toHaveBeenCalled();
    });

    test('409 de path duplicado conserva el mensaje de negocio', async () => {
        supabaseUpload.mockResolvedValue({
            error: { message: `${MARKER} The resource already exists`, statusCode: 409, status: 409 },
        });

        const res = await subir();

        expect(res.status).toBe(409);
        expect(res.body).toEqual({
            success: false,
            code: 'CONFLICT',
            message: 'El archivo ya existe en storage (path duplicado). Reintente.',
        });
        expect(JSON.stringify(res.body)).not.toContain(MARKER);
        expect(db.archivos.create).not.toHaveBeenCalled();
    });

    test('404 ambiguo al purgar responde 500 y conserva la metadata', async () => {
        supabaseRemove.mockResolvedValue({
            error: { message: `${MARKER} Not Found`, status: 404, statusCode: 404 },
        });

        const res = await request(app).delete('/api/files/7/purge').set(ADMIN);

        expect500SinDetalle(res, 'Error al purgar archivo');
        expect(db.archivos.delete).not.toHaveBeenCalled();
    });

    test('bucket inexistente al purgar responde 500 y conserva la metadata', async () => {
        supabaseRemove.mockResolvedValue({
            error: { message: 'Bucket not found', error: 'NoSuchBucket', status: 404, statusCode: '404' },
        });

        const res = await request(app).delete('/api/files/7/purge').set(ADMIN);

        expect(res.status).toBe(500);
        expect(res.body.message).toBe('Error al purgar archivo');
        expect(JSON.stringify(res.body)).not.toContain('Bucket not found');
        expect(db.archivos.delete).not.toHaveBeenCalled();
    });

    test('objeto ya inexistente permite completar la purga', async () => {
        supabaseRemove.mockResolvedValue({
            error: { message: 'Object not found', statusCode: '404', status: 404 },
        });

        const res = await request(app).delete('/api/files/7/purge').set(ADMIN);

        expect(res.status).toBe(204);
        expect(db.archivos.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    });
});
