import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { RequestHandler } from 'express';
import { getWebEnv, type WebEnv } from '../config/env';
import { canonicalObservationIp, OBSERVATION_MAX_WINDOW_MS, OBSERVATION_SELECTOR, type ObservationConfig, type ObservationCaseLabel } from '../config/loginObservation';
import { cloudRunDirectIpCandidate } from '../utils/loginClientIp';

export type LoginObservationEvent = Readonly<{
    caseLabel: ObservationCaseLabel;
    revision: string;
    processId: string;
    source: 'xff-rightmost' | 'none';
    family: 'ipv4' | 'ipv6' | 'none';
    formatValid: boolean;
    duplicate: boolean;
    match: boolean;
}>;
type ObservationRequest = { headers: IncomingHttpHeaders; rawHeaders?: readonly string[] };
type Dependencies = {
    sink?: (event: LoginObservationEvent) => void | Promise<void>;
    wallNow?: () => number;
    monotonicNow?: () => number;
    revision?: () => string | undefined;
    mode?: () => string | undefined;
};
export type LoginObserver = { observe: (req: ObservationRequest) => void; disable: () => void };

/** No wrapper, prefix, request context or error serialization in the production sink. */
export function writeLoginObservation(event: LoginObservationEvent): void {
    console.log(JSON.stringify({ caseLabel: event.caseLabel, revision: event.revision, processId: event.processId,
        source: event.source, family: event.family, formatValid: event.formatValid, duplicate: event.duplicate, match: event.match }));
}

function headerCount(req: ObservationRequest, name: string): number {
    const raw = req.rawHeaders;
    if (raw === undefined) return 0;
    if (!Array.isArray(raw) || raw.length % 2 !== 0) return -1;
    let count = 0;
    for (let i = 0; i < raw.length; i += 2) {
        if (typeof raw[i] !== 'string' || typeof raw[i + 1] !== 'string') return -1;
        if (raw[i].toLowerCase() === name) count++;
    }
    return count;
}

/**
 * Config comes only from the validated operator parser. State/capabilities/caps
 * are per factory/process, not persistent or distributed. Equality proves no H1.
 * No await between admission, consumption and sink invocation; at most 24 pending
 * sink promises, no retry, and no response/finish listeners or request retention.
 */
export function createLoginObserver(config: ObservationConfig | null, deps: Dependencies = {}): LoginObserver {
    let stopped = config === null;
    const registry = new Map(config?.cases.map((entry) => [entry.selector, { ...entry }]) ?? []);
    const startsAt = config?.startsAt ?? 0;
    const expiresAt = config?.expiresAt ?? 0;
    const revision = config?.revision ?? '';
    const maxEvents = config?.maxEvents ?? 0;
    const processId = randomUUID();
    const wallNow = deps.wallNow ?? Date.now;
    const monotonicNow = deps.monotonicNow ?? (() => performance.now());
    const currentRevision = deps.revision ?? (() => process.env.K_REVISION);
    const mode = deps.mode ?? (() => process.env.LOGIN_CLIENT_IP_MODE);
    const sink = deps.sink ?? writeLoginObservation;
    let attempts = 0;
    let lastWall = 0;
    let lastMono = 0;
    let monoEnd = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const disable = () => { stopped = true; registry.clear(); if (timer) clearInterval(timer); timer = undefined; };
    const guard = (reserved = false): boolean => {
        if (stopped) return false;
        try {
            const wall = wallNow(); const mono = monotonicNow();
            if (!Number.isFinite(wall) || !Number.isFinite(mono) || wall < lastWall || mono < lastMono || mono >= monoEnd
                || wall >= expiresAt || currentRevision() !== revision || mode() !== 'legacy' || (!reserved && attempts >= maxEvents)) {
                disable(); return false;
            }
            lastWall = wall; lastMono = mono;
            return wall >= startsAt;
        } catch { disable(); return false; }
    };
    if (!stopped) {
        try {
            lastWall = wallNow(); lastMono = monotonicNow();
            monoEnd = lastMono + Math.min(expiresAt - lastWall, OBSERVATION_MAX_WINDOW_MS);
            // Finite clocks and guard are checked before timer creation, too.
            guard();
            if (!stopped) { timer = setInterval(guard, 1000); timer.unref(); }
        } catch { disable(); }
    }
    const observe = (req: ObservationRequest): void => {
        try {
            if (!guard()) return;
            const selector = req.headers['x-login-observation-selector'];
            const count = headerCount(req, 'x-login-observation-selector');
            if (typeof selector !== 'string' || !OBSERVATION_SELECTOR.test(selector) || count < 0 || count > 1) return;
            const entry = registry.get(selector);
            if (!entry) return;
            registry.delete(selector); attempts++;
            const candidate = cloudRunDirectIpCandidate(req);
            const ip = candidate.kind === 'candidate' ? canonicalObservationIp(candidate.ip) : null;
            const xffCount = headerCount(req, 'x-forwarded-for');
            const event: LoginObservationEvent = Object.freeze({ caseLabel: entry.caseLabel, revision, processId,
                source: req.headers['x-forwarded-for'] === undefined ? 'none' : 'xff-rightmost',
                family: ip?.family ?? 'none', formatValid: ip !== null,
                duplicate: xffCount < 0 || xffCount > 1 || Array.isArray(req.headers['x-forwarded-for']),
                match: ip !== null && ip.address === entry.expectedIp });
            // A slow/hostile getter or parser cannot emit after expiry/deactivation.
            if (!guard(true)) return;
            // Stop/clear state before sink reentrancy on the last allowance.
            if (attempts >= maxEvents) disable();
            const pending = sink(event);
            if (pending !== undefined) void Promise.resolve(pending).catch(() => { disable(); });
        } catch { disable(); }
    };
    return { observe, disable };
}

/** Route-level boundary also isolates unexpected factory/getter/observer errors. */
export function observationMiddleware(resolve: () => LoginObserver): RequestHandler {
    return (req, _res, next) => {
        let resolved: LoginObserver | undefined;
        try { resolved = resolve(); resolved.observe(req); }
        catch {
            // Never next(error), log input, or block login, even if disable fails.
            try { resolved?.disable(); } catch { /* Failure remains isolated. */ }
        }
        next();
    };
}

let cachedEnv: WebEnv | undefined;
let observer: LoginObserver | undefined;
export const loginObservation = observationMiddleware(() => {
    const env = getWebEnv();
    if (env !== cachedEnv) {
        observer?.disable();
        observer = createLoginObserver(env.loginObservation);
        cachedEnv = env;
    }
    return observer!;
});
