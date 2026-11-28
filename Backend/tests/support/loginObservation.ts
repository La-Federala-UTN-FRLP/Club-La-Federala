import type { IncomingHttpHeaders } from 'node:http';
import { parseLoginObservation, type ObservationCaseLabel } from '../../src/config/loginObservation';
import { createLoginObserver, type LoginObservationEvent } from '../../src/middlewares/loginObservation.middleware';

export const A = '203.0.113.1';
export const B = '198.51.100.2';
export const V6A = '2001:db8:abcd:12::1';
export const V6B = '2001:db8:abcd:ff::2';
export const T = Date.parse('2026-11-27T12:00:00.000Z');
export const REV = 'observation-local-00001';
// Deterministic synthetic fixtures only; real operators MUST use CSPRNG selectors.
export const selector = (n = 1) => n.toString(16).padStart(64, '0');
export function manifest(overrides: Record<string, unknown> = {}) {
    return { startsAt: new Date(T).toISOString(), expiresAt: new Date(T + 900000).toISOString(),
        revision: REV, maxEvents: 24, cases: [{ caseLabel: 'U1N1V1', selector: selector(), expectedIp: A }], ...overrides };
}
export function source(overrides: Record<string, string | undefined> = {}, data = manifest()) {
    return { LOGIN_OBSERVATION_ENABLED: 'on', LOGIN_CLIENT_IP_MODE: 'legacy', K_REVISION: REV,
        LOGIN_OBSERVATION_CONFIG: JSON.stringify(data), ...overrides };
}
export function cases(count: number, expectedIp = A) {
    return Array.from({ length: count }, (_, i) => ({ selector: selector(i + 1), expectedIp,
        caseLabel: `U${Math.floor(i / 12) + 1}N${Math.floor(i / 6) % 2 + 1}V${i % 6 + 1}` as ObservationCaseLabel }));
}
export function fixture(data = manifest(), deps: Parameters<typeof createLoginObserver>[1] = {}) {
    let wall = T; let mono = 100;
    const events: LoginObservationEvent[] = [];
    const config = parseLoginObservation(source({}, data));
    if (!config) throw new Error('Invalid synthetic test configuration');
    const observer = createLoginObserver(config, { wallNow: () => wall, monotonicNow: () => mono,
        mode: () => 'legacy', revision: () => REV, sink: (event) => { events.push(event); }, ...deps });
    return { ...observer, events, setWall: (value: number) => { wall = value; }, setMono: (value: number) => { mono = value; }, config };
}
export function req(xff: string | string[] | undefined = A, selected: string | string[] | undefined = selector(), rawHeaders?: string[]) {
    const headers: IncomingHttpHeaders = {};
    if (xff !== undefined) headers['x-forwarded-for'] = xff;
    if (selected !== undefined) headers['x-login-observation-selector'] = selected;
    return { headers, rawHeaders };
}
