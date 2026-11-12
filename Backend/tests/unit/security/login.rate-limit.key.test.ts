// Identidad de cliente para el rate limit de login (función pura, sin sockets).
//
// RENDER=true → CF-Connecting-IP: Cloudflare lo escribe en cada request que llega a un web
// service de Render y sobrescribe lo que mande el cliente. X-Forwarded-For NO se usa: Cloudflare
// agrega entradas en vez de reemplazarlo, así que su lado izquierdo lo controla quien llama.
// Header ausente o inválido → req.ip / socket (en Render, la IP del proxy: un bucket compartido,
// más restrictivo, nunca un bypass). Fuera de Render → req.ip, sin tocar trust proxy.
import type { Request } from 'express';
import { loginClientKey } from '../../../src/middlewares/loginRateLimit.middleware';

const RENDER = { RENDER: 'true' };
const LOCAL = {};

function req(opts: { headers?: Record<string, string | string[]>; ip?: string; socketIp?: string } = {}): Request {
    return {
        headers: opts.headers ?? {},
        ip: opts.ip,
        socket: { remoteAddress: opts.socketIp },
    } as unknown as Request;
}

const PROXY_IP = '10.200.0.5';

describe('loginClientKey — Render', () => {
    test('CF-Connecting-IP IPv4 válido → esa IP', () => {
        expect(loginClientKey(req({ headers: { 'cf-connecting-ip': '203.0.113.10' }, ip: PROXY_IP }), RENDER)).toBe('203.0.113.10');
    });

    test('CF-Connecting-IP con espacios alrededor → IP recortada', () => {
        expect(loginClientKey(req({ headers: { 'cf-connecting-ip': '  203.0.113.10  ' }, ip: PROXY_IP }), RENDER)).toBe('203.0.113.10');
    });

    test('CF-Connecting-IP IPv6 → subred /56 normalizada por ipKeyGenerator', () => {
        const a = loginClientKey(req({ headers: { 'cf-connecting-ip': '2001:db8:abcd:12::1' } }), RENDER);
        const b = loginClientKey(req({ headers: { 'cf-connecting-ip': '2001:db8:abcd:ff:ffff::9' } }), RENDER);
        expect(a).toBe('2001:db8:abcd::/56');
        expect(b).toBe(a); // misma /56 → mismo bucket: rotar direcciones dentro del prefijo no evade el límite
    });

    test('CF-Connecting-IP IPv4-mapped IPv6 → la IPv4 (mismo bucket que la forma IPv4)', () => {
        expect(loginClientKey(req({ headers: { 'cf-connecting-ip': '::ffff:203.0.113.10' } }), RENDER)).toBe('203.0.113.10');
    });

    test.each([
        ['ausente', undefined],
        ['vacío', ''],
        ['solo espacios', '   '],
        ['no es IP', 'abc'],
        ['lista con coma', '203.0.113.10, 198.51.100.1'],
        ['IP con puerto', '203.0.113.10:443'],
        ['header repetido (array)', ['203.0.113.10', '198.51.100.1']],
    ])('CF-Connecting-IP %s → fallback a req.ip normalizado', (_caso, valor) => {
        const headers: Record<string, string | string[]> = valor === undefined ? {} : { 'cf-connecting-ip': valor };
        expect(loginClientKey(req({ headers, ip: PROXY_IP }), RENDER)).toBe(PROXY_IP);
    });

    test.each([
        ['IP única', '198.51.100.9'],
        ['lista', '198.51.100.9, 10.0.0.1, 172.16.0.1'],
        ['lista con espacios y vacíos', ' , 198.51.100.9 ,, 10.0.0.1 '],
    ])('X-Forwarded-For (%s) nunca define la key', (_caso, xff) => {
        expect(loginClientKey(req({ headers: { 'x-forwarded-for': xff, 'cf-connecting-ip': '203.0.113.10' }, ip: PROXY_IP }), RENDER)).toBe('203.0.113.10');
        expect(loginClientKey(req({ headers: { 'x-forwarded-for': xff }, ip: PROXY_IP }), RENDER)).toBe(PROXY_IP);
    });

    test('sin header ni req.ip → dirección del socket', () => {
        expect(loginClientKey(req({ socketIp: PROXY_IP }), RENDER)).toBe(PROXY_IP);
    });

    test('sin ningún dato de origen → key constante (bucket compartido, no aleatorio)', () => {
        const k1 = loginClientKey(req(), RENDER);
        const k2 = loginClientKey(req(), RENDER);
        expect(k1).toBe(k2);
        expect(k1).not.toBe('');
    });
});

describe('loginClientKey — fuera de Render', () => {
    test('usa req.ip e ignora CF-Connecting-IP y X-Forwarded-For', () => {
        const r = req({ headers: { 'cf-connecting-ip': '203.0.113.10', 'x-forwarded-for': '198.51.100.9' }, ip: '192.0.2.4' });
        expect(loginClientKey(r, LOCAL)).toBe('192.0.2.4');
    });

    test('req.ip IPv4-mapped (loopback de Node) → IPv4', () => {
        expect(loginClientKey(req({ ip: '::ffff:127.0.0.1' }), LOCAL)).toBe('127.0.0.1');
    });

    test('req.ip IPv6 → subred /56', () => {
        expect(loginClientKey(req({ ip: '2001:db8:abcd:12::1' }), LOCAL)).toBe('2001:db8:abcd::/56');
    });

    test.each(['false', '1', 'TRUE', ''])('RENDER=%j no activa la semántica de Render', (valor) => {
        expect(loginClientKey(req({ headers: { 'cf-connecting-ip': '203.0.113.10' }, ip: '192.0.2.4' }), { RENDER: valor })).toBe('192.0.2.4');
    });
});

describe('loginClientKey — buckets', () => {
    test('dos clientes distintos → keys distintas', () => {
        const a = loginClientKey(req({ headers: { 'cf-connecting-ip': '203.0.113.10' } }), RENDER);
        const b = loginClientKey(req({ headers: { 'cf-connecting-ip': '203.0.113.11' } }), RENDER);
        expect(a).not.toBe(b);
    });
});
