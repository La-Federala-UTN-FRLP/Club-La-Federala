// En producción Prisma no debe loguear cada query (volumen en Cloud Logging);
// error/warn se conservan siempre. Se mockea el PrismaClient generado para leer
// las opciones con las que se construye, sin abrir conexión.
function logLevelsFor(nodeEnv: string | undefined): unknown {
    const previous = process.env.NODE_ENV;
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;

    try {
        let levels: unknown;
        jest.isolateModules(() => {
            const PrismaClient = jest.fn();
            jest.doMock('../../../src/generated/prisma', () => ({ PrismaClient }));
            require('../../../src/config/prisma');
            levels = PrismaClient.mock.calls[0][0].log;
        });
        return levels;
    } finally {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
    }
}

describe('config/prisma — niveles de log', () => {
    test('production: solo error y warn, sin query', () => {
        expect(logLevelsFor('production')).toEqual(['error', 'warn']);
    });

    test('development: conserva query', () => {
        expect(logLevelsFor('development')).toEqual(['error', 'warn', 'query']);
    });

    test('sin NODE_ENV: conserva el comportamiento previo (incluye query)', () => {
        expect(logLevelsFor(undefined)).toEqual(['error', 'warn', 'query']);
    });
});
