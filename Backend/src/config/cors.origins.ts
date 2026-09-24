/**
 * Allowlist CORS fail-closed: un origin exacto (FRONTEND_URL recortado)
 * más localhost:5173 fuera de production. Sin Origin se permite.
 * Default deny.
 */
export const LOCAL_DEV_ORIGIN = 'http://localhost:5173';

export function resolveCorsOrigin(
    origin: string | undefined,
    frontendUrl: string | undefined,
    nodeEnv: string | undefined,
): boolean {
    if (!origin) {
        return true;
    }

    const allowedOrigin = frontendUrl?.trim();

    if (allowedOrigin && origin === allowedOrigin) {
        return true;
    }

    if (nodeEnv !== 'production' && origin === LOCAL_DEV_ORIGIN) {
        return true;
    }

    return false;
}
