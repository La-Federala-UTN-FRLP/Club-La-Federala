import { createShutdown, SHUTDOWN_TIMEOUT_MS } from '../../../src/serverLifecycle';
import type { ExpirationTask, ShutdownPrisma, ShutdownServer } from '../../../src/serverLifecycle';

function createDeps(overrides?: {
    closeImpl?: ShutdownServer['close'];
    disconnectImpl?: ShutdownPrisma['$disconnect'];
    expirationTask?: ExpirationTask | null;
}) {
    const server: ShutdownServer = {
        close: overrides?.closeImpl ?? jest.fn((callback?: (err?: Error) => void) => {
            callback?.();
        }),
        closeIdleConnections: jest.fn(),
        closeAllConnections: jest.fn(),
    };
    const prisma: ShutdownPrisma = {
        $disconnect: overrides?.disconnectImpl ?? jest.fn(async () => undefined),
    };
    const expirationTask = overrides?.expirationTask === undefined
        ? { stop: jest.fn() }
        : overrides.expirationTask;
    const log = jest.fn();
    const logError = jest.fn();
    const exit = jest.fn();
    const setExitCode = jest.fn();

    const shutdown = createShutdown({
        server,
        getExpirationTask: () => expirationTask,
        prisma,
        log,
        logError,
        exit,
        setExitCode,
    });

    return { server, prisma, expirationTask, log, logError, exit, setExitCode, shutdown };
}

describe('createShutdown', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    test('shutdown normal detiene cron, drena HTTP, desconecta Prisma y no fuerza exit 1', async () => {
        const deps = createDeps();

        await deps.shutdown('SIGTERM');

        expect((deps.expirationTask as ExpirationTask).stop).toHaveBeenCalledTimes(1);
        expect(deps.server.close).toHaveBeenCalledTimes(1);
        expect(deps.server.closeIdleConnections).toHaveBeenCalledTimes(1);
        expect(deps.prisma.$disconnect).toHaveBeenCalledTimes(1);
        expect(deps.server.closeAllConnections).not.toHaveBeenCalled();
        expect(deps.exit).not.toHaveBeenCalled();
        expect(deps.setExitCode).toHaveBeenCalledWith(0);
        expect((deps.server.closeIdleConnections as jest.Mock).mock.invocationCallOrder[0])
            .toBeLessThan((deps.prisma.$disconnect as jest.Mock).mock.invocationCallOrder[0]);
    });

    test('segunda señal concurrente no vuelve a cerrar recursos', async () => {
        let releaseClose: (() => void) | undefined;
        const deps = createDeps({
            closeImpl: jest.fn((callback?: (err?: Error) => void) => {
                releaseClose = () => callback?.();
            }),
        });

        const first = deps.shutdown('SIGTERM');
        const second = deps.shutdown('SIGINT');
        await Promise.resolve();
        expect(releaseClose).toBeDefined();
        releaseClose?.();
        await Promise.all([first, second]);

        expect(deps.server.close).toHaveBeenCalledTimes(1);
        expect(deps.prisma.$disconnect).toHaveBeenCalledTimes(1);
        expect((deps.expirationTask as ExpirationTask).stop).toHaveBeenCalledTimes(1);
    });

    test('segunda llamada no vuelve a cerrar recursos', async () => {
        const deps = createDeps();

        await deps.shutdown('SIGTERM');
        await deps.shutdown('SIGINT');

        expect(deps.server.close).toHaveBeenCalledTimes(1);
        expect(deps.server.closeIdleConnections).toHaveBeenCalledTimes(1);
        expect(deps.prisma.$disconnect).toHaveBeenCalledTimes(1);
        expect((deps.expirationTask as ExpirationTask).stop).toHaveBeenCalledTimes(1);
    });

    test('sin cron completa el shutdown igual', async () => {
        const deps = createDeps({ expirationTask: null });

        await deps.shutdown('SIGTERM');

        expect(deps.server.close).toHaveBeenCalledTimes(1);
        expect(deps.server.closeIdleConnections).toHaveBeenCalledTimes(1);
        expect(deps.prisma.$disconnect).toHaveBeenCalledTimes(1);
        expect(deps.exit).not.toHaveBeenCalled();
        expect(deps.setExitCode).toHaveBeenCalledWith(0);
    });

    test('error de disconnect termina con exit 1 y no queda colgado', async () => {
        const deps = createDeps({
            disconnectImpl: jest.fn(async () => {
                throw new Error('disconnect failed');
            }),
        });

        await deps.shutdown('SIGTERM');

        expect(deps.server.close).toHaveBeenCalledTimes(1);
        expect(deps.prisma.$disconnect).toHaveBeenCalledTimes(1);
        expect(deps.exit).toHaveBeenCalledWith(1);
        expect(deps.setExitCode).not.toHaveBeenCalled();
        expect(deps.server.closeAllConnections).not.toHaveBeenCalled();
        expect(deps.logError).toHaveBeenCalledWith(
            '[SHUTDOWN] Error al desconectar Prisma.',
            expect.any(Error),
        );
    });

    test('timeout fuerza closeAllConnections y exit 1', async () => {
        jest.useFakeTimers();
        const deps = createDeps({
            closeImpl: jest.fn(() => {
                // never calls callback — HTTP drain hangs
            }),
        });

        const pending = deps.shutdown('SIGTERM');
        await jest.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS);
        await pending;

        expect(deps.server.close).toHaveBeenCalledTimes(1);
        expect(deps.server.closeIdleConnections).toHaveBeenCalledTimes(1);
        expect(deps.server.closeAllConnections).toHaveBeenCalledTimes(1);
        expect(deps.exit).toHaveBeenCalledWith(1);
        expect(deps.prisma.$disconnect).not.toHaveBeenCalled();
        expect(deps.setExitCode).not.toHaveBeenCalled();
        expect(deps.logError).toHaveBeenCalledWith(
            '[SHUTDOWN] Timeout: el cierre ordenado no finalizó a tiempo.',
        );
    });
});
