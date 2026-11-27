import type { Request } from 'express';
import { createServer, request as httpRequest, type Server, type OutgoingHttpHeaders } from 'node:http';
import { createConnection } from 'node:net';
import { cloudRunDirectIpCandidate } from '../../../src/utils/loginClientIp';
import { loginClientKey, UNVERIFIED_LOGIN_CLIENT_KEY } from '../../../src/middlewares/loginRateLimit.middleware';
import { parseWebEnv, EnvValidationError } from '../../../src/config/env';

const RUN = { LOGIN_CLIENT_IP_MODE: 'cloud-run-direct' };
const PROXY = '10.200.0.5';
function req(xff?: string | string[], socket = PROXY, rawHeaders?: string[]): Request {
    return {
        headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
        rawHeaders,
        socket: { remoteAddress: socket },
        ip: socket,
    } as unknown as Request;
}
const key = (xff?: string | string[]) => loginClientKey(req(xff), RUN);
const config = (extra: Record<string, string | undefined> = {}) => ({
    NODE_ENV: 'test', DATABASE_URL: 'postgresql://unit:unit@localhost:5432/unit',
    JWT_SECRET: 'synthetic-unit-test-only', STORAGE_PROVIDER: 'gcs', GCS_BUCKET: 'unit-test-bucket', ...extra,
});

async function withServer<T>(server: Server, run: (port: number) => Promise<T>): Promise<T> {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Expected loopback port');
        return await run(address.port);
    } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}
function send(port: number, headers: OutgoingHttpHeaders | string[]): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const call = httpRequest({ hostname: '127.0.0.1', port, path: '/', headers, agent: false }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode!, body }));
        });
        call.on('error', reject);
        call.setTimeout(3000, () => call.destroy(new Error('Loopback request timeout')));
        call.end();
    });
}

describe('Candidate under H1, not a proof of Cloud Run ingress', () => {
    test('L01 legacy ignores all client headers and implicit Cloud Run detection', () => {
        for (const mode of [undefined, '', 'legacy']) {
            const r = req('203.0.113.1');
            r.headers['cf-connecting-ip'] = '198.51.100.9';
            r.headers.forwarded = 'for=192.0.2.2';
            expect(loginClientKey(r, { LOGIN_CLIENT_IP_MODE: mode, K_SERVICE: 'synthetic-run' })).toBe(PROXY);
        }
    });
    test('L02 same socket, distinct H1 suffixes produce distinct candidate buckets', () => {
        expect(key('203.0.113.1')).not.toBe(key('203.0.113.2'));
        expect(key('203.0.113.1')).toBe('cloud-run-direct:203.0.113.1');
    });
    test.each(['', '192.0.2.1,', '192.0.2.1, unknown,', 'not-an-ip,,', ' , '])(
        'L03 supplied prefix %j cannot change the same suffix bucket', (prefix) => {
            expect(key(prefix + '203.0.113.1')).toBe(key('203.0.113.1'));
        },
    );
    test.each(['unknown', '203.0.113.2:443', '[2001:db8::1]', 'fe80::1%eth0', '"203.0.113.2"', '203.000.113.2']) (
        'L04/L07 invalid suffix %j never falls back to a valid prefix', (tail) => {
            expect(key('203.0.113.1, ' + tail)).toBe(UNVERIFIED_LOGIN_CLIENT_KEY);
        },
    );
    test.each([undefined, '', ' ', '\t', 'unknown', '203.0.113.1,', '203.0.113.1, \t']) (
        'L05 missing/empty/invalid suffix %j has the same unverified key', (xff) => {
            expect(key(xff)).toBe(UNVERIFIED_LOGIN_CLIENT_KEY);
        },
    );
    test('L06 arrays, duplicate raw names and malformed raw pairs are ambiguous', () => {
        expect(key(['203.0.113.1', '203.0.113.2'])).toBe(UNVERIFIED_LOGIN_CLIENT_KEY);
        expect(cloudRunDirectIpCandidate(req('203.0.113.1, 203.0.113.2', PROXY,
            ['X-Forwarded-For', '203.0.113.1', 'x-forwarded-for', '203.0.113.2']))).toEqual({ kind: 'unverified', reason: 'ambiguous' });
        expect(cloudRunDirectIpCandidate(req('203.0.113.1', PROXY, ['X-Forwarded-For']))).toEqual({ kind: 'unverified', reason: 'ambiguous' });
    });
    test('L06 actual Node HTTP joins duplicate fields but preserves both raw names', async () => {
        const server = createServer((incoming, res) => {
            res.end(JSON.stringify({ joined: incoming.headers['x-forwarded-for'], raw: incoming.rawHeaders,
                candidate: cloudRunDirectIpCandidate(incoming) }));
        });
        await withServer(server, async (port) => {
            const response = await send(port, ['Host', 'localhost', 'X-Forwarded-For', '203.0.113.1',
                'x-forwarded-for', '198.51.100.2', 'Connection', 'close']);
            expect(response.status).toBe(200);
            const result = JSON.parse(response.body);
            expect(result.joined).toBe('203.0.113.1, 198.51.100.2');
            expect(result.raw.filter((v: string, i: number) => i % 2 === 0 && v.toLowerCase() === 'x-forwarded-for')).toHaveLength(2);
            expect(result.candidate).toEqual({ kind: 'unverified', reason: 'ambiguous' });
        });
    });
    test('L07 only HTTP SP/HTAB around a valid IP are trimmed', () => {
        expect(key('prefix, \t203.0.113.1 \t')).toBe(key('203.0.113.1'));
        expect(key('\u00a0203.0.113.1')).toBe(UNVERIFIED_LOGIN_CLIENT_KEY);
    });
    test('L08 IPv4-mapped and IPv4 share a bucket; compressed/expanded IPv6 normalize', () => {
        expect(key('::ffff:203.0.113.1')).toBe(key('203.0.113.1'));
        expect(key('::ffff:cb00:7101')).toBe(key('203.0.113.1'));
        expect(key('2001:db8:abcd:12::1')).toBe(key('2001:0db8:abcd:0012:0000:0000:0000:0001'));
    });
    test('L09 IPv6 /56 grouping is explicit: inside shares, outside separates', () => {
        expect(key('2001:db8:abcd:12::1')).toBe(key('2001:db8:abcd:ff::2'));
        expect(key('2001:db8:abcd:12::1')).not.toBe(key('2001:db8:abcd:112::1'));
    });
    test('L10 NAT users with one egress share the same bucket intentionally', () => {
        const a = req('203.0.113.1'); const b = req('203.0.113.1');
        a.body = { email: 'user-a@example.test' }; b.body = { email: 'user-b@example.test' };
        expect(loginClientKey(a, RUN)).toBe(loginClientKey(b, RUN));
    });
    test('L11 changing VPN/egress changes the bucket: this is not person identity', () => {
        expect(key('203.0.113.1')).not.toBe(key('198.51.100.1'));
    });
    test('L12 absent/varying socket never changes candidate or creates a random fallback', () => {
        expect(loginClientKey(req('203.0.113.1', ''), RUN)).toBe(key('203.0.113.1'));
        for (const socket of ['', '10.0.0.1', '10.0.0.2']) {
            expect(loginClientKey(req(undefined, socket), RUN)).toBe(UNVERIFIED_LOGIN_CLIENT_KEY);
        }
        expect(UNVERIFIED_LOGIN_CLIENT_KEY).not.toBe(key('203.0.113.1'));
    });
    test('L13 req.ip, CF, X-Real-IP, Forwarded, user and email do not override the candidate', () => {
        const r = req('prefix, 203.0.113.1');
        Object.assign(r, { ip: '192.0.2.2', user: { id: 1 }, body: { email: 'other@example.test' } });
        Object.assign(r.headers, { 'cf-connecting-ip': '198.51.100.1', 'x-real-ip': '198.51.100.2', forwarded: 'for=198.51.100.3' });
        expect(loginClientKey(r, RUN)).toBe(key('203.0.113.1'));
    });
    test('L14 additional proxy or missing H1 breaks the assumption; parser cannot detect it', () => {
        expect(key('203.0.113.1, 198.51.100.1')).toBe(key('198.51.100.1'));
        // A direct caller can choose the candidate without a trusted ingress: never deploy on this proof alone.
        expect(key('192.0.2.7')).not.toBe(key('192.0.2.8'));
    });
    test.each(['test', 'development', 'production'])('L15 NODE_ENV=%s and K_SERVICE never opt in', (environment) => {
        const input = config({ NODE_ENV: environment, JWT_SECRET: 'synthetic-production-test-secret-32-characters',
            FRONTEND_URL: 'https://example.test', K_SERVICE: 'synthetic-run' });
        expect(parseWebEnv(input).loginClientIpMode).toBe('legacy');
        expect(parseWebEnv({ ...input, LOGIN_CLIENT_IP_MODE: '' }).loginClientIpMode).toBe('legacy');
        expect(parseWebEnv({ ...input, LOGIN_CLIENT_IP_MODE: 'cloud-run-direct' }).loginClientIpMode).toBe('cloud-run-direct');
    });
    test.each(['true', 'Cloud-Run-Direct', 'auto', ' cloud-run-direct', 'invalid\nsecret']) (
        'L15 invalid mode %j fails startup without echoing it', (mode) => {
            try { parseWebEnv(config({ LOGIN_CLIENT_IP_MODE: mode })); throw new Error('Expected invalid mode'); }
            catch (error) {
                expect(error).toBeInstanceOf(EnvValidationError);
                expect((error as EnvValidationError).issues.join(' ')).not.toContain(mode);
            }
            expect(loginClientKey(req('203.0.113.1'), { LOGIN_CLIENT_IP_MODE: mode })).toBe(UNVERIFIED_LOGIN_CLIENT_KEY);
        },
    );
    test('L15 Render/Run combination rejected; explicit legacy still preserves Render', () => {
        expect(() => parseWebEnv(config({ LOGIN_CLIENT_IP_MODE: 'cloud-run-direct', RENDER: 'true' }))).toThrow(EnvValidationError);
        const r = req('203.0.113.1'); r.headers['cf-connecting-ip'] = '198.51.100.2';
        expect(loginClientKey(r, { LOGIN_CLIENT_IP_MODE: 'legacy', RENDER: 'true' })).toBe('198.51.100.2');
        expect(loginClientKey(r, { ...RUN, RENDER: 'true' })).toBe(UNVERIFIED_LOGIN_CLIENT_KEY);
    });
    test('L20/L21 malformed synthetic headers do not throw or log anything', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        try {
            for (const value of ['prefix\r\nINJECTED, 203.0.113.1', 'prefix\0, 203.0.113.1', '203.0.113.1\n',
                'prefix, password', '\u00a0', '\x7f, 203.0.113.1']) {
                expect(() => key(value)).not.toThrow();
                expect(key(value)).toBe(UNVERIFIED_LOGIN_CLIENT_KEY);
            }
            expect(key('x'.repeat(100_000) + ', 203.0.113.1')).toBe(key('203.0.113.1'));
            expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
        } finally { warn.mockRestore(); error.mockRestore(); log.mockRestore(); }
    });
    test('L21 real Node parser rejects oversized/control headers before the helper', async () => {
        const observed = jest.fn();
        const server = createServer({ maxHeaderSize: 1024 }, (_req, res) => { observed(); res.end('unexpected'); });
        await withServer(server, async (port) => {
            expect((await send(port, { 'x-forwarded-for': 'x'.repeat(2048), connection: 'close' })).status).toBe(431);
            const raw = await new Promise<string>((resolve, reject) => {
                const socket = createConnection({ host: '127.0.0.1', port });
                let data = '';
                socket.setEncoding('utf8'); socket.on('data', (chunk) => { data += chunk; });
                socket.on('error', reject); socket.on('end', () => resolve(data));
                socket.setTimeout(3000, () => socket.destroy(new Error('Loopback timeout')));
                socket.on('connect', () => socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nX-Forwarded-For: bad\x00value\r\nConnection: close\r\n\r\n'));
            });
            expect(raw).toMatch(/^HTTP\/1\.1 400/);
            expect(observed).not.toHaveBeenCalled();
        });
    });
});
