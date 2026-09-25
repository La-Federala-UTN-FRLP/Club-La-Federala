import dotenv from 'dotenv';
import path from 'path';

/**
 * Carga `Backend/.env` sin sobrescribir variables ya presentes en el proceso
 * (shell, Docker, Cloud, CI).
 */
export function loadLocalEnv(): void {
    const envPath = path.resolve(__dirname, '../../.env');
    dotenv.config({ path: envPath, override: false });
}
