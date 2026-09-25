import request from 'supertest';
import app from '../../../src/app';

describe('GET /health', () => {
    test('responde 200', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
    });

    test('body exacto { status: ok }', async () => {
        const res = await request(app).get('/health');
        expect(res.body).toEqual({ status: 'ok' });
    });

    test('sin Authorization responde 200', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok' });
    });

    test('Cache-Control no-store', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['cache-control']).toBe('no-store');
    });
});
