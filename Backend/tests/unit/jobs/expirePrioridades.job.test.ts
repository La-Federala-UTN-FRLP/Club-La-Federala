// Expiración automática de Prioridades (jobs, service y endpoint reales; Prisma mockeado).
//
// Decisión de producto D3: las Prioridades expiran solas al llegar fechaFin, con todo su
// lifecycle (prioridad → EXPIRADA y, si el lote sigue CON_PRIORIDAD, restaurarlo).
//
// Una sola operación de dominio, expirePrioridadesVencidas, la usan:
// - el job programado (runExpirations → expirePrioridades);
// - el endpoint manual POST /api/prioridades/jobs/expire.
// Cada prioridad se expira en su propia transacción (prioridad + lote juntos) y con un update
// condicionado a que siga ACTIVA y vencida: no pisa un cancel/finalize ni una corrida previa.
// La restauración del lote es un único UPDATE condicionado a CON_PRIORIDAD (sin leer antes); el mock
// del lote emula ese WHERE sobre un estado "persistido".
jest.mock('../../../src/config/loadEnv', () => ({
    loadLocalEnv: jest.fn(),
}));

jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        promocion: { findMany: jest.fn() },
        reserva: { findMany: jest.fn() },
        prioridad: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        lote: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        $transaction: jest.fn(),
        $disconnect: jest.fn(async () => undefined),
    },
}));

import request from 'supertest';
import app from '../../../src/app';
import prismaReal from '../../../src/config/prisma';
import { runExpirations } from '../../../src/jobs/runExpirations';
import { expirePrioridadesVencidas } from '../../../src/services/prioridad.service';
import { authHeader, useTestWebEnv } from '../../support/http';

type Mock = jest.Mock;
type Delegates = {
    prioridad: { findMany: Mock; update: Mock; updateMany: Mock };
    lote: { findUnique: Mock; update: Mock; updateMany: Mock };
};
const prisma = prismaReal as unknown as Delegates & {
    promocion: { findMany: Mock };
    reserva: { findMany: Mock };
    $transaction: Mock;
};

useTestWebEnv();

const PRIORIDAD_ID = 31;
const LOTE_ID = 12;
const NOW = new Date('2026-06-01T12:00:00Z');

/** Estado "persistido" de cada lote: el updateMany condicionado solo escribe si coincide el WHERE. */
let lotes: Record<number, string>;

function loteUpdateManyConEstado() {
    return jest.fn(async ({ where, data }: { where: { id: number; estado?: string }; data: { estado: string } }) => {
        if (where.estado !== undefined && lotes[where.id] !== where.estado) return { count: 0 };
        lotes[where.id] = data.estado;
        return { count: 1 };
    });
}

// tx = el mismo cliente (las escrituras quedan registradas en los delegates raíz).
function txConElMismoCliente() {
    prisma.$transaction.mockImplementation((arg: unknown) =>
        typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
    );
}

function candidata(id: number, loteId: number, loteEstadoAlCrear: 'DISPONIBLE' | 'EN_PROMOCION' = 'DISPONIBLE') {
    return { id, loteId, loteEstadoAlCrear };
}

/** Prioridad ACTIVA con fechaFin vencida; el lote sigue CON_PRIORIDAD. */
function stubPrioridadVencida(loteEstadoAlCrear: 'DISPONIBLE' | 'EN_PROMOCION' = 'DISPONIBLE') {
    prisma.prioridad.findMany.mockResolvedValue([candidata(PRIORIDAD_ID, LOTE_ID, loteEstadoAlCrear)]);
    prisma.prioridad.updateMany.mockResolvedValue({ count: 1 });
    lotes[LOTE_ID] = 'CON_PRIORIDAD';
}

/** La prioridad quedó EXPIRADA, por update o updateMany (directo o dentro de una transacción). */
function prioridadMarcadaExpirada(db: Delegates = prisma): boolean {
    const llamadas = [...db.prioridad.update.mock.calls, ...db.prioridad.updateMany.mock.calls];
    return llamadas.some(([args]) => args?.data?.estado === 'EXPIRADA');
}

/** El lote se restauró con un UPDATE condicionado a CON_PRIORIDAD (sin lectura previa). */
function expectLoteRestaurado(estado: 'DISPONIBLE' | 'EN_PROMOCION', db: Delegates = prisma, loteId = LOTE_ID) {
    expect(db.lote.updateMany).toHaveBeenCalledWith({ where: { id: loteId, estado: 'CON_PRIORIDAD' }, data: { estado } });
    expect(lotes[loteId]).toBe(estado);
    expect(db.lote.findUnique).not.toHaveBeenCalled();
    expect(db.lote.update).not.toHaveBeenCalled();
}

let consoleError: jest.SpyInstance;
beforeEach(() => {
    jest.clearAllMocks();
    lotes = {};
    txConElMismoCliente();
    prisma.lote.updateMany.mockImplementation(loteUpdateManyConEstado());
    prisma.promocion.findMany.mockResolvedValue([]);
    prisma.reserva.findMany.mockResolvedValue([]);
    prisma.prioridad.findMany.mockResolvedValue([]);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('runExpirations — prioridad ACTIVA con fechaFin vencida', () => {
    test('la busca, la marca EXPIRADA y restaura el lote CON_PRIORIDAD', async () => {
        stubPrioridadVencida();

        await runExpirations();

        expect(prisma.prioridad.findMany).toHaveBeenCalled();
        expect(prioridadMarcadaExpirada()).toBe(true);
        expectLoteRestaurado('DISPONIBLE');
    });
});

describe('expirePrioridadesVencidas — lifecycle', () => {
    test.each([
        ['DISPONIBLE', 'DISPONIBLE'],
        ['EN_PROMOCION', 'EN_PROMOCION'],
    ] as const)('lote creado %s → prioridad EXPIRADA y lote restaurado a %s', async (alCrear, restaurado) => {
        stubPrioridadVencida(alCrear);

        const result = await expirePrioridadesVencidas(NOW);

        expect(result).toEqual({ expired: 1 });
        expect(prioridadMarcadaExpirada()).toBe(true);
        expectLoteRestaurado(restaurado);
    });

    test('si el lote ya no está CON_PRIORIDAD, expira la prioridad sin cambiar el lote', async () => {
        stubPrioridadVencida();
        lotes[LOTE_ID] = 'RESERVADO';

        await expirePrioridadesVencidas(NOW);

        expect(prioridadMarcadaExpirada()).toBe(true);
        expect(lotes[LOTE_ID]).toBe('RESERVADO');
    });

    test('busca solo ACTIVA con fechaFin anterior a now', async () => {
        await expirePrioridadesVencidas(NOW);

        expect(prisma.prioridad.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { estado: 'ACTIVA', fechaFin: { lt: NOW } } }),
        );
    });
});

describe('expirePrioridadesVencidas — concurrencia e idempotencia', () => {
    test('el update repite la condición: id + ACTIVA + vencida', async () => {
        stubPrioridadVencida();

        await expirePrioridadesVencidas(NOW);

        expect(prisma.prioridad.updateMany).toHaveBeenCalledWith({
            where: { id: PRIORIDAD_ID, estado: 'ACTIVA', fechaFin: { lt: NOW } },
            data: { estado: 'EXPIRADA' },
        });
        expect(prisma.prioridad.update).not.toHaveBeenCalled();
    });

    // La candidata se leyó ACTIVA, pero antes del update otro request la canceló o finalizó
    // (o una corrida anterior ya la expiró): el update condicionado no afecta filas.
    test('si ya no está ACTIVA (cancel/finalize/corrida previa) no pisa nada ni toca el lote', async () => {
        stubPrioridadVencida();
        prisma.prioridad.updateMany.mockResolvedValue({ count: 0 });

        const result = await expirePrioridadesVencidas(NOW);

        expect(result).toEqual({ expired: 0 });
        expect(prisma.lote.updateMany).not.toHaveBeenCalled();
        expect(lotes[LOTE_ID]).toBe('CON_PRIORIDAD');
    });

    test('dos corridas seguidas: la segunda no vuelve a expirar ni a restaurar el lote', async () => {
        stubPrioridadVencida();
        prisma.prioridad.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

        const primera = await expirePrioridadesVencidas(NOW);
        const segunda = await expirePrioridadesVencidas(NOW);

        expect(primera).toEqual({ expired: 1 });
        expect(segunda).toEqual({ expired: 0 });
        expect(prisma.lote.updateMany).toHaveBeenCalledTimes(1);
    });
});

describe('expirePrioridadesVencidas — atomicidad', () => {
    // tx distinto del cliente raíz: prueba que prioridad y lote se escriben dentro de la transacción.
    function txSeparado() {
        const tx: Delegates = {
            prioridad: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
            lote: { findUnique: jest.fn(), update: jest.fn(), updateMany: loteUpdateManyConEstado() },
        };
        lotes[LOTE_ID] = 'CON_PRIORIDAD';
        prisma.$transaction.mockImplementation((fn: (t: Delegates) => unknown) => fn(tx));
        return tx;
    }

    test('prioridad y lote se escriben con el cliente de la transacción, no con el raíz', async () => {
        prisma.prioridad.findMany.mockResolvedValue([candidata(PRIORIDAD_ID, LOTE_ID)]);
        const tx = txSeparado();

        const result = await expirePrioridadesVencidas(NOW);

        expect(result).toEqual({ expired: 1 });
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prioridadMarcadaExpirada(tx)).toBe(true);
        expectLoteRestaurado('DISPONIBLE', tx);
        expect(prisma.prioridad.updateMany).not.toHaveBeenCalled();
        expect(prisma.prioridad.update).not.toHaveBeenCalled();
        expect(prisma.lote.updateMany).not.toHaveBeenCalled();
    });

    test('si falla la restauración del lote, la prioridad no cuenta como expirada y se loguea', async () => {
        prisma.prioridad.findMany.mockResolvedValue([candidata(PRIORIDAD_ID, LOTE_ID)]);
        const tx = txSeparado();
        tx.lote.updateMany.mockRejectedValue(new Error('lote update falló'));

        const result = await expirePrioridadesVencidas(NOW);

        // La transacción rechaza (Prisma revierte el update de la prioridad).
        expect(result).toEqual({ expired: 0 });
        expect(consoleError).toHaveBeenCalledWith(
            expect.stringContaining(String(PRIORIDAD_ID)),
            expect.objectContaining({ name: 'Error', message: 'lote update falló' }),
        );
    });

    test('una prioridad que falla no frena a las demás', async () => {
        prisma.prioridad.findMany.mockResolvedValue([candidata(1, 101), candidata(2, 102)]);
        prisma.$transaction
            .mockImplementationOnce(async () => { throw new Error('tx 1 falló'); })
            .mockImplementationOnce((fn: (t: unknown) => unknown) => fn(prisma));
        prisma.prioridad.updateMany.mockResolvedValue({ count: 1 });
        lotes[101] = 'CON_PRIORIDAD';
        lotes[102] = 'CON_PRIORIDAD';

        const result = await expirePrioridadesVencidas(NOW);

        expect(result).toEqual({ expired: 1 });
        expect(lotes[101]).toBe('CON_PRIORIDAD');
        expectLoteRestaurado('DISPONIBLE', prisma, 102);
    });
});

describe('POST /api/prioridades/jobs/expire — misma operación que el job', () => {
    test('ADMINISTRADOR ejecuta la expiración y recibe la cantidad', async () => {
        stubPrioridadVencida();

        const res = await request(app).post('/api/prioridades/jobs/expire').set(authHeader('ADMINISTRADOR'));

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, message: 'Se expiraron 1 prioridades', data: { expired: 1 } });
        expect(prisma.prioridad.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ id: PRIORIDAD_ID, estado: 'ACTIVA' }) }),
        );
        expectLoteRestaurado('DISPONIBLE');
    });

    test('INMOBILIARIA no puede dispararla (403, sin tocar datos)', async () => {
        const res = await request(app).post('/api/prioridades/jobs/expire').set(authHeader('INMOBILIARIA', 7));

        expect(res.status).toBe(403);
        expect(prisma.prioridad.findMany).not.toHaveBeenCalled();
    });
});
