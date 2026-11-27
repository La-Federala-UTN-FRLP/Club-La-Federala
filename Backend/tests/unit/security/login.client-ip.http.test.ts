import express, { type Response } from 'express';
import request from 'supertest';
import { MemoryStore, type Options } from 'express-rate-limit';
import { createLoginRateLimiter, loginClientKey } from '../../../src/middlewares/loginRateLimit.middleware';

const RUN = { LOGIN_CLIENT_IP_MODE: 'cloud-run-direct' };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function harness(handler?: (res: Response) => void) {
    const app = express();
    const limiter = createLoginRateLimiter({ keyGenerator: (req) => loginClientKey(req, RUN) });
    app.post('/api/auth/login', limiter, (_req, res) => handler ? handler(res) : res.status(401).json({ code: 'UNAUTHORIZED' }));
    app.get('/outside', (req, res) => res.json({ ip: req.ip, protocol: req.protocol, hostname: req.hostname }));
    return app;
}
describe('Local HTTP policy under synthetic H1 (no staging)', () => {
    test('L16 global Express trust/hostname/protocol and unrelated routes remain unchanged', async () => {
        const app = harness();
        expect(app.get('trust proxy')).toBe(false);
        const res = await request(app).get('/outside').set({ Host: 'example.test', 'X-Forwarded-Host': 'spoof.test',
            'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.1' });
        expect(res.body.hostname).toBe('example.test'); expect(res.body.protocol).toBe('http');
        expect(res.body.ip).not.toBe('203.0.113.1'); expect(res.headers).not.toHaveProperty('ratelimit');
    });
    test('L17 ten failures then 429, successes discounted, B independent, prefixes cannot bypass', async () => {
        const app = harness((res) => res.status(200).end());
        for (let i = 0; i < 15; i++) {
            expect((await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.1')).status).toBe(200);
            await flush();
        }
        const failing = harness();
        for (let i = 0; i < 10; i++) {
            expect((await request(failing).post('/api/auth/login').set('X-Forwarded-For', `192.0.2.${i}, 203.0.113.1`)).status).toBe(401);
        }
        const blocked = await request(failing).post('/api/auth/login').set('X-Forwarded-For', 'unknown, 203.0.113.1');
        expect(blocked.status).toBe(429);
        expect(blocked.body).toEqual({ success: false, code: 'TOO_MANY_REQUESTS', message: expect.any(String) });
        expect(blocked.headers).toHaveProperty('ratelimit'); expect(blocked.headers).not.toHaveProperty('x-ratelimit-limit');
        expect((await request(failing).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.2')).status).toBe(401);
    });
    test('L17/L18 local clock expiry, independent stores, and simulated process restart lose state', async () => {
        jest.useFakeTimers();
        const a = new MemoryStore(); const b = new MemoryStore(); const restarted = new MemoryStore();
        const options = { windowMs: 15 * 60 * 1000 } as Options;
        for (const store of [a, b, restarted]) store.init(options);
        try {
            expect((await a.increment('client-a')).totalHits).toBe(1);
            expect((await a.increment('client-a')).totalHits).toBe(2);
            expect((await b.increment('client-a')).totalHits).toBe(1);
            expect((await restarted.increment('client-a')).totalHits).toBe(1);
            jest.advanceTimersByTime(options.windowMs + 1);
            expect((await a.increment('client-a')).totalHits).toBe(1);
        } finally { a.shutdown(); b.shutdown(); restarted.shutdown(); jest.useRealTimers(); }
    });
    test('L19 pending successes temporarily consume quota; completion restores it', async () => {
        const held: Response[] = [];
        let ready!: () => void;
        const allHeld = new Promise<void>((resolve) => { ready = resolve; });
        let hold = true;
        const app = harness((res) => {
            if (!hold) { res.status(200).end(); return; }
            held.push(res); if (held.length === 10) ready();
        });
        const calls = Array.from({ length: 10 }, () => request(app).post('/api/auth/login')
            .set('X-Forwarded-For', '203.0.113.1').then((res) => res));
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([allHeld, new Promise<never>((_, reject) => {
                timeout = setTimeout(() => reject(new Error('Local concurrency did not reach handler')), 3000);
            })]);
            expect((await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.1')).status).toBe(429);
        } finally {
            if (timeout) clearTimeout(timeout);
            hold = false;
            for (const res of held) res.status(200).end();
            await Promise.all(calls);
        }
        await flush();
        expect((await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.1')).status).toBe(200);
    });
    test('L20 fixed limiter log excludes IP/key, query, headers and credentials', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const app = harness();
            for (let i = 0; i < 11; i++) {
                await request(app).post('/api/auth/login?private=private-query')
                    .set({ 'X-Forwarded-For': 'private-prefix, 203.0.113.1', Authorization: 'Bearer private-token' })
                    .send({ email: 'private-email@example.test', password: 'private-password' });
            }
            expect(warn.mock.calls).toEqual([['[RATE_LIMIT] 429 POST /api/auth/login']]);
        } finally { warn.mockRestore(); }
    });
    test('unverified is one constant bucket, separate from valid candidates', async () => {
        const app = harness();
        for (let i = 0; i < 10; i++) {
            expect((await request(app).post('/api/auth/login').set('X-Forwarded-For', `192.0.2.${i}, invalid`)).status).toBe(401);
        }
        expect((await request(app).post('/api/auth/login')).status).toBe(429);
        expect((await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.1')).status).toBe(401);
    });
});
