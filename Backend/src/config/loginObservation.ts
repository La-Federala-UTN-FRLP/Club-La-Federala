import { isIP } from 'node:net';

export type ObservationCaseLabel = `U${1 | 2}N${1 | 2}V${1 | 2 | 3 | 4 | 5 | 6}`;
export type ObservationConfig = Readonly<{
    startsAt: number;
    expiresAt: number;
    revision: string;
    maxEvents: number;
    cases: readonly Readonly<{ caseLabel: ObservationCaseLabel; selector: string; expectedIp: string }>[];
}>;

export const OBSERVATION_MAX_WINDOW_MS = 15 * 60 * 1000;
export const OBSERVATION_SELECTOR = /^[a-f0-9]{64}$/;
const LABEL = /^U[12]N[12]V[1-6]$/;
const REVISION = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Full address equality only. URL normalizes IPv6; never use limiter subnet keys. */
export function canonicalObservationIp(value: string): { address: string; family: 'ipv4' | 'ipv6' } | null {
    if (value.includes('%')) return null;
    const family = isIP(value);
    if (family === 4) return { address: value, family: 'ipv4' };
    if (family !== 6) return null;
    const address = new URL(`http://[${value}]/`).hostname.slice(1, -1);
    // Only the exact mapped /96 prefix qualifies after URL normalization.
    // A textual ::ffff: prefix alone can also belong to native IPv6 with one
    // or three trailing words; truncating those would manufacture collisions.
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
    if (mapped) {
        const words = [Number.parseInt(mapped[1], 16), Number.parseInt(mapped[2], 16)];
        const bytes = [words[0] >>> 8, words[0] & 255, words[1] >>> 8, words[1] & 255];
        return { address: bytes.join('.'), family: 'ipv4' };
    }
    return { address, family: 'ipv6' };
}

function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function utc(value: unknown): number | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
}

/**
 * Safe, silent opt-in parser. Never return/throw input-bearing validation errors.
 * Off (including invalid activation) does not read dormant JSON. Env/cached WebEnv
 * can retain private config after disable; clearing the active map is not erasure.
 */
export function parseLoginObservation(source: Record<string, string | undefined>): ObservationConfig | null {
    try {
        if (source.LOGIN_OBSERVATION_ENABLED !== 'on') return null;
        if (source.LOGIN_CLIENT_IP_MODE !== 'legacy') return null;
        const raw = source.LOGIN_OBSERVATION_CONFIG;
        if (typeof raw !== 'string' || raw.length > 16384) return null;
        const value: unknown = JSON.parse(raw);
        if (!object(value) || Object.keys(value).sort().join(',') !== 'cases,expiresAt,maxEvents,revision,startsAt') return null;
        const startsAt = utc(value.startsAt);
        const expiresAt = utc(value.expiresAt);
        if (startsAt === null || expiresAt === null || expiresAt <= startsAt || expiresAt - startsAt > OBSERVATION_MAX_WINDOW_MS) return null;
        if (typeof value.revision !== 'string' || !REVISION.test(value.revision) || value.revision !== source.K_REVISION) return null;
        if (!Number.isInteger(value.maxEvents) || (value.maxEvents as number) < 1 || (value.maxEvents as number) > 24) return null;
        if (!Array.isArray(value.cases) || value.cases.length < 1 || value.cases.length > 24) return null;
        const labels = new Set<string>();
        const selectors = new Set<string>();
        const cases: ObservationConfig['cases'][number][] = [];
        for (const entry of value.cases) {
            if (!object(entry) || Object.keys(entry).sort().join(',') !== 'caseLabel,expectedIp,selector') return null;
            const { caseLabel, selector, expectedIp } = entry;
            if (typeof caseLabel !== 'string' || !LABEL.test(caseLabel) || labels.has(caseLabel)) return null;
            // Operator must generate these with a CSPRNG, e.g. randomBytes(32).
            // Syntax validation cannot establish entropy or operator provenance.
            if (typeof selector !== 'string' || !OBSERVATION_SELECTOR.test(selector) || selectors.has(selector)) return null;
            if (typeof expectedIp !== 'string') return null;
            const ip = canonicalObservationIp(expectedIp);
            if (!ip) return null;
            labels.add(caseLabel); selectors.add(selector);
            cases.push(Object.freeze({ caseLabel: caseLabel as ObservationCaseLabel, selector, expectedIp: ip.address }));
        }
        return Object.freeze({ startsAt, expiresAt, revision: value.revision, maxEvents: value.maxEvents as number, cases: Object.freeze(cases) });
    } catch { return null; }
}
