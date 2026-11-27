jest.mock('../../../src/config/prisma', () => ({ user: { findUnique: jest.fn() } }));
jest.mock('../../../src/services/lote.service', () => ({ getAllLotes: jest.fn() }));

import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/config/prisma';
import { getAllLotes } from '../../../src/services/lote.service';
import { bearer, signTestToken, useTestWebEnv } from '../../support/http';

useTestWebEnv({ authIdentity: 'db' });
const findUser = prisma.user.findUnique as jest.Mock;
const list = getAllLotes as jest.Mock;
const future = () => Math.floor(Date.now() / 1000) + 3600;
let warn: jest.SpyInstance;

beforeEach(() => {
    findUser.mockReset().mockResolvedValue({ id: 7, email: 'actor@example.com', role: 'GESTOR', inmobiliaria: null });
    list.mockReset().mockResolvedValue({ lotes: [], total: 0 });
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe('JWT acceptance policy at the HTTP boundary', () => {
    test.each([
        ['missing expiry', () => jwt.sign({ sub: 7 }, 'unit-test-jwt-secret')],
        ['expired', () => signTestToken({ sub: 7, exp: 1 })],
        ['not active yet', () => signTestToken({ sub: 7, exp: future() + 3600, nbf: future() })],
        ['different signature', () => jwt.sign({ sub: 7, exp: future() }, 'different-unit-test-secret')],
        ['HS384', () => signTestToken({ sub: 7, exp: future() }, { algorithm: 'HS384' })],
        ['HS512', () => signTestToken({ sub: 7, exp: future() }, { algorithm: 'HS512' })],
        ['unsigned', () => jwt.sign({ sub: 7, exp: future() }, '', { algorithm: 'none' })],
        ['malformed', () => 'invalid.unit.token'],
        ['missing subject', () => signTestToken({ exp: future() })],
        ['invalid subject with legacy id', () => signTestToken({ sub: 'invalid', id: 7, exp: future() })],
        ['unsafe subject', () => signTestToken({ sub: Number.MAX_SAFE_INTEGER + 1, exp: future() })],
    ])('%s is rejected before identity lookup or business code', async (_name, token) => {
        const res = await request(app).get('/api/lotes').set(bearer(token()));
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('UNAUTHORIZED');
        expect(findUser).not.toHaveBeenCalled();
        expect(list).not.toHaveBeenCalled();
    });

    test.each([{ sub: 7 }, { sub: '7' }, { id: 7 }])('valid HS256 token identifies %j; database supplies role', async (subject) => {
        const res = await request(app).get('/api/lotes').set(bearer(signTestToken({ ...subject, role: 'ADMINISTRADOR', exp: future() })));
        expect(res.status).toBe(200);
        expect(findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }));
        expect(list).toHaveBeenCalledTimes(1);
    });
});
