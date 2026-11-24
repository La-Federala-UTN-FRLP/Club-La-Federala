import { createClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';
import { initWebEnv, resetWebEnvForTests } from '../../../src/config/env';
import { StorageConflictError } from '../../../src/storage/object-storage';
import { getObjectStorage, resetObjectStorageForTests } from '../../../src/storage';

const supabaseUpload = jest.fn();
const supabaseSigned = jest.fn();
const supabaseRemove = jest.fn();
const supabaseFrom = jest.fn(() => ({
    upload: supabaseUpload,
    createSignedUrl: supabaseSigned,
    remove: supabaseRemove,
}));

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({ storage: { from: supabaseFrom } })),
}));

const gcsSave = jest.fn();
const gcsSigned = jest.fn();
const gcsDelete = jest.fn();
const gcsFile = jest.fn(() => ({ save: gcsSave, getSignedUrl: gcsSigned, delete: gcsDelete }));
const gcsBucket = jest.fn(() => ({ file: gcsFile }));

jest.mock('@google-cloud/storage', () => ({
    Storage: jest.fn(() => ({ bucket: gcsBucket })),
}));

const baseEnv = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/federala',
    JWT_SECRET: 'unit-test-jwt-secret',
};

const supabaseEnv = {
    ...baseEnv,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_KEY: 'unit-test-service-key',
    SUPABASE_BUCKET: 'lotes-files',
};

const gcsEnv = {
    ...baseEnv,
    STORAGE_PROVIDER: 'gcs',
    GCS_BUCKET: 'federala-staging-files-28822223940',
};

const body = Buffer.from('pdf');

beforeEach(() => {
    resetWebEnvForTests();
    resetObjectStorageForTests();
    supabaseUpload.mockReset().mockResolvedValue({ error: null });
    supabaseSigned.mockReset().mockResolvedValue({ data: { signedUrl: 'https://example.supabase.co/firmada' }, error: null });
    supabaseRemove.mockReset().mockResolvedValue({ data: null, error: null });
    gcsSave.mockReset().mockResolvedValue(undefined);
    gcsSigned.mockReset().mockResolvedValue(['https://storage.googleapis.com/b/o?X-Goog-Signature=abc']);
    gcsDelete.mockReset().mockResolvedValue([{}]);
});

afterAll(() => {
    resetWebEnvForTests();
    resetObjectStorageForTests();
});

describe('SupabaseStorageProvider', () => {
    function storage() {
        initWebEnv(supabaseEnv);
        return getObjectStorage();
    }

    test('sube sin sobrescribir y no construye el cliente de GCS', async () => {
        await storage().putObject('lote-1/PLANO/a.pdf', body, 'application/octet-stream');

        expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'unit-test-service-key');
        expect(supabaseFrom).toHaveBeenCalledWith('lotes-files');
        expect(supabaseUpload).toHaveBeenCalledWith('lote-1/PLANO/a.pdf', body, {
            contentType: 'application/octet-stream',
            upsert: false,
        });
        expect(Storage).not.toHaveBeenCalled();
    });

    test('firma una URL de lectura con la expiración pedida', async () => {
        const url = await storage().getSignedReadUrl('lote-1/PLANO/a.pdf', 3600);

        expect(url).toBe('https://example.supabase.co/firmada');
        expect(supabaseSigned).toHaveBeenCalledWith('lote-1/PLANO/a.pdf', 3600, { download: false });
    });

    test('propaga el error del SDK al firmar', async () => {
        supabaseSigned.mockResolvedValue({ data: null, error: { message: 'firma rechazada' } });
        await expect(storage().getSignedReadUrl('lote-1/PLANO/a.pdf', 60)).rejects.toThrow('firma rechazada');
    });

    test('un objeto duplicado es 409 y otro error del SDK se propaga', async () => {
        supabaseUpload.mockResolvedValue({ error: { message: 'The resource already exists' } });
        await expect(storage().putObject('p', body, 'application/octet-stream')).rejects.toBeInstanceOf(StorageConflictError);

        supabaseUpload.mockResolvedValue({ error: { message: 'network down' } });
        await expect(storage().putObject('p', body, 'application/octet-stream')).rejects.toThrow('network down');
    });

    test('eliminar distingue objeto ausente, bucket ausente, 404 ambiguo y permisos', async () => {
        supabaseRemove.mockResolvedValue({ data: [], error: null });
        await expect(storage().deleteObject('p')).resolves.toBeUndefined();

        supabaseRemove.mockResolvedValue({ error: { message: 'Object not found', statusCode: '404', status: 404 } });
        await expect(storage().deleteObject('p')).resolves.toBeUndefined();

        supabaseRemove.mockResolvedValue({
            error: { message: 'The specified key does not exist.', statusCode: 'NoSuchKey', status: 404 },
        });
        await expect(storage().deleteObject('p')).resolves.toBeUndefined();

        supabaseRemove.mockResolvedValue({
            error: { message: 'Bucket not found', error: 'NoSuchBucket', statusCode: '404', status: 404 },
        });
        await expect(storage().deleteObject('p')).rejects.toMatchObject({
            name: 'StorageOperationError',
            message: 'Bucket not found',
        });

        supabaseRemove.mockResolvedValue({ error: { message: 'Not Found', statusCode: 404, status: 404 } });
        const ambiguous = await storage().deleteObject('p').then(() => null, (error: Error) => error);
        expect(ambiguous).toMatchObject({ name: 'StorageOperationError', message: 'Not Found' });
        expect(ambiguous).not.toHaveProperty('statusCode');

        supabaseRemove.mockResolvedValue({
            error: Object.assign(new Error('MARKER-storage-403'), { statusCode: 403, status: 403 }),
        });
        const denied = await storage().deleteObject('p').then(() => null, (error: Error) => error);
        expect(denied).toMatchObject({ name: 'StorageOperationError', message: 'MARKER-storage-403' });
        expect(denied).not.toHaveProperty('statusCode');
        expect(denied).not.toHaveProperty('status');
    });
});

describe('GcsStorageProvider', () => {
    function storage() {
        initWebEnv(gcsEnv);
        return getObjectStorage();
    }

    test('sube con precondición, sin ACL pública, y no construye el cliente de Supabase', async () => {
        await storage().putObject('lote-1/PLANO/a.pdf', body, 'application/octet-stream');

        expect(Storage).toHaveBeenCalledTimes(1);
        expect(Storage).toHaveBeenCalledWith();
        expect(createClient).not.toHaveBeenCalled();
        expect(gcsBucket).toHaveBeenCalledWith('federala-staging-files-28822223940');
        expect(gcsFile).toHaveBeenCalledWith('lote-1/PLANO/a.pdf');
        const options = gcsSave.mock.calls[0][1];
        expect(options).toEqual({
            resumable: false,
            contentType: 'application/octet-stream',
            preconditionOpts: { ifGenerationMatch: 0 },
        });
        expect(options).not.toHaveProperty('predefinedAcl');
        expect(options).not.toHaveProperty('public');
    });

    test('una precondición fallida es 409', async () => {
        gcsSave.mockRejectedValue(Object.assign(new Error('Precondition Failed'), { code: 412 }));
        await expect(storage().putObject('p', body, 'application/octet-stream')).rejects.toBeInstanceOf(StorageConflictError);
    });

    test('propaga un error de subida que no es conflicto', async () => {
        gcsSave.mockRejectedValue(Object.assign(new Error('quota exceeded'), { code: 429 }));
        await expect(storage().putObject('p', body, 'application/octet-stream')).rejects.toThrow('quota exceeded');
    });

    test('firma V4 de lectura por 3600 segundos', async () => {
        const before = Date.now();
        const url = await storage().getSignedReadUrl('lote-1/PLANO/a.pdf', 3600);

        expect(url).toBe('https://storage.googleapis.com/b/o?X-Goog-Signature=abc');
        const config = gcsSigned.mock.calls[0][0];
        expect(config.version).toBe('v4');
        expect(config.action).toBe('read');
        expect(config.expires).toBeGreaterThanOrEqual(before + 3600 * 1000);
        expect(config.expires).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
    });

    test('propaga el error del SDK al firmar', async () => {
        gcsSigned.mockRejectedValue(new Error('iam.serviceAccounts.signBlob denied'));
        await expect(storage().getSignedReadUrl('p', 3600)).rejects.toThrow('signBlob');
    });

    test('borra el objeto, acepta uno ya ausente y rechaza bucket, 404 ambiguo y permisos', async () => {
        await storage().deleteObject('lote-1/PLANO/a.pdf');
        expect(gcsDelete).toHaveBeenCalledWith();

        gcsDelete.mockRejectedValue({
            code: 404,
            message: 'No such object: federala-staging-files-28822223940/lote-1/PLANO/a.pdf',
            errors: [{
                reason: 'notFound',
                message: 'No such object: federala-staging-files-28822223940/lote-1/PLANO/a.pdf',
            }],
        });
        await expect(storage().deleteObject('lote-1/PLANO/a.pdf')).resolves.toBeUndefined();

        gcsDelete.mockRejectedValue({
            code: 404,
            message: 'The specified bucket does not exist.',
            errors: [{ reason: 'notFound', message: 'The specified bucket does not exist.' }],
        });
        await expect(storage().deleteObject('lote-1/PLANO/a.pdf')).rejects.toMatchObject({
            name: 'StorageOperationError',
            message: 'The specified bucket does not exist.',
        });

        gcsDelete.mockRejectedValue({
            code: 404,
            message: 'Not Found',
            errors: [{ reason: 'notFound', message: 'Not Found' }],
        });
        await expect(storage().deleteObject('lote-1/PLANO/a.pdf')).rejects.toMatchObject({
            name: 'StorageOperationError',
            message: 'Not Found',
        });

        gcsDelete.mockRejectedValue(Object.assign(new Error('MARKER-storage-403'), { code: 403, statusCode: 403 }));
        const denied = await storage().deleteObject('lote-1/PLANO/a.pdf').then(() => null, (error: Error) => error);
        expect(denied).toMatchObject({ name: 'StorageOperationError', message: 'MARKER-storage-403' });
        expect(denied).not.toHaveProperty('statusCode');
        expect(denied).not.toHaveProperty('code');
    });
});
