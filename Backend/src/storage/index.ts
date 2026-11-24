import { getWebEnv, type StorageProvider } from '../config/env';
import { GcsStorageProvider } from './gcs-storage.provider';
import type { ObjectStorage } from './object-storage';
import { SupabaseStorageProvider } from './supabase-storage.provider';

export type { ObjectStorage } from './object-storage';
export { StorageConflictError } from './object-storage';

let cached: ObjectStorage | null = null;
let cachedProvider: StorageProvider | null = null;

/**
 * Proveedor elegido en el arranque. El otro cliente no se construye.
 * La caché se descarta en tests cuando cambia el entorno.
 */
export function getObjectStorage(): ObjectStorage {
    const env = getWebEnv();
    if (cached && cachedProvider === env.storageProvider) return cached;

    cached = env.storageProvider === 'gcs'
        ? new GcsStorageProvider(env.gcsBucket)
        : new SupabaseStorageProvider(env.supabaseUrl, env.supabaseServiceKey, env.supabaseBucket);
    cachedProvider = env.storageProvider;
    return cached;
}

export function resetObjectStorageForTests(): void {
    cached = null;
    cachedProvider = null;
}
