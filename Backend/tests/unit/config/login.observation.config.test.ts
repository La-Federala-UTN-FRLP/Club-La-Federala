import { canonicalObservationIp, parseLoginObservation } from '../../../src/config/loginObservation';
import { parseWebEnv, EnvValidationError } from '../../../src/config/env';
import { A, B, selector, manifest, source, cases, REV } from '../../support/loginObservation';

const web = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://dummy:dummy@localhost:5432/dummy', JWT_SECRET: 'synthetic-test', STORAGE_PROVIDER: 'gcs', GCS_BUCKET: 'synthetic-unit-bucket' };
afterEach(() => jest.restoreAllMocks());

describe('Canonical IPv4-mapped /96 boundary: independent literal oracle', () => {
    test.each([
        ['::ffff:1', '::ffff:1', 'ipv6'],
        ['::ffff:0', '::ffff:0', 'ipv6'],
        ['::ffff:1234:5678:9abc', '::ffff:1234:5678:9abc', 'ipv6'],
        ['::ffff:1234:5678:9abd', '::ffff:1234:5678:9abd', 'ipv6'],
        ['::ffff:cb00:7101', '203.0.113.1', 'ipv4'],
        ['::FFFF:CB00:7101', '203.0.113.1', 'ipv4'],
        ['0:0:0:0:0:ffff:cb00:7101', '203.0.113.1', 'ipv4'],
        ['0000:0000:0000:0000:0000:ffff:cb00:7101', '203.0.113.1', 'ipv4'],
        ['::ffff:203.0.113.1', '203.0.113.1', 'ipv4'],
        ['::ffff:0:1', '0.0.0.1', 'ipv4'],
        ['::ffff:0:0', '0.0.0.0', 'ipv4'],
    ])('exact canonical family/address row %#', (input, address, family) => {
        // No round-trip or comparator-derived expectation: both are literal.
        expect(canonicalObservationIp(input)).toEqual({ address, family });
        const config = parseLoginObservation(source({}, manifest({ cases:cases(1,input) })))!;
        expect(config).not.toBeNull();
        expect(config.cases[0].expectedIp === address).toBe(true);
    });
});

describe('L15/O01/O16-O19 safe observer config, independent web validation', () => {
    test.each([undefined, '', 'off', 'true', 'ON', ' on', 'on ', 'on\n', 'sensitive'.repeat(1000)])('activation row %# silently disables', (activation) => {
        const s = source({ LOGIN_OBSERVATION_ENABLED: activation });
        Object.defineProperty(s, 'LOGIN_OBSERVATION_CONFIG', { get: () => { throw new Error('dormant-config-must-not-be-read'); } });
        expect(parseLoginObservation(s)).toBeNull();
    });
    test.each(['development','test','production'])('O01 %s/Run never implicitly enables', (NODE_ENV) => {
        for (const K_SERVICE of [undefined, 'synthetic-service']) for (const LOGIN_CLIENT_IP_MODE of [undefined,'legacy','cloud-run-direct']) {
            expect(parseLoginObservation(source({ LOGIN_OBSERVATION_ENABLED: undefined, NODE_ENV, K_SERVICE, LOGIN_CLIENT_IP_MODE }))).toBeNull();
        }
    });
    test.each([undefined, '', 'cloud-run-direct', 'LEGACY', 'legacy '])('O02 explicit legacy required row %#', (mode) => {
        expect(parseLoginObservation(source({ LOGIN_CLIENT_IP_MODE: mode }))).toBeNull();
    });
    test('valid fully frozen defensive config; source changes cannot modify result', () => {
        const data = manifest(); const s = source({}, data); const parsed = parseLoginObservation(s)!;
        expect(parsed).not.toBeNull(); expect(Object.isFrozen(parsed)).toBe(true); expect(Object.isFrozen(parsed.cases)).toBe(true); expect(Object.isFrozen(parsed.cases[0])).toBe(true);
        data.cases[0].expectedIp = B; s.LOGIN_OBSERVATION_CONFIG = '{}';
        expect(parsed.cases[0].expectedIp === A).toBe(true);
    });
    test.each([
        {}, { cases: [] }, { cases: cases(25) }, { cases: [...cases(1), ...cases(1)] },
        { cases: [{ caseLabel: 'U1N1V1', selector: selector(), expectedIp: A }, { caseLabel: 'U1N1V2', selector: selector(), expectedIp: B }] },
        ...['__proto__','constructor','U3N1V1','U1N1V7',1,1.5,'U1N1V1\n','x'.repeat(100)].map((caseLabel) => ({ cases: [{ caseLabel, selector: selector(), expectedIp: A }] })),
        ...['', 'a'.repeat(32),'A'.repeat(64),'x'.repeat(64),null,1].map((sel) => ({ cases: [{ caseLabel:'U1N1V1', selector:sel, expectedIp:A }] })),
        ...['', '203.0.113.1:80','[2001:db8::1]','fe80::1%eth0','203.0.113.1,198.51.100.2',' 203.0.113.1',null,1].map((expectedIp) => ({ cases: [{ caseLabel:'U1N1V1', selector:selector(), expectedIp }] })),
        { cases: [{ ...cases(1)[0], unexpected: 'sensitive-extra' }] },
    ])('O17 invalid registry row %#', (override) => {
        const data = Object.keys(override).length === 0 ? {} : manifest(override);
        expect(parseLoginObservation(source({}, data as ReturnType<typeof manifest>))).toBeNull();
    });
    test.each([undefined,0,-1,1.5,25,NaN,Infinity,'2','2x',1e30])('O18 unsafe count row %#', (maxEvents) => {
        expect(parseLoginObservation(source({}, manifest({ maxEvents })))).toBeNull();
    });
    test.each([
        { expiresAt: undefined }, { startsAt: undefined }, { expiresAt: '2026-11-27T12:16:00.000Z' },
        { expiresAt: '2026-11-27T12:00:00.000Z' }, { expiresAt:'2026-11-27T11:59:59.999Z' },
        { startsAt:'2026-02-30T12:00:00.000Z' }, { expiresAt:'2026-11-27T12:15:00+00:00' }, { expiresAt:'2026-11-27T12:15:00Z' },
        { revision:'sensitive-revision/secret' }, { revision:'a'.repeat(64) }, { revision:'valid-but-not-approved' }, { revision:undefined }, { extra:'sensitive-config' },
    ])('O18 absolute UTC window/revision validation row %#', (override) => {
        expect(parseLoginObservation(source({}, manifest(override)))).toBeNull();
    });
    test.each(['', '{sensitive-json', 'null','[]', '"sensitive-json"', 'x'.repeat(16385)])('O24 malformed config is silent and input-free row %#', (raw) => {
        const spies = [jest.spyOn(console,'log'),jest.spyOn(console,'warn'),jest.spyOn(console,'error')].map((spy) => spy.mockImplementation(() => undefined));
        expect(() => parseWebEnv({ ...web, ...source({ LOGIN_OBSERVATION_CONFIG: raw }) })).not.toThrow();
        expect(parseWebEnv({ ...web, ...source({ LOGIN_OBSERVATION_CONFIG: raw }) }).loginObservation).toBeNull();
        expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    });
    test('O24 getters/errors never escape or log; existing web errors retain startup behavior', () => {
        const bad = { get LOGIN_OBSERVATION_ENABLED(): never { throw new Error('sensitive-config-getter'); } };
        expect(parseLoginObservation(bad)).toBeNull();
        expect(() => parseWebEnv({ ...web, ...source(), DATABASE_URL: '' })).toThrow(EnvValidationError);
        expect(parseWebEnv({ ...web, ...source() }).loginObservation?.revision).toBe(REV);
    });
});
