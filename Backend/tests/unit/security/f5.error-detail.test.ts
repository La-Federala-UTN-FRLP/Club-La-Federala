// Detalle técnico que no debe salir crudo (auditoría adversarial, F5).
//
// 1) P2003 en el handler global: `meta.field_name` trae el nombre interno de la constraint o del
//    índice (p. ej. "Reserva_loteId_fkey (index)"). La respuesta 409 CONFLICT_FK ya no incluye `field`
//    (ningún consumidor lo usaba); el detalle estructural va solo al log saneado.
// 2) purgeFileById: un error de Supabase al borrar el objeto se loguea con safeErrorForLog (sin el
//    objeto crudo; tokens y credenciales redactados) y no llega al cliente.
jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(),
}));

jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        archivos: { findUnique: jest.fn(), delete: jest.fn() },
    },
}));

import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import prismaReal from '../../../src/config/prisma';
import { Prisma } from '../../../src/generated/prisma';
import { handleError } from '../../../src/middlewares/error.middleware';
import { purgeFileById } from '../../../src/services/file.service';
import { useTestWebEnv } from '../../support/http';

const prisma = prismaReal as unknown as { archivos: { findUnique: jest.Mock; delete: jest.Mock } };

useTestWebEnv();

let consoleWarn: jest.SpyInstance;
beforeEach(() => {
    jest.clearAllMocks();
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => consoleWarn.mockRestore());

describe('P2003 en el handler global', () => {
    function appQueLanza(err: Error) {
        const app = express();
        app.get('/boom', (_req: Request, _res: Response, next: NextFunction) => next(err));
        app.use(handleError);
        return app;
    }

    const fk = new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated on the constraint: `Reserva_loteId_fkey`', {
        code: 'P2003',
        clientVersion: 'test',
        meta: { field_name: 'Reserva_loteId_fkey (index)' },
    });

    test('409 CONFLICT_FK sin `field` ni nombres internos', async () => {
        const res = await request(appQueLanza(fk)).get('/boom');

        expect(res.status).toBe(409);
        expect(res.body).toEqual({ success: false, code: 'CONFLICT_FK', message: 'Clave foránea inválida.' });
        expect(JSON.stringify(res.body)).not.toMatch(/fkey|Reserva_|field/);
    });

    test('el detalle estructural queda en el log saneado (sin el mensaje crudo de Prisma)', async () => {
        await request(appQueLanza(fk)).get('/boom');

        expect(consoleWarn).toHaveBeenCalledTimes(1);
        const [, logged] = consoleWarn.mock.calls[0];
        expect(logged).toEqual(expect.objectContaining({ code: 'P2003', meta: { field_name: 'Reserva_loteId_fkey (index)' } }));
        expect(logged).not.toHaveProperty('message');
        expect(logged).not.toBeInstanceOf(Error);
    });
});

describe('purgeFileById — error de Supabase al borrar el objeto', () => {
    const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZXJ2aWNlIn0.c2lnbmF0dXJh';

    function stubSupabaseRemove(error: unknown) {
        const remove = jest.fn().mockResolvedValue({ data: null, error });
        (createClient as jest.Mock).mockReturnValue({ storage: { from: jest.fn(() => ({ remove })) } });
    }

    test('se loguea saneado, sin el objeto crudo ni el token, y el borrado de la DB sigue', async () => {
        const storageError = Object.assign(new Error(`Unauthorized: invalid token ${JWT} for venta-1/boleto.pdf`), { name: 'StorageApiError' });
        stubSupabaseRemove(storageError);
        prisma.archivos.findUnique.mockResolvedValue({ id: 7, linkArchivo: 'venta-1/boleto.pdf' });
        prisma.archivos.delete.mockResolvedValue({ id: 7 });

        await expect(purgeFileById(7)).resolves.toBeUndefined();

        expect(prisma.archivos.delete).toHaveBeenCalledWith({ where: { id: 7 } });
        expect(consoleWarn).toHaveBeenCalledTimes(1);
        const args = consoleWarn.mock.calls[0];
        expect(args).not.toContain(storageError);
        const logged = JSON.stringify(args);
        expect(logged).not.toContain(JWT);
        expect(logged).toContain('***jwt***');
    });
});
