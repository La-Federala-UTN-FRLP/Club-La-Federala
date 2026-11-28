jest.mock('../../../src/services/auth.service', () => ({ login: jest.fn() }));
jest.mock('../../../src/services/lote.service', () => ({ getAllLotes: jest.fn() }));

import { createServer, request as httpRequest, type Server } from 'node:http';
import { createConnection } from 'node:net';
import request from 'supertest';
import app from '../../../src/app';
import { login } from '../../../src/services/auth.service';
import { getAllLotes } from '../../../src/services/lote.service';
import { initWebEnv } from '../../../src/config/env';
import { loginRateLimiter } from '../../../src/middlewares/loginRateLimit.middleware';
import { authHeader, useTestWebEnv } from '../../support/http';
import { A, B, T, selector, source, manifest, cases } from '../../support/loginObservation';

useTestWebEnv({ env: { LOGIN_OBSERVATION_ENABLED: 'off' } });
const loginMock = login as jest.Mock;
const original = { mode: process.env.LOGIN_CLIENT_IP_MODE, revision: process.env.K_REVISION, render: process.env.RENDER };
const base = { NODE_ENV:'test', DATABASE_URL:'postgresql://dummy:dummy@localhost:5432/dummy', JWT_SECRET:'unit-test-jwt-secret', STORAGE_PROVIDER:'gcs', GCS_BUCKET:'synthetic-unit-bucket' };
let logs: jest.SpyInstance;
let warns: jest.SpyInstance;
let errors: jest.SpyInstance;
let client = 20;
let currentClient = '';
const events = () => logs.mock.calls.filter((call) => typeof call[0] === 'string' && call[0].startsWith('{')).map((call) => JSON.parse(call[0]));
function start(enabled = true, data = manifest({ cases: cases(24) })) {
    initWebEnv({ ...base, ...source({ LOGIN_OBSERVATION_ENABLED: enabled ? 'on':'off' }, data) });
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function attempt(n: number, body: object | string = {}, xff = A, url = '/api/auth/login') {
    return request(app).post(url).set({ 'CF-Connecting-IP':currentClient, 'X-Forwarded-For':xff, 'X-Login-Observation-Selector':selector(n) }).send(body);
}
beforeEach(() => {
    process.env.LOGIN_CLIENT_IP_MODE = 'legacy'; process.env.K_REVISION = source().K_REVISION; process.env.RENDER = 'true';
    jest.spyOn(Date,'now').mockReturnValue(T);
    logs = jest.spyOn(console,'log').mockImplementation(() => undefined);
    warns = jest.spyOn(console,'warn').mockImplementation(() => undefined);
    errors = jest.spyOn(console,'error').mockImplementation(() => undefined);
    currentClient = `192.0.2.${client++}`;
    loginMock.mockImplementation(async ({ password }: { password: string }) => {
        if (password === 'synthetic-good') return { user:{ id:1 }, token:'synthetic-token' };
        throw Object.assign(new Error('Credenciales inválidas'), { statusCode:401 });
    });
    (getAllLotes as jest.Mock).mockResolvedValue({ lotes:[], total:0 }); start();
});
afterEach(async () => {
    // Replacing cached env closes previous observer on next routed login, without
    // a runtime HTTP control. No env cache is shared with other Jest test files.
    start(false); await attempt(24); jest.restoreAllMocks();
    for (const [key,value] of [['LOGIN_CLIENT_IP_MODE',original.mode],['K_REVISION',original.revision],['RENDER',original.render]]) {
        if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
});

describe('P2 mounted actual app with mocked business services, loopback only', () => {
    test('L16/O20 route isolation, Express case/slash/query semantics, JWT/CORS/health remain', async () => {
        for (const [method,url] of [['get','/api/auth/login'],['head','/api/auth/login'],['options','/api/auth/login'],['get','/health'],['post','/api/auth/unknown']] as const) {
            await request(app)[method](url).set('X-Login-Observation-Selector',selector(1));
        }
        expect(events()).toEqual([]);
        expect((await request(app).get('/api/lotes').set(authHeader('ADMINISTRADOR'))).status).toBe(200);
        expect((await request(app).get('/api/lotes')).status).toBe(401);
        expect((await request(app).options('/api/auth/login').set('Origin','http://localhost:5173').set('Access-Control-Request-Method','POST')).status).toBe(204);
        expect(events()).toEqual([]);
        for (const [i,url] of ['/api/auth/login?private=sensitive-query','/API/AUTH/LOGIN','/api/auth/login/'].entries()) {
            expect((await attempt(i + 1,{}, A,url)).status).toBe(400);
        }
        expect(events()).toHaveLength(3); expect(app.get('trust proxy')).toBe(false);
        expect(loginMock).not.toHaveBeenCalled();
    });
    test('O20 malformed JSON stops BEFORE route, valid JSON invalid schema observed before validation', async () => {
        const malformed = await request(app).post('/api/auth/login').set('X-Login-Observation-Selector',selector()).set('Content-Type','application/json').send('{"sensitive-body":');
        expect(malformed.status).toBe(400); expect(events()).toEqual([]);
        expect((await attempt(1)).status).toBe(400); expect(events()).toHaveLength(1); expect(loginMock).not.toHaveBeenCalled();
    });
    test('O20/O21 real 200/400/401/429 unchanged; selected 429 emits before limiter; no credential bypass', async () => {
        expect((await attempt(1,{ email:'synthetic@example.test', password:'synthetic-good' })).status).toBe(200); await flush();
        expect((await attempt(2)).status).toBe(400);
        for (let i = 0; i < 9; i++) expect((await attempt(i + 3,{ email:'synthetic@example.test', password:'synthetic-bad' }, i % 2 ? A:B)).status).toBe(401);
        const before = loginMock.mock.calls.length;
        const blocked = await attempt(12,{ email:'synthetic@example.test', password:'synthetic-good' });
        expect(blocked.status).toBe(429); expect(loginMock.mock.calls.length).toBe(before);
        expect(blocked.body).toEqual({ success:false, code:'TOO_MANY_REQUESTS', message:'Demasiados intentos de inicio de sesión. Intentá nuevamente más tarde.' });
        expect(blocked.headers).toHaveProperty('ratelimit'); expect(blocked.headers).toHaveProperty('ratelimit-policy'); expect(blocked.headers).toHaveProperty('retry-after');
        expect(Object.keys(blocked.headers).some((key) => key.startsWith('x-ratelimit'))).toBe(false);
        expect(events()).toHaveLength(12); expect(warns.mock.calls).toEqual([['[RATE_LIMIT] 429 POST /api/auth/login']]);
    });
    test('O21 enabled/off sequence identical status/body/quota headers/backend calls, successes refunded', async () => {
        async function sequence(enabled: boolean) {
            start(enabled); await loginRateLimiter.resetKey(currentClient); loginMock.mockClear();
            const results: unknown[] = [];
            for (let n = 1; n <= 15; n++) {
                const body = n <= 3 ? { email:'synthetic@example.test', password:'synthetic-good' } : n === 4 ? {} : { email:'synthetic@example.test', password:'synthetic-bad' };
                const res = await attempt(n,body,n % 2 ? A:B); await flush();
                results.push({ status:res.status, body:res.body, rate:res.headers.ratelimit, policy:res.headers['ratelimit-policy'], retry:res.headers['retry-after'], cache:res.headers['cache-control'] });
            }
            return { results, calls:loginMock.mock.calls.length };
        }
        const off = await sequence(false); const on = await sequence(true); expect(on).toEqual(off); expect(events()).toHaveLength(15);
    });
    test.each([200,400,401,429])('O25 synchronous production sink failure preserves HTTP %i and latches off', async (status) => {
        if (status === 429) { start(false); for (let i = 0; i < 10; i++) await attempt(1); start(); }
        logs.mockImplementation(() => { throw Object.assign(new Error('sensitive-sink-message'), { cause:'sensitive-cause' }); });
        const body = status === 400 || status === 429 ? {} : { email:'synthetic@example.test', password:status === 200 ? 'synthetic-good':'synthetic-bad' };
        expect((await attempt(1,body)).status).toBe(status);
        const count = logs.mock.calls.length; await attempt(2,body); expect(logs.mock.calls.length).toBe(count); expect(errors.mock.calls).toEqual([]);
    });
    test('O24/O28 bearer/body/query/expected/socket data absent from all observer output and responses', async () => {
        const res = await request(app).post('/api/auth/login?expectedIp=sensitive-query')
            .set({ 'CF-Connecting-IP':currentClient, 'X-Forwarded-For':B, 'X-Login-Observation-Selector':selector(),
                Authorization:'Bearer sensitive-bearer', Cookie:'private=sensitive-cookie', 'X-Expected-Ip':B, 'X-Match':'true' })
            .send({ expectedIp:B, match:true, expectedHash:'sensitive-hash', password:'sensitive-password' });
        expect(res.status).toBe(400); expect(events()[0].match).toBe(false);
        const serialized = JSON.stringify({ logs:logs.mock.calls,warns:warns.mock.calls,errors:errors.mock.calls,body:res.body,headers:res.headers });
        for (const privateValue of [A,B,selector(),currentClient,'sensitive-password','sensitive-query','sensitive-hash','sensitive-bearer','sensitive-cookie']) expect(serialized.includes(privateValue)).toBe(false);
        expect(Object.keys(events()[0]).sort()).toEqual(['caseLabel','duplicate','family','formatValid','match','processId','revision','source']);
    });
    test('O07/O29 actual Node raw duplicate XFF and selector behavior at mounted login', async () => {
        const server = createServer(app);
        await withServer(server, async (port) => {
            const common = ['Host','localhost','Content-Type','application/json','Content-Length','2','Connection','close','CF-Connecting-IP',currentClient];
            const send = (headers: string[]) => new Promise<number>((resolve,reject) => {
                const call = httpRequest({ host:'127.0.0.1',port,path:'/api/auth/login',method:'POST',headers }, (res) => { res.resume(); res.once('end',() => resolve(res.statusCode!)); });
                call.once('error',reject); call.end('{}');
            });
            expect(await send([...common,'X-Login-Observation-Selector',selector(1),'X-Forwarded-For',A,'x-forwarded-for',A])).toBe(400);
            expect(events()[0]).toMatchObject({ duplicate:true,formatValid:false,match:false });
            expect(await send([...common,'X-Login-Observation-Selector',selector(2),'x-login-observation-selector',selector(2),'X-Forwarded-For',A])).toBe(400);
            expect(events()).toHaveLength(1);
            expect(await send([...common,'X-Login-Observation-Selector',selector(2),'X-Forwarded-For',`${B}, ${A}`])).toBe(400);
            expect(events()).toHaveLength(2); expect(events()[1]).toMatchObject({ duplicate:false,formatValid:true,match:true });
            expect(await send([...common,'X-Login-Observation-Selector',selector(3),'X-Forwarded-For',A,'x-forwarded-for',B])).toBe(400);
            expect(events()[2]).toMatchObject({ duplicate:true,formatValid:false,match:false });
        });
    });
    test('L21/O27 local Node parser 400/431 precedes app and emits nothing; no Run limit claim', async () => {
        const server = createServer({ maxHeaderSize:1024 },app);
        await withServer(server, async (port) => {
            for (const raw of [
                `POST /api/auth/login HTTP/1.1\r\nHost: localhost\r\nX-Login-Observation-Selector: ${selector()}\r\nX-Long: ${'x'.repeat(2048)}\r\n\r\n`,
                `POST /api/auth/login HTTP/1.1\r\nHost: localhost\r\nX-Bad: invalid\x00value\r\n\r\n`,
            ]) {
                const status = await new Promise<number>((resolve,reject) => {
                    const socket = createConnection({ host:'127.0.0.1',port }); let data = '';
                    socket.on('connect',() => socket.end(raw)); socket.on('data',(chunk) => { data += chunk.toString(); }); socket.on('error',reject);
                    socket.on('close',() => resolve(Number(data.split(' ')[1])));
                });
                expect([400,431]).toContain(status);
            }
            expect(events()).toEqual([]);
        });
    });
});

async function withServer(server: Server, run: (port: number) => Promise<void>) {
    await new Promise<void>((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
    try { const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing loopback port'); await run(address.port); }
    finally { await new Promise<void>((resolve,reject) => server.close((error) => error ? reject(error):resolve())); }
}
