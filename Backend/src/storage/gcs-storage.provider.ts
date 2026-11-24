import { Storage } from '@google-cloud/storage';
import {
    asStorageError,
    classifyGcsDeleteError,
    isStorageConflict,
    StorageConflictError,
    type ObjectStorage,
} from './object-storage';

/**
 * Adaptador de Google Cloud Storage con Application Default Credentials.
 * No recibe clave JSON ni GOOGLE_APPLICATION_CREDENTIALS: en Cloud Run la
 * identidad es la service account del servicio. La firma V4 usa IAM signBlob
 * cuando la credencial no trae clave privada.
 */
export class GcsStorageProvider implements ObjectStorage {
    private client: Storage | null = null;

    constructor(private readonly bucketName: string) {}

    private storage(): Storage {
        if (!this.client) {
            this.client = new Storage();
        }
        return this.client;
    }

    private file(path: string) {
        return this.storage().bucket(this.bucketName).file(path);
    }

    async putObject(path: string, body: Buffer, contentType: string): Promise<void> {
        try {
            await this.file(path).save(body, {
                resumable: false,
                contentType,
                preconditionOpts: { ifGenerationMatch: 0 },
            });
        } catch (error) {
            if (isStorageConflict(error)) throw new StorageConflictError();
            throw asStorageError(error, 'Error uploading file');
        }
    }

    async getSignedReadUrl(path: string, expiresInSeconds: number): Promise<string> {
        try {
            const [url] = await this.file(path).getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + expiresInSeconds * 1000,
            });
            if (!url) throw asStorageError(undefined, 'Error generating signed URL');
            return url;
        } catch (error) {
            if (error instanceof Error && error.name === 'StorageOperationError') throw error;
            throw asStorageError(error, 'Error generating signed URL');
        }
    }

    async deleteObject(path: string): Promise<void> {
        try {
            await this.file(path).delete();
        } catch (error) {
            if (classifyGcsDeleteError(error) === 'missing-object') return;
            throw asStorageError(error, 'Error deleting object');
        }
    }
}
