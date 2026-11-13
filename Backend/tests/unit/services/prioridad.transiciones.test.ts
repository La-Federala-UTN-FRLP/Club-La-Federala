// Transiciones de cierre de Prioridades: cancelar, finalizar y expirar (services reales, Prisma mockeado).
//
// Las tres escriben condicionadas a que la prioridad siga ACTIVA en el momento del update
// (updateMany WHERE id AND estado = ACTIVA) y restauran el lote en la misma transacción solo si
// ganaron. Así, dos transiciones concurrentes no se pisan: la que llega segunda afecta 0 filas, no
// cambia el estado ni vuelve a tocar el lote.
//
// La concurrencia se modela de forma determinista con el resultado del update condicionado
// (count 1 = ganó, count 0 = otra transición ya cerró la prioridad); sin sleeps ni timers.
// El lote se restaura con un único UPDATE condicionado a CON_PRIORIDAD (sin leer antes); el mock lo
// emula sobre un estado "persistido". Las carreras contra una base real (índice único parcial,
// alta vs cierre): tests/integration/prioridades.concurrencia.int.test.ts.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        prioridad: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        lote: { updateMany: jest.fn() },
        $transaction: jest.fn(),
    },
}));

import prismaReal from '../../../src/config/prisma';
import { cancelPrioridad, finalizePrioridad, expirePrioridadesVencidas } from '../../../src/services/prioridad.service';

type Mock = jest.Mock;
const prisma = prismaReal as unknown as {
    prioridad: { findUnique: Mock; findMany: Mock; update: Mock; updateMany: Mock };
    lote: { updateMany: Mock };
    $transaction: Mock;
};

const ID = 40;
const LOTE_ID = 12;
const ADMIN = { role: 'ADMINISTRADOR' };
const NOW = new Date('2026-06-01T12:00:00Z');
const ACTIVA = { id: ID, estado: 'ACTIVA', loteId: LOTE_ID, loteEstadoAlCrear: 'DISPONIBLE', ownerType: 'CCLF', inmobiliariaId: null };

/** Estado "persistido" de la prioridad: el update condicionado solo gana si sigue ACTIVA. */
let estadoPersistido: string;
let loteEstado: string;

beforeEach(() => {
    jest.clearAllMocks();
    estadoPersistido = 'ACTIVA';
    loteEstado = 'CON_PRIORIDAD';

    // tx = el mismo cliente: las escrituras dentro de la transacción quedan en estos mocks.
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    // Lectura previa (fuera de la transacción): la prioridad se leyó ACTIVA.
    prisma.prioridad.findUnique.mockImplementation(async ({ select }: { select?: unknown }) =>
        select ? ACTIVA : { ...ACTIVA, estado: estadoPersistido },
    );
    prisma.prioridad.findMany.mockResolvedValue([{ id: ID, loteId: LOTE_ID, loteEstadoAlCrear: 'DISPONIBLE' }]);
    // Update condicionado: emula WHERE estado = ACTIVA sobre el estado persistido.
    prisma.prioridad.updateMany.mockImplementation(async ({ where, data }: { where: { estado: string }; data: { estado: string } }) => {
        if (estadoPersistido !== where.estado) return { count: 0 };
        estadoPersistido = data.estado;
        return { count: 1 };
    });
    // UPDATE lote … WHERE estado = CON_PRIORIDAD sobre el estado persistido.
    prisma.lote.updateMany.mockImplementation(async ({ where, data }: { where: { estado: string }; data: { estado: string } }) => {
        if (loteEstado !== where.estado) return { count: 0 };
        loteEstado = data.estado;
        return { count: 1 };
    });
});

const OPERACIONES = [
    ['cancelar', () => cancelPrioridad(ID, ADMIN), 'CANCELADA', /Solo se pueden cancelar prioridades ACTIVA/],
    ['finalizar', () => finalizePrioridad(ID, ADMIN), 'FINALIZADA', /Solo se pueden finalizar prioridades ACTIVA/],
] as const;

describe.each(OPERACIONES)('%s', (_nombre, ejecutar, estadoFinal, motivo) => {
    test('escribe condicionado a ACTIVA y restaura el lote en la misma transacción', async () => {
        const result = await ejecutar();

        expect(prisma.prioridad.updateMany).toHaveBeenCalledWith({ where: { id: ID, estado: 'ACTIVA' }, data: { estado: estadoFinal } });
        expect(prisma.prioridad.update).not.toHaveBeenCalled();
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.lote.updateMany).toHaveBeenCalledWith({ where: { id: LOTE_ID, estado: 'CON_PRIORIDAD' }, data: { estado: 'DISPONIBLE' } });
        expect(loteEstado).toBe('DISPONIBLE');
        expect(result).toEqual(expect.objectContaining({ id: ID, estado: estadoFinal }));
    });

    test('expire gana la carrera: no pisa EXPIRADA ni vuelve a tocar el lote (400)', async () => {
        // T1 ya leyó ACTIVA; T2 (job) expira y restaura el lote antes de que T1 escriba.
        await expirePrioridadesVencidas(NOW);
        expect(estadoPersistido).toBe('EXPIRADA');
        expect(prisma.lote.updateMany).toHaveBeenCalledTimes(1);

        await expect(ejecutar()).rejects.toMatchObject({ status: 400, message: expect.stringMatching(motivo) });

        expect(estadoPersistido).toBe('EXPIRADA');
        expect(prisma.lote.updateMany).toHaveBeenCalledTimes(1); // sin segunda restauración
    });

    test(`${_nombre} gana la carrera: el job después no la expira ni restaura de nuevo`, async () => {
        await ejecutar();
        expect(estadoPersistido).toBe(estadoFinal);

        const { expired } = await expirePrioridadesVencidas(NOW);

        expect(expired).toBe(0);
        expect(estadoPersistido).toBe(estadoFinal);
        expect(prisma.lote.updateMany).toHaveBeenCalledTimes(1);
    });

    test('dos veces seguidas: la segunda pierde (400) sin doble restauración', async () => {
        await ejecutar();

        await expect(ejecutar()).rejects.toMatchObject({ status: 400 });

        expect(estadoPersistido).toBe(estadoFinal);
        expect(prisma.lote.updateMany).toHaveBeenCalledTimes(1);
    });

    test('si el lote ya no está CON_PRIORIDAD, cierra la prioridad sin cambiar el lote', async () => {
        loteEstado = 'RESERVADO';

        await ejecutar();

        expect(estadoPersistido).toBe(estadoFinal);
        expect(loteEstado).toBe('RESERVADO');
    });
});

test('cancelar y finalizar compiten: gana la primera, la segunda no pisa ni restaura', async () => {
    await cancelPrioridad(ID, ADMIN);

    await expect(finalizePrioridad(ID, ADMIN)).rejects.toMatchObject({ status: 400 });

    expect(estadoPersistido).toBe('CANCELADA');
    expect(prisma.lote.updateMany).toHaveBeenCalledTimes(1);
});
