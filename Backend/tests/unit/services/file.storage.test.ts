jest.mock('../../../src/storage', () => ({
    getObjectStorage: jest.fn(),
}));

jest.mock('../../../src/config/prisma', () => {
    const db: any = {
        archivos: {
            findUnique: jest.fn(),
            create: jest.fn(),
            updateMany: jest.fn(),
            delete: jest.fn(),
        },
    };
    db.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(db));
    return { __esModule: true, default: db };
});

import prisma from '../../../src/config/prisma';
import { getObjectStorage } from '../../../src/storage';
import * as FileService from '../../../src/services/file.service';

const storage = {
    putObject: jest.fn(),
    getSignedReadUrl: jest.fn(),
    deleteObject: jest.fn(),
};
const db = prisma as any;
const admin = { role: 'ADMINISTRADOR' };
const plano = {
    id: 7,
    tipo: 'PLANO',
    estadoOperativo: 'OPERATIVO',
    idLoteAsociado: 3,
    ventaId: null,
};

beforeEach(() => {
    (getObjectStorage as jest.Mock).mockReturnValue(storage);
    storage.putObject.mockReset().mockResolvedValue(undefined);
    storage.getSignedReadUrl.mockReset().mockResolvedValue('https://storage.example/firmada');
    storage.deleteObject.mockReset().mockResolvedValue(undefined);
    db.archivos.findUnique.mockReset();
    db.archivos.create.mockReset();
    db.archivos.updateMany.mockReset();
    db.archivos.delete.mockReset();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
});

describe('uploadObject', () => {
    test('persiste application/octet-stream en una ruta única', async () => {
        const uploaded = await FileService.uploadObject(Buffer.from('%PDF'), {
            idLoteAsociado: 3,
            tipo: 'PLANO',
            filename: 'plano final.pdf',
            uploadedAt: new Date('2026-11-24T12:00:00Z'),
        });

        expect(uploaded.objectPath).toMatch(/^lote-3\/PLANO\/\d{4}-\d{2}\/[0-9a-f-]{36}-plano_final\.pdf$/);
        expect(storage.putObject).toHaveBeenCalledWith(
            uploaded.objectPath,
            expect.any(Buffer),
            'application/octet-stream',
        );
    });
});

describe('compensateUploadedObject', () => {
    test('borra solo el objeto indicado', async () => {
        await FileService.compensateUploadedObject('lote-3/PLANO/nuevo.pdf');
        expect(storage.deleteObject).toHaveBeenCalledTimes(1);
        expect(storage.deleteObject).toHaveBeenCalledWith('lote-3/PLANO/nuevo.pdf');
    });

    test('si la limpieza falla, no reemplaza el error original', async () => {
        storage.deleteObject.mockRejectedValue(new Error('cleanup failed'));
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        await expect(FileService.compensateUploadedObject('lote-3/PLANO/nuevo.pdf')).resolves.toBeUndefined();

        expect(warn).toHaveBeenCalled();
        expect(JSON.stringify(warn.mock.calls)).not.toContain('https://');
        warn.mockRestore();
    });
});

describe('sustituirArchivo', () => {
    const sustituir = () =>
        FileService.sustituirArchivo(7, Buffer.from('%PDF'), 'nuevo.pdf', 'admin@example.com', 'admin@example.com', admin);

    test('si la transacción falla, compensa solo el objeto nuevo', async () => {
        db.archivos.findUnique.mockResolvedValue(plano);
        db.archivos.updateMany.mockResolvedValue({ count: 1 });
        db.archivos.create.mockRejectedValue(new Error('db down'));

        await expect(sustituir()).rejects.toThrow('db down');

        expect(storage.putObject).toHaveBeenCalledTimes(1);
        expect(storage.deleteObject).toHaveBeenCalledTimes(1);
        expect(storage.deleteObject).toHaveBeenCalledWith(storage.putObject.mock.calls[0][0]);
        expect(db.archivos.create).toHaveBeenCalledTimes(1);
    });

    test('dos sustituciones concurrentes dejan una sola fila nueva', async () => {
        db.archivos.findUnique.mockResolvedValue(plano);
        let operativo = true;
        db.archivos.updateMany.mockImplementation(async ({ where }: { where: { estadoOperativo: string } }) => {
            if (where.estadoOperativo === 'OPERATIVO' && operativo) {
                operativo = false;
                return { count: 1 };
            }
            return { count: 0 };
        });
        db.archivos.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
            id: 8,
            createdAt: new Date(),
            updatedAt: new Date(),
            estadoOperativo: 'OPERATIVO',
            ...data,
        }));

        const [first, second] = await Promise.allSettled([sustituir(), sustituir()]);
        const ok = [first, second].filter((result) => result.status === 'fulfilled');
        const lost = [first, second].filter((result) => result.status === 'rejected');

        expect(ok).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expect((lost[0] as PromiseRejectedResult).reason).toMatchObject({
            statusCode: 400,
            message: 'No se puede sustituir un archivo eliminado',
        });
        expect(db.archivos.create).toHaveBeenCalledTimes(1);
        const winner = db.archivos.create.mock.calls[0][0].data.linkArchivo as string;
        expect(storage.deleteObject).toHaveBeenCalledTimes(1);
        expect(storage.deleteObject).not.toHaveBeenCalledWith(winner);
        expect(storage.putObject).toHaveBeenCalledTimes(2);
    });
});

describe('purgeFileById', () => {
    beforeEach(() => {
        db.archivos.findUnique.mockResolvedValue({ id: 7, linkArchivo: 'lote-3/PLANO/a.pdf' });
        db.archivos.delete.mockResolvedValue({ id: 7 });
    });

    test('borra el objeto y después la metadata', async () => {
        await FileService.purgeFileById(7);
        expect(storage.deleteObject).toHaveBeenCalledWith('lote-3/PLANO/a.pdf');
        expect(db.archivos.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    });

    test('un objeto ya ausente, reportado como éxito por el adaptador, borra la metadata', async () => {
        storage.deleteObject.mockResolvedValue(undefined);
        await expect(FileService.purgeFileById(7)).resolves.toBeUndefined();
        expect(db.archivos.delete).toHaveBeenCalledTimes(1);
    });

    test('un error real de storage conserva la metadata', async () => {
        storage.deleteObject.mockRejectedValue(new Error('storage down'));
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        await expect(FileService.purgeFileById(7)).rejects.toThrow('storage down');

        expect(db.archivos.delete).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    test('si storage responde y PostgreSQL falla, la fila queda para reintentar', async () => {
        db.archivos.delete.mockRejectedValue(new Error('db down'));
        await expect(FileService.purgeFileById(7)).rejects.toThrow('db down');
        expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    });
});

describe('generateSignedUrl', () => {
    test('pide la URL de lectura al proveedor configurado, sin armarla desde el cliente', async () => {
        const url = await FileService.generateSignedUrl('lote-3/PLANO/a.pdf', 3600);
        expect(url).toBe('https://storage.example/firmada');
        expect(storage.getSignedReadUrl).toHaveBeenCalledWith('lote-3/PLANO/a.pdf', 3600);
    });
});
