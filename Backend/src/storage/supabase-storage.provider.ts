import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
    asStorageError,
    classifySupabaseDeleteError,
    isStorageConflict,
    StorageConflictError,
    type ObjectStorage,
} from './object-storage';

/**
 * Adaptador de Supabase Storage. El cliente se crea en la primera operación,
 * no al importar el módulo ni al validar el entorno.
 */
export class SupabaseStorageProvider implements ObjectStorage {
    private client: SupabaseClient | null = null;

    constructor(
        private readonly url: string,
        private readonly serviceKey: string,
        private readonly bucket: string,
    ) {}

    private bucketApi() {
        if (!this.client) {
            this.client = createClient(this.url, this.serviceKey);
        }
        return this.client.storage.from(this.bucket);
    }

    async putObject(path: string, body: Buffer, contentType: string): Promise<void> {
        const { error } = await this.bucketApi().upload(path, body, {
            contentType,
            upsert: false,
        });
        if (!error) return;
        if (isStorageConflict(error)) throw new StorageConflictError();
        throw asStorageError(error, 'Error uploading file');
    }

    async getSignedReadUrl(path: string, expiresInSeconds: number): Promise<string> {
        const { data, error } = await this.bucketApi().createSignedUrl(path, expiresInSeconds, { download: false });
        if (error || !data?.signedUrl) {
            throw asStorageError(error, 'Error generating signed URL');
        }
        return data.signedUrl;
    }

    async deleteObject(path: string): Promise<void> {
        const { error } = await this.bucketApi().remove([path]);
        if (!error) return;
        const kind = classifySupabaseDeleteError(error);
        if (kind === 'missing-object') return;
        throw asStorageError(error, 'Error deleting object');
    }
}
