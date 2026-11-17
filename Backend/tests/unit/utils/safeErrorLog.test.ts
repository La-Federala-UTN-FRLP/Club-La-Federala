// safeErrorForLog: lo que un error deja en el log del servidor.
// Errores de Prisma: sin mensaje (puede traer la query con sus argumentos). Otros errores: mensaje y
// stack con credenciales y tokens redactados. Valores que no son Error: solo tipo y claves.
import { Prisma } from '../../../src/generated/prisma';
import { redactSecrets, safeErrorForLog } from '../../../src/utils/safeErrorLog';

const QUERY_CON_DATOS = 'Invalid `prisma.user.create()` invocation: { data: { password: "$2b$10$hashsecreto", email: "ana@example.com" } }';

describe('errores de Prisma', () => {
    test('ValidationError: nombre y frames del stack, nunca el mensaje con la query', () => {
        const err = new Prisma.PrismaClientValidationError(QUERY_CON_DATOS, { clientVersion: '6.18.0' });

        const log = safeErrorForLog(err);

        expect(log.name).toBe('PrismaClientValidationError');
        expect(log).not.toHaveProperty('message');
        expect(JSON.stringify(log)).not.toContain('hashsecreto');
        expect(JSON.stringify(log)).not.toContain('ana@example.com');
        expect(log.stack ?? '').not.toContain('Invalid `prisma');
    });

    test('KnownRequestError: código y metadata de estructura, sin mensaje', () => {
        const err = new Prisma.PrismaClientKnownRequestError(QUERY_CON_DATOS, {
            code: 'P2002',
            clientVersion: '6.18.0',
            meta: { modelName: 'User', target: ['email'], valorIntentado: 'ana@example.com' },
        });

        const log = safeErrorForLog(err);

        expect(log).toEqual(expect.objectContaining({
            name: 'PrismaClientKnownRequestError',
            code: 'P2002',
            clientVersion: '6.18.0',
            meta: { modelName: 'User', target: ['email'] },
        }));
        expect(log).not.toHaveProperty('message');
        expect(JSON.stringify(log)).not.toContain('ana@example.com');
    });

    test('InitializationError: errorCode como code y sin la DSN del mensaje', () => {
        const err = new Prisma.PrismaClientInitializationError(
            "Can't reach database server at postgres://admin:hunter2@10.0.0.5:5432/federala",
            '6.18.0',
            'P1001',
        );

        const log = safeErrorForLog(err);

        expect(log.code).toBe('P1001');
        expect(JSON.stringify(log)).not.toContain('hunter2');
    });
});

describe('otros errores', () => {
    test('mensaje y stack con DSN, Bearer y JWT redactados', () => {
        const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.c2lnbmF0dXJh';
        const err = Object.assign(
            new Error(`fallo con postgres://admin:hunter2@db:5432/x, Authorization: Bearer ${jwt}`),
            { code: 'ECONNREFUSED' },
        );

        const log = safeErrorForLog(err);

        expect(log.name).toBe('Error');
        expect(log.code).toBe('ECONNREFUSED');
        expect(log.message).toContain('postgres://***:***@db:5432/x');
        expect(log.message).toContain('Bearer ***');
        const texto = JSON.stringify(log);
        expect(texto).not.toContain('hunter2');
        expect(texto).not.toContain(jwt);
        expect(log.stack).toMatch(/^\s+at /);
    });

    test('un JWT suelto también se redacta', () => {
        expect(redactSecrets('token=eyJa.eyJb.sig-123')).toBe('token=***jwt***');
    });
});

describe('valores que no son Error', () => {
    test('objeto: solo el tipo y las claves, nunca los valores', () => {
        const log = safeErrorForLog({ code: 'P2025', password: 'secreta' });

        expect(log).toEqual({ name: 'NonError', type: 'object', keys: ['code', 'password'] });
        expect(JSON.stringify(log)).not.toContain('secreta');
    });

    test('string: solo el tipo', () => {
        expect(safeErrorForLog('password=secreta')).toEqual({ name: 'NonError', type: 'string' });
    });
});
