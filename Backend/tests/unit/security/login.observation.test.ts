import type { Request, Response, NextFunction } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import * as candidateModule from '../../../src/utils/loginClientIp';
import * as canonicalModule from '../../../src/config/loginObservation';
import { createLoginObserver, observationMiddleware, writeLoginObservation } from '../../../src/middlewares/loginObservation.middleware';
import { loginClientKey } from '../../../src/middlewares/loginRateLimit.middleware';
import { A, B, V6A, V6B, T, REV, selector, manifest, source, cases, fixture, req } from '../../support/loginObservation';

const live: ReturnType<typeof fixture>[] = [];
function make(...args: Parameters<typeof fixture>) { const f = fixture(...args); live.push(f); return f; }
afterEach(() => { for (const f of live.splice(0)) f.disable(); jest.restoreAllMocks(); });
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('P2 mechanics only: no H1 or operator provenance claim', () => {
    test('L01/O01/O02 disabled never reads candidate/request or dormant configuration', () => {
        const parse = jest.spyOn(candidateModule, 'cloudRunDirectIpCandidate');
        const headers = { get headers(): never { throw new Error('sensitive-getter'); } };
        const observer = createLoginObserver(null);
        observer.observe(headers);
        expect(parse).not.toHaveBeenCalled();
        expect(canonicalModule.parseLoginObservation({ get LOGIN_OBSERVATION_CONFIG(): never { throw new Error('dormant'); } })).toBeNull();
    });
    test.each([[A, A, true], [A, B, false], [B, B, true]])('L02/O03 configured expectation and suffix row %#', (expected, actual, match) => {
        const f = make(manifest({ cases: cases(1, expected) })); f.observe(req(actual));
        expect(f.events).toHaveLength(1); expect(f.events[0].match).toBe(match);
    });
    test.each(['', 'unknown,', '192.0.2.3,', ',,,', '  \t, unknown,\t'])('L03/O04 prefix row %#', (prefix) => {
        const f = make(); f.observe(req(`${prefix}${A}`)); expect(f.events[0].match).toBe(true);
    });
    test.each(['unknown', '"203.0.113.1"', '203.0.113.1:443', '[2001:db8::1]', '', ' \t', '203.0.113.1,'])('L04/L05/O05/O06 invalid suffix row %#', (suffix) => {
        const f = make(); f.observe(req(`203.0.113.1,${suffix}`));
        expect(f.events[0]).toMatchObject({ formatValid: false, family: 'none', match: false });
    });
    test('L05/L12/O06/O13 absence never falls back to socket', () => {
        for (const socket of [A, B, undefined]) {
            const f = make(); const r = { ...req(), headers: { 'x-login-observation-selector': selector() }, socket: { remoteAddress: socket }, ip: A };
            f.observe(r); expect(f.events[0]).toMatchObject({ source: 'none', family: 'none', formatValid: false, match: false });
        }
    });
    test.each([
        req([A, A]), req(A, selector(), ['X-Forwarded-For', A, 'x-FORWARDED-for', A]),
        req(`${A}, ${B}`, selector(), ['X-Forwarded-For', A, 'x-forwarded-for', B]), req(A, selector(), ['odd']),
    ])('L06/O07 duplicate or malformed raw row %#', (r) => {
        const f = make(); f.observe(r);
        // Malformed raw selector metadata cannot admit any event.
        if (r.rawHeaders?.length === 1) expect(f.events).toEqual([]);
        else expect(f.events[0]).toMatchObject({ duplicate: true, match: false, formatValid: false });
    });
    test.each(['0203.0.113.1', '0xcb007101', '203.0.113.1:80', '"203.0.113.1"', '[2001:db8::1]', 'fe80::1%eth0', '\u00a0203.0.113.1', '203.0.113.1\n', '203.0.113.1\x00'])('L07/O08 candidate grammar row %#', (value) => {
        const f = make(); f.observe(req(value)); expect(f.events[0].formatValid).toBe(false); expect(f.events[0].match).toBe(false);
    });
    test.each([
        [A, ' \t203.0.113.1\t ', true], [A, '::ffff:203.0.113.1', true], [A, '::ffff:cb00:7101', true],
        ['::ffff:cb00:7101', A, true], ['::ffff:203.0.113.1', '::ffff:cb00:7101', true],
        [V6A, '2001:0DB8:abcd:0012:0000:0000:0000:0001', true], [V6A, V6B, false], [V6A, '2001:db8:abcd:112::1', false], [V6A, A, false],
    ])('L08/L09/O09/O10 full address canonical equality row %#', (expected, actual, match) => {
        const f = make(manifest({ cases: cases(1, expected) })); f.observe(req(actual)); expect(f.events[0].match).toBe(match);
    });
    test('L09/O10 /56 keys collide while full address comparison rejects collision', () => {
        expect(ipKeyGenerator(V6A, 56) === ipKeyGenerator(V6B, 56)).toBe(true);
        const f = make(manifest({ cases: cases(1, V6A) })); f.observe(req(V6B)); expect(f.events[0].match).toBe(false);
    });
    test.each([
        ['0.1.0.0', '::ffff:1', 'ipv6'],
        ['::ffff:1', '0.1.0.0', 'ipv4'],
        ['0.0.0.0', '::ffff:0', 'ipv6'],
        ['::ffff:0', '0.0.0.0', 'ipv4'],
        ['18.52.86.120', '::ffff:1234:5678:9abc', 'ipv6'],
        ['::ffff:1234:5678:9abc', '18.52.86.120', 'ipv4'],
        ['::ffff:1234:5678:9abc', '::ffff:1234:5678:9abd', 'ipv6'],
        ['::ffff:1234:5678:9abd', '::ffff:1234:5678:9abc', 'ipv6'],
        ['::ffff:0:0', '::ffff:0', 'ipv6'],
        ['::ffff:0', '::ffff:0:0', 'ipv4'],
    ])('O09 nonmapped prefix must not produce a false-match event row %#', (expected, actual, family) => {
        const f = make(manifest({ cases:cases(1,expected) })); f.observe(req(actual));
        expect(f.events).toHaveLength(1);
        expect(f.events[0]).toMatchObject({ family, formatValid:true, match:false });
    });
    test.each([
        ['::ffff:1', '0:0:0:0:0:0:ffff:1'],
        ['::ffff:1234:5678:9abc', '0:0:0:0:ffff:1234:5678:9abc'],
    ])('O09 equivalent native IPv6 remains ipv6 at event level row %#', (expected, actual) => {
        const f = make(manifest({ cases:cases(1,expected) })); f.observe(req(actual));
        expect(f.events).toHaveLength(1);
        expect(f.events[0]).toMatchObject({ family:'ipv6', formatValid:true, match:true });
    });
    test('L10/L11/O11/O12 NAT cannot identify users; new egress requires new independent expectation', () => {
        const f = make(manifest({ cases: cases(3) }));
        f.observe(Object.assign(req(A, selector(1)), { body: { user: 'one' } }));
        f.observe(Object.assign(req(A, selector(2)), { body: { user: 'two' } }));
        f.observe(Object.assign(req(B, selector(3)), { body: { user: 'one' } }));
        expect(f.events.map((e) => e.match)).toEqual([true, true, false]);
        const independent = make(manifest({ cases: cases(1, B) })); independent.observe(req(B)); expect(independent.events[0].match).toBe(true);
    });
    test('L13/O14/O28/O31 malicious declared expected/match/hash/case/revision never changes truth or rearms', () => {
        const f = make();
        const r = { ...req(B), ip: B, socket: { remoteAddress: B }, user: { id: 1 },
            body: { expectedIp: B, match: true, expectedHash: 'private-hash', caseLabel: 'U2N2V6', revision: 'evil' },
            query: { expectedIp: B, match: 'true' } };
        Object.assign(r.headers, { 'x-expected-ip': B, 'x-match': 'true', 'x-real-ip': A, forwarded: `for=${A}`, 'cf-connecting-ip': A });
        f.observe(r); f.observe(r);
        expect(f.events).toHaveLength(1); expect(f.events[0]).toMatchObject({ caseLabel: 'U1N1V1', revision: REV, match: false });
        expect(Object.keys(f.events[0]).sort()).toEqual(['caseLabel','duplicate','family','formatValid','match','processId','revision','source']);
    });
    test('L14/O15 syntactic caller-controlled favorable event does NOT establish H1', () => {
        const f = make(manifest({ cases: cases(2) }));
        f.observe(req(`${A},${B}`, selector(1))); f.observe(req(A, selector(2)));
        expect(f.events.map((e) => e.match)).toEqual([false, true]);
    });
    test('L17/O21/O32 all outcomes reserve equally, cap stops even when sink remains pending', () => {
        const sink = jest.fn(() => new Promise<void>(() => undefined));
        const f = make(manifest({ maxEvents: 2, cases: cases(4) }), { sink });
        f.observe(req(B, selector(1))); f.observe(req('invalid', selector(2))); f.observe(req(A, selector(3)));
        expect(sink).toHaveBeenCalledTimes(2);
        expect(sink.mock.calls.map((call) => (call as unknown as [{ match: boolean }])[0].match)).toEqual([false, false]);
    });
    test('L18/O22 restarting resets capabilities/cap/processId before same fixed deadline only', () => {
        const data = manifest({ maxEvents: 1 }); const f = make(data); const restarted = make(data);
        f.observe(req()); f.observe(req()); restarted.observe(req());
        expect(f.events).toHaveLength(1); expect(restarted.events).toHaveLength(1);
        expect(f.events[0].processId === restarted.events[0].processId).toBe(false);
        const late = make(data); late.setWall(T + 900000); late.observe(req()); expect(late.events).toEqual([]);
    });
    test('L19/O23 concurrent replay, finite budget, no await before consumption', async () => {
        const f = make(manifest({ maxEvents: 2, cases: cases(4) }));
        await Promise.all([1,1,2,3,4].map(async (n) => f.observe(req(A, selector(n)))));
        expect(f.events.map((e) => e.caseLabel)).toEqual(['U1N1V1', 'U1N1V2']);
    });
    test('L20/O24 exact immutable event and allowlisted production serializer; no request wrappers', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        const f = make(); f.observe(req());
        expect(Object.isFrozen(f.events[0])).toBe(true);
        expect(f.events[0].processId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        writeLoginObservation(Object.assign({}, f.events[0], { rawSecret: 'sensitive-extra' }));
        expect(log.mock.calls).toEqual([[JSON.stringify(f.events[0])]]);
    });
    test.each(['sink-sync','sink-reject','candidate','canonical','getter','clock','revision','mode'])('L20/O25/O26 failure isolation row %s', async (failure) => {
        const logs = [jest.spyOn(console, 'log'),jest.spyOn(console, 'warn'),jest.spyOn(console, 'error')].map((spy) => spy.mockImplementation(() => undefined));
        const stdout = jest.spyOn(process.stdout,'write').mockImplementation(() => true);
        const stderr = jest.spyOn(process.stderr,'write').mockImplementation(() => true);
        const secret = Object.assign(new Error('sensitive-error-message'), { cause: 'sensitive-cause', config: 'sensitive-config' });
        const fail = () => { throw secret; };
        const sink = jest.fn(failure === 'sink-sync' ? fail : failure === 'sink-reject' ? () => Promise.reject(secret) : () => undefined);
        const f = make(manifest({ cases: cases(2) }), { sink });
        if (failure === 'candidate') jest.spyOn(candidateModule, 'cloudRunDirectIpCandidate').mockImplementation(fail);
        if (failure === 'canonical') jest.spyOn(canonicalModule, 'canonicalObservationIp').mockImplementation(fail);
        if (failure === 'clock') f.setWall(NaN);
        const target = failure === 'getter' ? { get headers(): never { return fail(); } } : req();
        const broken = failure === 'revision' || failure === 'mode' ? make(undefined, { [failure]: fail, sink }) : f;
        const next = jest.fn();
        observationMiddleware(() => broken)(target as Request, {} as Response, next as NextFunction);
        await flush(); broken.observe(req(A, selector(2)));
        expect(next.mock.calls).toEqual([[]]);
        expect(logs.flatMap((spy) => spy.mock.calls)).toEqual([]);
        expect(stdout.mock.calls).toEqual([]); expect(stderr.mock.calls).toEqual([]);
        expect(sink.mock.calls.length).toBeLessThanOrEqual(1);
    });
    test('O26/O33 never-resolving sink does not hold downstream or permit admissions after disable', () => {
        const sink = jest.fn(() => new Promise<void>(() => undefined));
        const f = make(manifest({ cases:cases(3) }),{ sink }); const next = jest.fn();
        const middleware = observationMiddleware(() => f);
        middleware(req() as Request,{} as Response,next); f.disable();
        middleware(req(A,selector(2)) as Request,{} as Response,next);
        expect(next.mock.calls).toEqual([[],[]]); expect(sink).toHaveBeenCalledTimes(1);
    });
    test('O25 unexpected route boundary error calls downstream exactly once without error', () => {
        const next = jest.fn(); observationMiddleware(() => { throw new Error('sensitive-boundary'); })(req() as Request, {} as Response, next);
        expect(next.mock.calls).toEqual([[]]);
        const disable = jest.fn(() => { throw new Error('sensitive-disable'); });
        const nextAgain = jest.fn(); observationMiddleware(() => ({ observe: () => { throw new Error('sensitive-observe'); }, disable }))(req() as Request, {} as Response, nextAgain);
        expect(disable).toHaveBeenCalledTimes(1); expect(nextAgain.mock.calls).toEqual([[]]);
    });
    test('O19 invalid/nonfinite/throwing clocks at construction remain disabled without rearming', () => {
        for (const value of [NaN,Infinity,-Infinity]) {
            const f = make(undefined,{ wallNow:() => value }); f.observe(req()); expect(f.events).toEqual([]);
            const m = make(undefined,{ monotonicNow:() => value }); m.observe(req()); expect(m.events).toEqual([]);
        }
        const f = make(undefined,{ wallNow:() => { throw new Error('sensitive-clock'); } }); f.observe(req()); expect(f.events).toEqual([]);
    });
    test('O19/O33 process revision or mode changes latch off, even if later restored', () => {
        let revision = REV; let mode = 'legacy';
        const f = make(undefined,{ revision:() => revision, mode:() => mode });
        revision = 'different-revision'; f.observe(req()); revision = REV; f.observe(req()); expect(f.events).toEqual([]);
        const g = make(undefined,{ mode:() => mode }); mode = 'cloud-run-direct'; g.observe(req()); mode = 'legacy'; g.observe(req()); expect(g.events).toEqual([]);
    });
    test('L21/O27 hostile structure errors latch off; long benign prefix accepted', () => {
        const f = make(); f.observe(req(`${'unknown,'.repeat(10000)}${A}`)); expect(f.events[0].match).toBe(true);
        const bad = make(); bad.observe(req(A, selector(), [null as unknown as string, A])); expect(bad.events).toEqual([]);
        const broken = make(); broken.observe({ headers: null as never }); expect(broken.events).toEqual([]);
    });
    test.each([undefined, '', 'U1N1V1', 'a'.repeat(63), 'A'.repeat(64), `${selector()}, ${selector()}`, [selector()], selector(90)])('O29 unknown/malformed/scalar-only selector row %#', (value) => {
        const f = make(); const r = req(A); if (value === undefined) delete r.headers['x-login-observation-selector']; else r.headers['x-login-observation-selector'] = value;
        f.observe(Object.assign(r, { query: { selector: selector() }, body: { selector: selector() } })); expect(f.events).toEqual([]);
        f.observe(req()); expect(f.events).toHaveLength(1);
    });
    test('O29/O30 duplicate selector rejected; out-of-order authorized cases work, replay cannot rearm', () => {
        const f = make(manifest({ cases: cases(2) }));
        f.observe(req(A, selector(), ['X-Login-Observation-Selector', selector(), 'x-login-observation-selector', selector()]));
        expect(f.events).toEqual([]); f.observe(req(A, selector(2))); f.observe(req()); f.observe(req());
        expect(f.events.map((e) => e.caseLabel)).toEqual(['U1N1V2','U1N1V1']);
    });
    test('O33 before start, T-1/T/T+1 deadline and irreversible deactivate', () => {
        const f = make(manifest({ cases: cases(4) }));
        f.setWall(T - 1); f.observe(req()); f.setWall(T); f.observe(req()); expect(f.events).toEqual([]); // backward clock latches
        const active = make(manifest({ cases: cases(4) })); active.setWall(T + 899999); active.observe(req());
        active.setWall(T + 900000); active.observe(req(A, selector(2))); active.setWall(T + 900001); active.observe(req(A, selector(3)));
        expect(active.events).toHaveLength(1);
        const future = make(manifest({ startsAt: new Date(T + 1000).toISOString() })); future.observe(req()); expect(future.events).toEqual([]);
        future.setWall(T + 1000); future.observe(req()); expect(future.events).toHaveLength(1);
        const disabled = make(); disabled.disable(); disabled.observe(req()); expect(disabled.events).toEqual([]);
    });
    test.each(['wall-back','mono-back','mono-end','wall-nan','mono-infinity'])('O19/O33 clock latches row %s', (kind) => {
        const f = make();
        if (kind === 'wall-back') f.setWall(T - 1);
        if (kind === 'mono-back') f.setMono(99);
        if (kind === 'mono-end') f.setMono(900100);
        if (kind === 'wall-nan') f.setWall(NaN);
        if (kind === 'mono-infinity') f.setMono(Infinity);
        f.observe(req()); f.setWall(T); f.setMono(100); f.observe(req()); expect(f.events).toEqual([]);
    });
    test('O33 bounded timer disables while idle and cannot resurrect after wall rollback', () => {
        jest.useFakeTimers();
        try { const f = make(); f.setWall(T + 900000); jest.advanceTimersByTime(1000); f.setWall(T); f.observe(req()); expect(f.events).toEqual([]); }
        finally { jest.useRealTimers(); }
    });
    test('O33 expiry or disable during parsing prevents the reserved sink call', () => {
        const parse = candidateModule.cloudRunDirectIpCandidate;
        const f = make();
        jest.spyOn(candidateModule,'cloudRunDirectIpCandidate').mockImplementation((r) => { f.setWall(T + 900000); return parse(r); });
        f.observe(req()); expect(f.events).toEqual([]);
        const g = make();
        jest.spyOn(candidateModule,'cloudRunDirectIpCandidate').mockImplementation((r) => { g.disable(); return parse(r); });
        g.observe(req()); expect(g.events).toEqual([]);
    });
    test('O19 defensive copied registry and config do not follow later caller mutations', () => {
        const base = make(); const copy = { ...base.config, cases: base.config.cases.map((entry) => ({ ...entry })) };
        const events: unknown[] = [];
        const f = createLoginObserver(copy, { wallNow: () => T, monotonicNow: () => 1, revision: () => REV, mode: () => 'legacy', sink: (event) => { events.push(event); } });
        try { copy.cases[0].expectedIp = B; copy.expiresAt = T; copy.revision = 'evil'; f.observe(req()); expect(events).toMatchObject([{ match: true, revision: REV }]); }
        finally { f.disable(); }
    });
    test('O02/O34 observer never writes frozen request and legacy key is unchanged across suffixes', () => {
        const f = make(manifest({ cases: cases(2) }));
        const keys = [A,B].map((xff, i) => {
            const r = Object.freeze({ ...req(xff, selector(i + 1)), headers: Object.freeze(req(xff, selector(i + 1)).headers), ip: '192.0.2.1' });
            const before = loginClientKey(r as Request, {}); f.observe(r); expect(loginClientKey(r as Request, {})).toBe(before); return before;
        });
        expect(keys[0] === keys[1]).toBe(true); expect(f.events.map((e) => e.match)).toEqual([true,false]);
    });
});
