export const SHUTDOWN_TIMEOUT_MS = 10_000;

export type ShutdownServer = {
    close: (callback?: (err?: Error) => void) => unknown;
    closeIdleConnections: () => void;
    closeAllConnections: () => void;
};

export type ExpirationTask = {
    stop: () => void | Promise<void>;
};

export type ShutdownPrisma = {
    $disconnect: () => Promise<void>;
};

export type ShutdownOptions = {
    server: ShutdownServer;
    getExpirationTask: () => ExpirationTask | null;
    prisma: ShutdownPrisma;
    timeoutMs?: number;
    log?: (message: string) => void;
    logError?: (message: string, err?: unknown) => void;
    exit?: (code: number) => void;
    setExitCode?: (code: number) => void;
};

function closeHttpServer(server: ShutdownServer): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
        server.closeIdleConnections();
    });
}

export function createShutdown(options: ShutdownOptions): (signal: string) => Promise<void> {
    let isShuttingDown = false;
    const timeoutMs = options.timeoutMs ?? SHUTDOWN_TIMEOUT_MS;
    const log = options.log ?? ((message) => console.log(message));
    const logError = options.logError ?? ((message, err) => {
        if (err !== undefined) {
            console.error(message, err);
            return;
        }
        console.error(message);
    });
    const exit = options.exit ?? ((code) => process.exit(code));
    const setExitCode = options.setExitCode ?? ((code) => {
        process.exitCode = code;
    });

    return async function shutdown(signal: string): Promise<void> {
        if (isShuttingDown) {
            return;
        }
        isShuttingDown = true;

        log(`[SHUTDOWN] ${signal} recibido. Iniciando cierre ordenado.`);

        let timedOut = false;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

        const timeoutFired = new Promise<void>((resolve) => {
            timeoutHandle = setTimeout(() => {
                timedOut = true;
                logError('[SHUTDOWN] Timeout: el cierre ordenado no finalizó a tiempo.');
                try {
                    options.server.closeAllConnections();
                } catch (err) {
                    logError('[SHUTDOWN] Error al forzar el cierre de conexiones.', err);
                }
                exit(1);
                resolve();
            }, timeoutMs);
            timeoutHandle.unref?.();
        });

        const work = (async () => {
            const expirationTask = options.getExpirationTask();
            if (expirationTask) {
                await Promise.resolve(expirationTask.stop());
                if (timedOut) {
                    return;
                }
                log('[SHUTDOWN] Scheduler detenido.');
            }

            await closeHttpServer(options.server);
            if (timedOut) {
                return;
            }
            log('[SHUTDOWN] Servidor HTTP cerrado.');

            try {
                await options.prisma.$disconnect();
            } catch (err) {
                logError('[SHUTDOWN] Error al desconectar Prisma.', err);
                exit(1);
                return;
            }
            if (timedOut) {
                return;
            }

            log('[SHUTDOWN] Prisma desconectado.');
            setExitCode(0);
            log('[SHUTDOWN] Cierre completado.');
        })();

        try {
            await Promise.race([work, timeoutFired]);
        } catch (err) {
            if (!timedOut) {
                logError('[SHUTDOWN] Error durante el cierre ordenado.', err);
                exit(1);
            }
        } finally {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
        }
    };
}
