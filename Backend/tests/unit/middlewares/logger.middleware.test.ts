// Request logger: una línea al terminar la respuesta con método, path, status y duración.
// Sin query string (puede traer PII). En NODE_ENV=test el logger de la app no escribe.
import express from 'express';
import request from 'supertest';
import { createRequestLogger } from '../../../src/middlewares/logger.middleware';
import app from '../../../src/app';
import { useTestWebEnv } from '../../support/http';

useTestWebEnv();

function appConLogger(log: (line: string) => void) {
    let t = 1000;
    const a = express();
    // Reloj falso: cada lectura avanza 7 ms (inicio y fin del request).
    a.use(createRequestLogger({ enabled: true, log, now: () => (t += 7) }));
    a.get('/api/personas', (_req, res) => res.status(200).json({ ok: true }));
    a.get('/api/falla', (_req, res) => res.status(503).json({ ok: false }));
    return a;
}

describe('createRequestLogger', () => {
    test('loguea método, path, status y duración al terminar, sin query string', async () => {
        const log = jest.fn();

        await request(appConLogger(log)).get('/api/personas?q=20123456783&view=ALL');

        expect(log).toHaveBeenCalledTimes(1);
        const linea = log.mock.calls[0][0] as string;
        expect(linea).toMatch(/^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] GET \/api\/personas 200 7ms$/);
        expect(linea).not.toContain('20123456783');
        expect(linea).not.toContain('?');
    });

    test('registra el status real de la respuesta', async () => {
        const log = jest.fn();

        await request(appConLogger(log)).get('/api/falla');

        expect(log.mock.calls[0][0]).toMatch(/ GET \/api\/falla 503 \d+ms$/);
    });

    test('deshabilitado: no escribe', async () => {
        const log = jest.fn();
        const a = express();
        a.use(createRequestLogger({ enabled: false, log }));
        a.get('/x', (_req, res) => res.sendStatus(204));

        await request(a).get('/x');

        expect(log).not.toHaveBeenCalled();
    });
});

describe('logger de la app en NODE_ENV=test', () => {
    test('no escribe requests en consola', async () => {
        const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);

        await request(app).get('/health');
        await request(app).get('/api/ruta-inexistente?q=algo');

        expect(consoleLog).not.toHaveBeenCalled();
        consoleLog.mockRestore();
    });
});
