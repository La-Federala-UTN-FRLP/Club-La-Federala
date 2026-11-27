import { isIP } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';

export type LoginClientIpMode = 'legacy' | 'cloud-run-direct';

type IpRequest = {
    headers: IncomingHttpHeaders;
    rawHeaders?: readonly string[];
};

export type LoginClientIpCandidate =
    | { kind: 'candidate'; ip: string }
    | { kind: 'unverified'; reason: 'missing' | 'ambiguous' | 'invalid' };

/**
 * Experimental: the rightmost XFF entry is only a CANDIDATE under hypothesis H1
 * (the direct Run ingress appends the observed peer after client-supplied values).
 * This parser cannot prove H1 or discover extra proxies. Never use it implicitly.
 * Node can join duplicate header fields into a string: check rawHeaders as well.
 * No I/O, logs, global trust proxy setting, or fallback to another header/entry.
 */
export function cloudRunDirectIpCandidate(req: IpRequest): LoginClientIpCandidate {
    const value = req.headers['x-forwarded-for'];
    if (value === undefined) return { kind: 'unverified', reason: 'missing' };
    if (typeof value !== 'string') return { kind: 'unverified', reason: 'ambiguous' };

    const raw = req.rawHeaders;
    if (raw !== undefined) {
        if (raw.length % 2 !== 0) return { kind: 'unverified', reason: 'ambiguous' };
        let count = 0;
        for (let i = 0; i < raw.length; i += 2) {
            if (raw[i].toLowerCase() === 'x-forwarded-for') count++;
        }
        if (count > 1) return { kind: 'unverified', reason: 'ambiguous' };
    }

    // Only HTTP optional whitespace (SP/HTAB). Reject controls, including in a
    // supplied prefix; never emit the input in errors. Real HTTP size limits are
    // enforced by Node's parser, not a client-selectable prefix/token count here.
    if (/[\x00-\x08\x0a-\x1f\x7f]/.test(value)) {
        return { kind: 'unverified', reason: 'invalid' };
    }
    const ip = value.slice(value.lastIndexOf(',') + 1).replace(/^[ \t]+|[ \t]+$/g, '');
    // net.isIP accepts IPv6 zone identifiers; they are not admitted in this contract.
    if (ip.includes('%') || isIP(ip) === 0) return { kind: 'unverified', reason: 'invalid' };
    return { kind: 'candidate', ip };
}
