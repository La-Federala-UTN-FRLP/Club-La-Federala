/**
 * Almacenamiento de objetos usado por Files. Tres operaciones y nada más:
 * el servicio de dominio sigue dueño de rutas, metadata y autorización.
 */
export interface ObjectStorage {
    putObject(path: string, body: Buffer, contentType: string): Promise<void>;
    getSignedReadUrl(path: string, expiresInSeconds: number): Promise<string>;
    deleteObject(path: string): Promise<void>;
}

/** Mismo 409 que ya devolvía un path duplicado en Supabase. */
export class StorageConflictError extends Error {
    readonly statusCode = 409;

    constructor() {
        super('El archivo ya existe en storage (path duplicado). Reintente.');
        this.name = 'StorageConflictError';
    }
}

export function storageErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }
    return '';
}

export function storageHttpStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const record = error as { statusCode?: unknown; status?: unknown; code?: unknown };
    const raw = record.statusCode ?? record.status ?? record.code;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
    return undefined;
}

export function isStorageConflict(error: unknown): boolean {
    const status = storageHttpStatus(error);
    if (status === 409 || status === 412) return true;
    return /already exists|duplicate|precondition|conditionnotmet/i.test(storageErrorMessage(error));
}

export type DeleteFailureKind = 'missing-object' | 'missing-bucket' | 'failure';

const SUPABASE_MISSING_OBJECT = new Set([
    'Object not found',
    'The specified key does not exist.',
    'The specified key does not exist',
]);

const SUPABASE_MISSING_BUCKET = new Set([
    'Bucket not found',
    'The specified bucket does not exist',
    'The specified bucket does not exist.',
]);

/**
 * Borrado de Supabase. `remove()` devuelve el error del SDK (StorageApiError o el body):
 * `status` es el HTTP numérico y `statusCode` suele ser el string "404", así que no distingue
 * objeto de bucket. El mensaje y el código corto (`NoSuchKey` / `NoSuchBucket`) sí.
 * Un 404 con otro texto es ambiguo y falla.
 */
export function classifySupabaseDeleteError(error: unknown): DeleteFailureKind {
    const message = storageErrorMessage(error).trim();
    const code = supabaseErrorCode(error);
    if (code === 'NoSuchBucket' || SUPABASE_MISSING_BUCKET.has(message)) return 'missing-bucket';
    if (code === 'NoSuchKey' || SUPABASE_MISSING_OBJECT.has(message)) return 'missing-object';
    return 'failure';
}

/**
 * Borrado de GCS. `File#delete({ ignoreNotFound: true })` anula todo `code === 404`,
 * también "The specified bucket does not exist." Por eso no se usa.
 * `errors[].reason` es `notFound` en los dos casos; se distingue por el mensaje estable del JSON API.
 * `bucket.exists()` exigiría `storage.buckets.get`, que objectUser no tiene.
 */
export function classifyGcsDeleteError(error: unknown): DeleteFailureKind {
    if (!error || typeof error !== 'object' || (error as { code?: unknown }).code !== 404) return 'failure';
    const messages = gcsErrorMessages(error);
    if (messages.some((message) => message === 'The specified bucket does not exist.' || message === 'The specified bucket does not exist')) {
        return 'missing-bucket';
    }
    if (messages.some((message) => message.startsWith('No such object:'))) return 'missing-object';
    return 'failure';
}

function supabaseErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const record = error as { error?: unknown; statusCode?: unknown };
    if (typeof record.error === 'string' && /^[A-Za-z0-9]+$/.test(record.error)) return record.error;
    if (typeof record.statusCode === 'string' && /^[A-Za-z]/.test(record.statusCode)) return record.statusCode;
    return undefined;
}

function gcsErrorMessages(error: object): string[] {
    const messages: string[] = [];
    const inner = (error as { errors?: unknown }).errors;
    if (Array.isArray(inner)) {
        for (const item of inner) {
            if (item && typeof item === 'object' && typeof (item as { message?: unknown }).message === 'string') {
                messages.push((item as { message: string }).message.trim());
            }
        }
    }
    if (messages.length === 0 && error instanceof Error) messages.push(error.message.trim());
    return messages;
}

/**
 * Error interno de storage. No copia `statusCode`, `status` ni `code` del SDK:
 * si no, el controller trataría un 4xx del proveedor como error de dominio y
 * devolvería su mensaje. El texto queda para el log, que lo redacta.
 */
export function asStorageError(error: unknown, fallback: string): Error {
    const detail = storageErrorMessage(error).trim();
    const wrapped = new Error(detail || fallback);
    wrapped.name = 'StorageOperationError';
    return wrapped;
}
