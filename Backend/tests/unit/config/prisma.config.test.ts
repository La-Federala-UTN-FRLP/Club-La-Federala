// En producción Prisma no loguea cada query (volumen en Cloud Logging) ni sus errores: el log "error"
// de Prisma imprime el mensaje completo (con la query y sus argumentos en un ValidationError). Esos
// errores llegan al caller y se loguean sanitizados (safeErrorForLog). Fuera de producción: todo. Se mockea el PrismaClient generado para leer
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
    test('production: solo warn (sin query ni el error crudo de Prisma)', () => {
        expect(logLevelsFor('production')).toEqual(['warn']);
    });

    test('development: conserva query', () => {
        expect(logLevelsFor('development')).toEqual(['error', 'warn', 'query']);
    });

    test('sin NODE_ENV: conserva el comportamiento previo (incluye query)', () => {
        expect(logLevelsFor(undefined)).toEqual(['error', 'warn', 'query']);
    });
});
