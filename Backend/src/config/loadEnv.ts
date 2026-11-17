import dotenv from 'dotenv';
import path from 'path';

/**
 * Carga `Backend/.env` sin sobrescribir variables ya presentes en el proceso
 * (shell, Docker, Cloud, CI). `quiet`: sin el banner/tips de dotenv en stdout (los errores de
 * configuración los informa la validación de env, no dotenv).
 */
export function loadLocalEnv(): void {
    const envPath = path.resolve(__dirname, '../../.env');
    dotenv.config({ path: envPath, override: false, quiet: true });
}
