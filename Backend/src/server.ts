// server.ts
import app  from './app';
import cron from 'node-cron';
import { runExpirations } from './jobs/runExpirations';
import prisma from './config/prisma';
import { createShutdown } from './serverLifecycle';

const PORT = process.env.PORT || 3000;

// Control de cron jobs: por defecto activo (desarrollo), 
// deshabilitar en producción cuando usemos render Cron Jobs o similar
// Configurar ENABLE_CRON=false en Render para desactivar
const ENABLE_CRON = process.env.ENABLE_CRON !== 'false';

let expirationTask: ReturnType<typeof cron.schedule> | null = null;

const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);

    // Cron job: Ejecutar expiraciones cada hora
    // Solo activo si ENABLE_CRON=true o no está definido (desarrollo)
    if (ENABLE_CRON) {
        expirationTask = cron.schedule('0 * * * *', async () => {
            console.log('[CRON] Ejecutando verificación de expiraciones...');
            try {
                await runExpirations();
            } catch (error) {
                console.error('[CRON] Error en job de expiraciones:', error);
            }
        });
        console.log('[CRON] Scheduler iniciado: Verificación de expiraciones programada cada hora (0 * * * *)');
        console.log('[CRON] Para desactivar el cron en producción, configura ENABLE_CRON=false en Render');
    } else {
        console.log('[CRON] Cron deshabilitado. Se recomienda usar Render Cron Jobs en producción.');
        console.log('[CRON] Configura un Cron Job en Render con: npm run jobs:expirations');
    }
});

const shutdown = createShutdown({
    server,
    getExpirationTask: () => expirationTask,
    prisma,
});

process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
    void shutdown('SIGINT');
});
