jest.mock('../../../src/config/loadEnv', () => ({
    loadLocalEnv: jest.fn(),
}));

jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        $disconnect: jest.fn(async () => undefined),
    },
}));

jest.mock('../../../src/jobs/expirePromotions', () => ({
    expirePromotions: jest.fn(),
}));

jest.mock('../../../src/jobs/expireReservas', () => ({
    expireReservas: jest.fn(),
}));

jest.mock('../../../src/jobs/expirePrioridades', () => ({
    expirePrioridades: jest.fn(),
}));

import { loadLocalEnv } from '../../../src/config/loadEnv';
import { expirePromotions } from '../../../src/jobs/expirePromotions';
import { expireReservas } from '../../../src/jobs/expireReservas';
import { expirePrioridades } from '../../../src/jobs/expirePrioridades';
import { runExpirations, runExpirationsCli } from '../../../src/jobs/runExpirations';

const expirePromotionsMock = expirePromotions as jest.Mock;
const expireReservasMock = expireReservas as jest.Mock;
const expirePrioridadesMock = expirePrioridades as jest.Mock;

describe('runExpirations', () => {
    beforeEach(() => {
        expirePromotionsMock.mockReset();
        expireReservasMock.mockReset();
        expirePrioridadesMock.mockReset();
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('llama expirePromotions, luego expireReservas y luego expirePrioridades', async () => {
        expirePromotionsMock.mockResolvedValue(3);
        expireReservasMock.mockResolvedValue(2);
        expirePrioridadesMock.mockResolvedValue(1);

        await runExpirations();

        expect(expirePromotionsMock).toHaveBeenCalledTimes(1);
        expect(expireReservasMock).toHaveBeenCalledTimes(1);
        expect(expirePrioridadesMock).toHaveBeenCalledTimes(1);
        expect(expirePromotionsMock.mock.invocationCallOrder[0])
            .toBeLessThan(expireReservasMock.mock.invocationCallOrder[0]);
        expect(expireReservasMock.mock.invocationCallOrder[0])
            .toBeLessThan(expirePrioridadesMock.mock.invocationCallOrder[0]);
    });

    test('si expireReservas falla, no llama expirePrioridades', async () => {
        expirePromotionsMock.mockResolvedValue(1);
        expireReservasMock.mockRejectedValue(new Error('reserva fail'));

        await expect(runExpirations()).rejects.toThrow('reserva fail');
        expect(expirePrioridadesMock).not.toHaveBeenCalled();
    });

    test('si expirePrioridades falla, el error se propaga', async () => {
        expirePromotionsMock.mockResolvedValue(1);
        expireReservasMock.mockResolvedValue(1);
        expirePrioridadesMock.mockRejectedValue(new Error('prioridad fail'));

        await expect(runExpirations()).rejects.toThrow('prioridad fail');
    });

    test('si expirePromotions falla, rechaza y no llama expireReservas', async () => {
        expirePromotionsMock.mockRejectedValue(new Error('promo fail'));

        await expect(runExpirations()).rejects.toThrow('promo fail');
        expect(expireReservasMock).not.toHaveBeenCalled();
    });

    test('si expireReservas falla, el error se propaga', async () => {
        expirePromotionsMock.mockResolvedValue(1);
        expireReservasMock.mockRejectedValue(new Error('reserva fail'));

        await expect(runExpirations()).rejects.toThrow('reserva fail');
    });
});

describe('runExpirationsCli', () => {
    const originalExitCode = process.exitCode;

    beforeEach(() => {
        process.exitCode = undefined;
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        process.exitCode = originalExitCode;
        jest.restoreAllMocks();
    });

    test('éxito: exitCode 0 y disconnect una vez', async () => {
        const run = jest.fn(async () => undefined);
        const prisma = { $disconnect: jest.fn(async () => undefined) };

        await runExpirationsCli({ run, prisma, skipEnvValidation: true });

        expect(run).toHaveBeenCalledTimes(1);
        expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
        expect(process.exitCode).toBe(0);
    });

    test('fallo fatal del job: exitCode 1 y disconnect igual', async () => {
        const run = jest.fn(async () => {
            throw new Error('job fail');
        });
        const prisma = { $disconnect: jest.fn(async () => undefined) };

        await runExpirationsCli({ run, prisma, skipEnvValidation: true });

        expect(run).toHaveBeenCalledTimes(1);
        expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
        expect(process.exitCode).toBe(1);
    });

    test('disconnect falla: exitCode 1 aunque el job haya resuelto', async () => {
        const run = jest.fn(async () => undefined);
        const prisma = {
            $disconnect: jest.fn(async () => {
                throw new Error('disconnect fail');
            }),
        };

        await runExpirationsCli({ run, prisma, skipEnvValidation: true });

        expect(run).toHaveBeenCalledTimes(1);
        expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
        expect(process.exitCode).toBe(1);
    });

    test('config job inválida: no ejecuta run ni queries', async () => {
        const run = jest.fn(async () => undefined);
        const prisma = { $disconnect: jest.fn(async () => undefined) };
        const original = process.env.DATABASE_URL;
        delete process.env.DATABASE_URL;

        await runExpirationsCli({ run, prisma });

        expect(loadLocalEnv).toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);

        if (original === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = original;
        }
    });
});
