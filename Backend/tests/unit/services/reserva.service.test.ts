jest.mock('../../../src/config/prisma', () =>
    require('../../support/mocks/prisma').reservaPrismaMock,
);

jest.mock('../../../src/services/lote.service', () => ({
    updateLoteState: jest.fn(),
}));

jest.mock('../../../src/domain/loteState/loteState.rules', () => ({
    assertLoteOperableFor: jest.fn(),
    assertReservaUnicaVigente: jest.fn(),
    computeRestoreStateFromReserva: jest.fn(),
}));

jest.mock('../../../src/domain/loteState/loteState.effects', () => ({
    cancelPrioridadActivaOnReserva: jest.fn(),
}));

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import {
    createOfertaReserva,
    createReserva,
    deleteReserva,
    eliminarReserva,
    getAllReservas,
    getOfertasByReservaId,
    getReservaByEstado,
    getReservaById,
    getReservaByImmobiliariaId,
    reactivarReserva,
    updateReserva,
} from '../../../src/services/reserva.service';
import { updateLoteState } from '../../../src/services/lote.service';
import {
    assertLoteOperableFor,
    assertReservaUnicaVigente,
    computeRestoreStateFromReserva,
} from '../../../src/domain/loteState/loteState.rules';
import { cancelPrioridadActivaOnReserva } from '../../../src/domain/loteState/loteState.effects';
import { ESTADO_LOTE_OP } from '../../../src/domain/loteState/loteState.types';
import {
    reservaPrismaMock as prismaMock,
    reservaTxMock as txMock,
    resetPrismaMock,
} from '../../support/mocks/prisma';

const updateLote = updateLoteState as jest.Mock;
const assertOperable = assertLoteOperableFor as jest.Mock;
const assertUnica = assertReservaUnicaVigente as jest.Mock;
const computeRestore = computeRestoreStateFromReserva as jest.Mock;
const cancelPrioridad = cancelPrioridadActivaOnReserva as jest.Mock;

const FECHA = '2026-03-01T18:00:00.000Z';
const FECHA_FIN = '2026-03-10T18:00:00.000Z';

afterEach(() => {
    resetPrismaMock(prismaMock);
    resetPrismaMock(txMock);
    updateLote.mockReset();
    assertOperable.mockReset();
    assertUnica.mockReset();
    computeRestore.mockReset();
    cancelPrioridad.mockReset();
});

function buildUser(
    role: string,
    inmobiliariaId: number | null | undefined = undefined,
) {
    return { role, inmobiliariaId };
}

function buildLote(overrides: Record<string, unknown> = {}) {
    return { id: 3, estado: 'DISPONIBLE', ...overrides };
}

function buildCliente(overrides: Record<string, unknown> = {}) {
    return { id: 15, estadoOperativo: 'OPERATIVO', nombre: 'Juan', ...overrides };
}

function buildPrioridad(overrides: Record<string, unknown> = {}) {
    return {
        id: 8,
        loteId: 3,
        estado: 'ACTIVA',
        ownerType: 'INMOBILIARIA',
        inmobiliariaId: 5,
        inmobiliaria: { id: 5, nombre: 'Norte' },
        ...overrides,
    };
}

function buildReservaRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        loteId: 3,
        clienteId: 15,
        inmobiliariaId: 5,
        estado: 'ACTIVA',
        estadoOperativo: 'OPERATIVO',
        ventaId: null,
        loteEstadoAlCrear: 'DISPONIBLE',
        sena: 10000,
        numero: 'RES-001',
        ofertaInicial: 100000,
        ofertaActual: 100000,
        ...overrides,
    };
}

function buildCreateBody(overrides: Record<string, unknown> = {}) {
    return {
        fechaReserva: FECHA,
        loteId: 3,
        clienteId: 15,
        inmobiliariaId: 5 as number | null | undefined,
        sena: 10000 as number | undefined,
        numero: 'RES-001',
        fechaFinReserva: FECHA_FIN,
        ofertaInicial: 100000,
        ...overrides,
    };
}

function prismaError(code: string, meta?: Record<string, unknown>) {
    return new PrismaClientKnownRequestError('prisma error', {
        code,
        clientVersion: '6.18.0',
        meta,
    });
}

async function expectStatus(
    fn: () => Promise<unknown>,
    status: number,
    key: 'status' | 'statusCode' = 'status',
) {
    let thrown: unknown;
    try {
        await fn();
    } catch (error) {
        thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(thrown).toEqual(expect.objectContaining({ [key]: status }));
}

function stubCreateHappyPath(created: Record<string, unknown> = {}) {
    prismaMock.lote.findUnique.mockResolvedValue(buildLote());
    prismaMock.persona.findUnique.mockResolvedValue(buildCliente());
    assertUnica.mockResolvedValue(undefined);
    const reserva = buildReservaRow({
        inmobiliaria: { id: 5, nombre: 'Norte' },
        ...created,
    });
    txMock.reserva.create.mockResolvedValue(reserva);
    txMock.ofertaReserva.create.mockResolvedValue({ id: 90 });
    updateLote.mockResolvedValue({});
    return reserva;
}

function listWhere() {
    return prismaMock.reserva.findMany.mock.calls[0][0].where;
}

describe('getAllReservas', () => {
    test('sin filtro explícito usa estadoOperativo OPERATIVO y total = length', async () => {
        const rows = [buildReservaRow(), buildReservaRow({ id: 2 })];
        prismaMock.reserva.findMany.mockResolvedValue(rows);

        const result = await getAllReservas(undefined, buildUser('ADMINISTRADOR'));

        expect(result).toEqual({ reservas: rows, total: 2 });
        expect(listWhere()).toEqual({ estadoOperativo: 'OPERATIVO' });
    });

    test('respeta filtro explícito de estadoOperativo', async () => {
        prismaMock.reserva.findMany.mockResolvedValue([]);
        await getAllReservas({ estadoOperativo: 'ELIMINADO' }, buildUser('GESTOR'));
        expect(listWhere()).toEqual({ estadoOperativo: 'ELIMINADO' });
    });

    test('INMOBILIARIA aísla por inmobiliariaId (tenant isolation)', async () => {
        prismaMock.reserva.findMany.mockResolvedValue([]);
        await getAllReservas(undefined, buildUser('INMOBILIARIA', 5));
        expect(listWhere()).toEqual({
            inmobiliariaId: 5,
            estadoOperativo: 'OPERATIVO',
        });
    });

    test('ADMIN y GESTOR no reciben filtro de inmobiliaria', async () => {
        prismaMock.reserva.findMany.mockResolvedValue([]);
        await getAllReservas(undefined, buildUser('ADMINISTRADOR'));
        expect(listWhere().inmobiliariaId).toBeUndefined();
        await getAllReservas(undefined, buildUser('GESTOR'));
        expect(prismaMock.reserva.findMany.mock.calls[1][0].where.inmobiliariaId).toBeUndefined();
    });

    test('INMOBILIARIA sin inmobiliariaId no aísla (hueco de implementación)', async () => {
        prismaMock.reserva.findMany.mockResolvedValue([]);
        await getAllReservas(undefined, buildUser('INMOBILIARIA', null));
        expect(listWhere()).toEqual({ estadoOperativo: 'OPERATIVO' });
        expect(listWhere().inmobiliariaId).toBeUndefined();
    });
});

describe('getReservaById — RBAC', () => {
    test('ADMINISTRADOR puede ver', async () => {
        const row = buildReservaRow();
        prismaMock.reserva.findUnique.mockResolvedValue(row);
        await expect(getReservaById(1, buildUser('ADMINISTRADOR'))).resolves.toEqual(row);
    });

    test('GESTOR puede ver', async () => {
        const row = buildReservaRow();
        prismaMock.reserva.findUnique.mockResolvedValue(row);
        await expect(getReservaById(1, buildUser('GESTOR'))).resolves.toEqual(row);
    });

    test('INMOBILIARIA propia puede ver', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ inmobiliariaId: 5 }));
        await expect(getReservaById(1, buildUser('INMOBILIARIA', 5))).resolves.toEqual(
            expect.objectContaining({ id: 1 }),
        );
    });

    test('INMOBILIARIA ajena recibe 403', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ inmobiliariaId: 5 }));
        await expect(getReservaById(1, buildUser('INMOBILIARIA', 9))).rejects.toThrow(
            /no puedes ver esta reserva/i,
        );
        await expectStatus(() => getReservaById(1, buildUser('INMOBILIARIA', 9)), 403);
    });

    test('TECNICO recibe 403', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow());
        await expectStatus(() => getReservaById(1, buildUser('TECNICO')), 403);
    });

    test('user undefined queda bloqueado con 403', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow());
        await expect(getReservaById(1)).rejects.toThrow(/no tienes permisos/i);
        await expectStatus(() => getReservaById(1), 403);
    });

    test('inexistente lanza 404', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(null);
        await expectStatus(() => getReservaById(999, buildUser('ADMINISTRADOR')), 404);
    });
});

describe('getReservaByImmobiliariaId', () => {
    test('devuelve el listado filtrado por inmobiliariaId', async () => {
        const rows = [buildReservaRow()];
        prismaMock.reserva.findMany.mockResolvedValue(rows);
        await expect(getReservaByImmobiliariaId(5)).resolves.toEqual(rows);
        expect(prismaMock.reserva.findMany).toHaveBeenCalledWith({
            where: { inmobiliariaId: 5 },
        });
    });

    test('lista vacía [] es truthy: no dispara 404 (contrato actual)', async () => {
        prismaMock.reserva.findMany.mockResolvedValue([]);
        await expect(getReservaByImmobiliariaId(999)).resolves.toEqual([]);
    });
});

describe('getReservaByEstado', () => {
    test('devuelve reservas del estado pedido', async () => {
        const rows = [buildReservaRow({ estado: 'ACTIVA' })];
        prismaMock.reserva.findMany.mockResolvedValue(rows);
        await expect(getReservaByEstado('ACTIVA')).resolves.toEqual(rows);
        expect(prismaMock.reserva.findMany).toHaveBeenCalledWith({ where: { estado: 'ACTIVA' } });
    });

    test('lista vacía lanza 404', async () => {
        prismaMock.reserva.findMany.mockResolvedValue([]);
        await expectStatus(() => getReservaByEstado('EXPIRADA'), 404);
    });
});

describe('createReserva — lote y unicidad', () => {
    test('lote inexistente lanza Error genérico (sin status HTTP)', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(null);
        await expect(createReserva(buildCreateBody(), buildUser('ADMINISTRADOR'))).rejects.toThrow(
            'Lote no encontrado.',
        );
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    test('assertLoteOperableFor rechaza NO_DISPONIBLE y no crea', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(buildLote({ estado: 'NO_DISPONIBLE' }));
        const err: Error & { status?: number } = new Error('No se puede crear reserva');
        err.status = 400;
        assertOperable.mockImplementation(() => {
            throw err;
        });

        await expectStatus(
            () => createReserva(buildCreateBody(), buildUser('ADMINISTRADOR')),
            400,
        );
        expect(assertOperable).toHaveBeenCalledWith('crear reserva', 'NO_DISPONIBLE');
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    test.each(['DISPONIBLE', 'EN_PROMOCION'])(
        'lote %s está permitido para reservar',
        async (estado) => {
            prismaMock.lote.findUnique.mockResolvedValue(buildLote({ estado }));
            prismaMock.persona.findUnique.mockResolvedValue(buildCliente());
            assertUnica.mockResolvedValue(undefined);
            txMock.reserva.create.mockResolvedValue(
                buildReservaRow({ inmobiliaria: { id: 5, nombre: 'Norte' } }),
            );
            txMock.ofertaReserva.create.mockResolvedValue({ id: 1 });

            await createReserva(buildCreateBody(), buildUser('ADMINISTRADOR'));
            expect(prismaMock.$transaction).toHaveBeenCalled();
        },
    );

    test('otro estado (RESERVADO) rechaza antes de transaccionar', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(buildLote({ estado: 'RESERVADO' }));
        await expect(
            createReserva(buildCreateBody(), buildUser('ADMINISTRADOR')),
        ).rejects.toThrow(/no está disponible para reservar/i);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    test('assertReservaUnicaVigente se llama y si rechaza no hay transaction', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(buildLote());
        const err: Error & { status?: number } = new Error('Ya existe una reserva vigente');
        err.status = 409;
        assertUnica.mockRejectedValue(err);

        await expectStatus(
            () => createReserva(buildCreateBody(), buildUser('ADMINISTRADOR')),
            409,
        );
        expect(assertUnica).toHaveBeenCalledWith(3);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
});

describe('createReserva — prioridad CCLF', () => {
    function stubConPrioridadCclf() {
        prismaMock.lote.findUnique.mockResolvedValue(buildLote({ estado: 'CON_PRIORIDAD' }));
        assertUnica.mockResolvedValue(undefined);
        prismaMock.prioridad.findFirst.mockResolvedValue(
            buildPrioridad({ ownerType: 'CCLF', inmobiliariaId: null, inmobiliaria: null }),
        );
    }

    test.each(['ADMINISTRADOR', 'GESTOR'])(
        '%s puede reservar prioridad CCLF',
        async (role) => {
            stubConPrioridadCclf();
            prismaMock.persona.findUnique.mockResolvedValue(buildCliente());
            txMock.reserva.create.mockResolvedValue(
                buildReservaRow({ inmobiliariaId: null, inmobiliaria: null }),
            );
            txMock.ofertaReserva.create.mockResolvedValue({ id: 1 });

            await createReserva(buildCreateBody({ inmobiliariaId: null }), buildUser(role));
            expect(prismaMock.$transaction).toHaveBeenCalled();
        },
    );

    test('INMOBILIARIA no puede reservar prioridad CCLF (403)', async () => {
        stubConPrioridadCclf();
        await expectStatus(
            () => createReserva(buildCreateBody(), buildUser('INMOBILIARIA', 5)),
            403,
        );
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    test('sin prioridad activa lanza 409', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(buildLote({ estado: 'CON_PRIORIDAD' }));
        assertUnica.mockResolvedValue(undefined);
        prismaMock.prioridad.findFirst.mockResolvedValue(null);
        await expectStatus(
            () => createReserva(buildCreateBody(), buildUser('ADMINISTRADOR')),
            409,
        );
    });
});

describe('createReserva — prioridad INMOBILIARIA', () => {
    function stubPrioridadInmo() {
        prismaMock.lote.findUnique.mockResolvedValue(buildLote({ estado: 'CON_PRIORIDAD' }));
        assertUnica.mockResolvedValue(undefined);
        prismaMock.prioridad.findFirst.mockResolvedValue(buildPrioridad());
    }

    test('INMOBILIARIA dueña puede crear', async () => {
        stubPrioridadInmo();
        prismaMock.persona.findUnique.mockResolvedValue(buildCliente());
        txMock.reserva.create.mockResolvedValue(
            buildReservaRow({ inmobiliaria: { id: 5, nombre: 'Norte' } }),
        );
        txMock.ofertaReserva.create.mockResolvedValue({ id: 1 });

        await createReserva(buildCreateBody(), buildUser('INMOBILIARIA', 5));
        expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    test('INMOBILIARIA ajena recibe 403', async () => {
        stubPrioridadInmo();
        await expectStatus(
            () => createReserva(buildCreateBody(), buildUser('INMOBILIARIA', 9)),
            403,
        );
    });

    test('INMOBILIARIA sin inmobiliariaId lanza 400', async () => {
        stubPrioridadInmo();
        await expectStatus(
            () => createReserva(buildCreateBody(), buildUser('INMOBILIARIA', null)),
            400,
        );
    });

    test('ADMIN con body.inmobiliariaId de la dueña puede crear', async () => {
        stubPrioridadInmo();
        prismaMock.persona.findUnique.mockResolvedValue(buildCliente());
        txMock.reserva.create.mockResolvedValue(
            buildReservaRow({ inmobiliaria: { id: 5, nombre: 'Norte' } }),
        );
        txMock.ofertaReserva.create.mockResolvedValue({ id: 1 });

        await createReserva(buildCreateBody({ inmobiliariaId: 5 }), buildUser('ADMINISTRADOR'));
        expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    test('ADMIN con otra inmobiliaria en body recibe 403', async () => {
        stubPrioridadInmo();
        await expectStatus(
            () => createReserva(buildCreateBody({ inmobiliariaId: 9 }), buildUser('GESTOR')),
            403,
        );
    });

    test('TECNICO no autorizado recibe 403', async () => {
        stubPrioridadInmo();
        await expectStatus(() => createReserva(buildCreateBody(), buildUser('TECNICO')), 403);
    });
});

describe('createReserva — cliente', () => {
    test('persona inexistente lanza 404', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(buildLote());
        assertUnica.mockResolvedValue(undefined);
        prismaMock.persona.findUnique.mockResolvedValue(null);
        await expectStatus(
            () => createReserva(buildCreateBody(), buildUser('ADMINISTRADOR')),
            404,
        );
    });

    test('persona no OPERATIVA lanza 400', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(buildLote());
        assertUnica.mockResolvedValue(undefined);
        prismaMock.persona.findUnique.mockResolvedValue(buildCliente({ estadoOperativo: 'ELIMINADO' }));
        await expectStatus(
            () => createReserva(buildCreateBody(), buildUser('ADMINISTRADOR')),
            400,
        );
    });
});

describe('createReserva — transaction, oferta y side effects', () => {
    test('INMOBILIARIA sin inmobiliariaId no puede crear (Error genérico, sin status)', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(buildLote());
        prismaMock.persona.findUnique.mockResolvedValue(buildCliente());
        assertUnica.mockResolvedValue(undefined);
        await expect(
            createReserva(buildCreateBody(), buildUser('INMOBILIARIA', null)),
        ).rejects.toThrow(/no tiene una inmobiliaria asociada/i);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    test('INMOBILIARIA no puede elegir otra inmobiliaria: usa user.inmobiliariaId', async () => {
        stubCreateHappyPath();
        await createReserva(
            buildCreateBody({ inmobiliariaId: 99 }),
            buildUser('INMOBILIARIA', 5),
        );
        expect(txMock.reserva.create.mock.calls[0][0].data.inmobiliariaId).toBe(5);
    });

    test('crea Reserva y Oferta inicial en la misma transaction', async () => {
        stubCreateHappyPath();
        await createReserva(buildCreateBody(), buildUser('ADMINISTRADOR'));

        const reservaData = txMock.reserva.create.mock.calls[0][0].data;
        expect(reservaData.fechaReserva).toEqual(new Date(FECHA));
        expect(reservaData.loteId).toBe(3);
        expect(reservaData.clienteId).toBe(15);
        expect(reservaData.inmobiliariaId).toBe(5);
        expect(reservaData.ofertaInicial).toBe(100000);
        expect(reservaData.ofertaActual).toBe(100000);
        expect(reservaData.estado).toBe('ACTIVA');
        expect(reservaData.numero).toBe('RES-001');
        expect(reservaData.fechaFinReserva).toEqual(new Date(FECHA_FIN));
        expect(reservaData.loteEstadoAlCrear).toBe('DISPONIBLE');
        expect(reservaData.estadoOperativo).toBe('OPERATIVO');
        expect(reservaData.sena).toBe(10000);

        const oferta = txMock.ofertaReserva.create.mock.calls[0][0].data;
        expect(oferta.reservaId).toBe(1);
        expect(oferta.monto).toBe(100000);
        expect(oferta.motivo).toBe('Oferta Inicial');
        expect(oferta.nombreEfector).toBe('Norte');
        expect(oferta.efectorId).toBe(5);
        expect(oferta.ownerType).toBe('INMOBILIARIA');
        expect(oferta.createdAt).toEqual(expect.any(Date));
    });

    test('sin inmobiliaria la oferta inicial es La Federala / CCLF y no persiste sena ausente', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(buildLote());
        prismaMock.persona.findUnique.mockResolvedValue(buildCliente());
        assertUnica.mockResolvedValue(undefined);
        txMock.reserva.create.mockResolvedValue(
            buildReservaRow({ inmobiliariaId: null, inmobiliaria: null }),
        );
        txMock.ofertaReserva.create.mockResolvedValue({ id: 1 });

        await createReserva(
            buildCreateBody({ inmobiliariaId: null, sena: undefined }),
            buildUser('ADMINISTRADOR'),
        );

        expect(txMock.reserva.create.mock.calls[0][0].data.sena).toBeUndefined();
        expect(txMock.ofertaReserva.create.mock.calls[0][0].data).toEqual(
            expect.objectContaining({
                nombreEfector: 'La Federala',
                efectorId: null,
                ownerType: 'CCLF',
            }),
        );
    });

    test('después de crear, el lote pasa a Reservado', async () => {
        stubCreateHappyPath();
        await createReserva(buildCreateBody(), buildUser('ADMINISTRADOR'));
        expect(updateLote).toHaveBeenCalledWith(3, ESTADO_LOTE_OP.RESERVADO);
        expect(cancelPrioridad).not.toHaveBeenCalled();
    });

    test('si el lote era CON_PRIORIDAD también cancela la prioridad activa', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(buildLote({ estado: 'CON_PRIORIDAD' }));
        assertUnica.mockResolvedValue(undefined);
        prismaMock.prioridad.findFirst.mockResolvedValue(
            buildPrioridad({ ownerType: 'CCLF', inmobiliariaId: null }),
        );
        prismaMock.persona.findUnique.mockResolvedValue(buildCliente());
        txMock.reserva.create.mockResolvedValue(
            buildReservaRow({ loteEstadoAlCrear: 'CON_PRIORIDAD', inmobiliaria: null }),
        );
        txMock.ofertaReserva.create.mockResolvedValue({ id: 1 });

        await createReserva(buildCreateBody({ inmobiliariaId: null }), buildUser('ADMINISTRADOR'));
        expect(cancelPrioridad).toHaveBeenCalledWith(3);
    });
});

describe('createReserva — errores Prisma', () => {
    test('P2002 sobre numero → 409 número duplicado', async () => {
        stubCreateHappyPath();
        txMock.reserva.create.mockRejectedValue(
            prismaError('P2002', { target: ['numero'] }),
        );
        await expect(createReserva(buildCreateBody(), buildUser('ADMINISTRADOR'))).rejects.toThrow(
            /ya existe una reserva con este número/i,
        );
        await expectStatus(
            () => createReserva(buildCreateBody(), buildUser('ADMINISTRADOR')),
            409,
        );
    });

    test('P2002 compuesto → 409 cliente/lote/fecha', async () => {
        stubCreateHappyPath();
        txMock.reserva.create.mockRejectedValue(prismaError('P2002', { target: ['clienteId'] }));
        await expect(createReserva(buildCreateBody(), buildUser('ADMINISTRADOR'))).rejects.toThrow(
            /cliente, lote y fecha/i,
        );
    });

    test('P2003 → 409 FK', async () => {
        stubCreateHappyPath();
        txMock.reserva.create.mockRejectedValue(prismaError('P2003'));
        await expectStatus(
            () => createReserva(buildCreateBody(), buildUser('ADMINISTRADOR')),
            409,
        );
    });
});

describe('updateReserva', () => {
    test('inexistente lanza 404', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(null);
        await expectStatus(() => updateReserva(999, { sena: 1 }, buildUser('ADMINISTRADOR')), 404);
    });

    test('reserva consumida por Venta no puede cambiar estado', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(
            buildReservaRow({ ventaId: 44, estado: 'ACEPTADA' }),
        );
        await expectStatus(
            () => updateReserva(1, { estado: 'CANCELADA' }, buildUser('ADMINISTRADOR')),
            400,
        );
        expect(prismaMock.reserva.update).not.toHaveBeenCalled();
    });

    test('reserva consumida sí puede actualizar campos que no son estado', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ ventaId: 44 }));
        prismaMock.reserva.update.mockResolvedValue(buildReservaRow({ sena: 1 }));
        await updateReserva(1, { sena: 1 }, buildUser('ADMINISTRADOR'));
        expect(prismaMock.reserva.update).toHaveBeenCalled();
    });

    test('update parcial convierte fechas a Date y no toca loteId', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow());
        prismaMock.reserva.update.mockResolvedValue(buildReservaRow());

        await updateReserva(
            1,
            { fechaReserva: FECHA, sena: 15000, fechaFinReserva: FECHA_FIN },
            buildUser('GESTOR'),
        );
        const data = prismaMock.reserva.update.mock.calls[0][0].data;
        expect(data.fechaReserva).toEqual(new Date(FECHA));
        expect(data.fechaFinReserva).toEqual(new Date(FECHA_FIN));
        expect(data.sena).toBe(15000);
        expect(data.loteId).toBeUndefined();
    });

    test('no se puede cambiar loteId ni inmobiliariaId', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ loteId: 3, inmobiliariaId: 5 }));
        await expectStatus(
            () => updateReserva(1, { loteId: 99 }, buildUser('ADMINISTRADOR')),
            400,
        );
        await expectStatus(
            () => updateReserva(1, { inmobiliariaId: 9 }, buildUser('ADMINISTRADOR')),
            400,
        );
    });

    test('INMOBILIARIA ajena no puede modificar (403)', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ inmobiliariaId: 5 }));
        await expectStatus(() => updateReserva(1, { sena: 1 }, buildUser('INMOBILIARIA', 9)), 403);
    });

    test('INMOBILIARIA propia puede cancelar ACTIVA y restaura el lote', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ estado: 'ACTIVA' }));
        prismaMock.reserva.update.mockResolvedValue(buildReservaRow({ estado: 'CANCELADA' }));
        computeRestore.mockResolvedValue('Disponible');
        await updateReserva(1, { estado: 'CANCELADA' }, buildUser('INMOBILIARIA', 5));
        expect(prismaMock.reserva.update.mock.calls[0][0].data.estado).toBe('CANCELADA');
        expect(updateLote).toHaveBeenCalledWith(3, 'Disponible');
    });

    test('INMOBILIARIA no puede cancelar una ACEPTADA (403) aunque la matriz lo permita a ADMIN', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ estado: 'ACEPTADA' }));
        await expectStatus(
            () => updateReserva(1, { estado: 'CANCELADA' }, buildUser('INMOBILIARIA', 5)),
            403,
        );
    });

    test('INMOBILIARIA propia solo cancela ACTIVA; no puede tocar fechas', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ estado: 'ACTIVA' }));
        await expectStatus(
            () => updateReserva(1, { estado: 'ACEPTADA' }, buildUser('INMOBILIARIA', 5)),
            400,
        );
        await expectStatus(
            () => updateReserva(1, { fechaReserva: FECHA, sena: 1 }, buildUser('INMOBILIARIA', 5)),
            403,
        );
    });

    test('ACTIVA → CANCELADA restaura el lote', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ estado: 'ACTIVA' }));
        prismaMock.reserva.update.mockResolvedValue(buildReservaRow({ estado: 'CANCELADA' }));
        computeRestore.mockResolvedValue('Disponible');

        await updateReserva(1, { estado: 'CANCELADA' }, buildUser('ADMINISTRADOR'));
        expect(computeRestore).toHaveBeenCalledWith('DISPONIBLE', 3);
        expect(updateLote).toHaveBeenCalledWith(3, 'Disponible');
    });

    test('ACEPTADA → RECHAZADA restaura el lote', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ estado: 'ACEPTADA' }));
        prismaMock.reserva.update.mockResolvedValue(buildReservaRow({ estado: 'RECHAZADA' }));
        computeRestore.mockResolvedValue('En Promoción');

        await updateReserva(1, { estado: 'RECHAZADA' }, buildUser('ADMINISTRADOR'));
        expect(updateLote).toHaveBeenCalledWith(3, 'En Promoción');
    });

    test('ACTIVA → EXPIRADA está bloqueada por la matriz de transiciones', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ estado: 'ACTIVA' }));
        await expectStatus(
            () => updateReserva(1, { estado: 'EXPIRADA' }, buildUser('ADMINISTRADOR')),
            400,
        );
    });

    test('CONTRAOFERTA no admite cambio manual de estado', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ estado: 'CONTRAOFERTA' }));
        await expectStatus(
            () => updateReserva(1, { estado: 'CANCELADA' }, buildUser('ADMINISTRADOR')),
            400,
        );
    });

    test('reactivar CANCELADA → ACTIVA exige lote DISPONIBLE/EN_PROMOCION y sin vigencia/prioridad', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ estado: 'CANCELADA' }));
        prismaMock.lote.findUnique.mockResolvedValue({ estado: 'DISPONIBLE' });
        prismaMock.reserva.findFirst.mockResolvedValue(null);
        prismaMock.prioridad.findFirst.mockResolvedValue(null);
        prismaMock.reserva.update.mockResolvedValue(buildReservaRow({ estado: 'ACTIVA' }));

        await updateReserva(1, { estado: 'ACTIVA' }, buildUser('ADMINISTRADOR'));
        expect(updateLote).toHaveBeenCalledWith(3, ESTADO_LOTE_OP.RESERVADO);
    });

    test('no se reactiva si hay otra reserva vigente (409)', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ estado: 'CANCELADA' }));
        prismaMock.lote.findUnique.mockResolvedValue({ estado: 'DISPONIBLE' });
        prismaMock.reserva.findFirst.mockResolvedValue({ id: 2 });
        await expectStatus(
            () => updateReserva(1, { estado: 'ACTIVA' }, buildUser('ADMINISTRADOR')),
            409,
        );
    });

    test('no se reactiva si el lote tiene prioridad activa (409)', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ estado: 'CANCELADA' }));
        prismaMock.lote.findUnique.mockResolvedValue({ estado: 'DISPONIBLE' });
        prismaMock.reserva.findFirst.mockResolvedValue(null);
        prismaMock.prioridad.findFirst.mockResolvedValue({ id: 8 });
        await expectStatus(
            () => updateReserva(1, { estado: 'ACTIVA' }, buildUser('ADMINISTRADOR')),
            409,
        );
    });

    test('P2025 en update se mapea a 404', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow());
        prismaMock.reserva.update.mockRejectedValue(prismaError('P2025'));
        await expectStatus(
            () => updateReserva(1, { sena: 2 }, buildUser('ADMINISTRADOR')),
            404,
        );
    });
});

describe('eliminarReserva (soft delete — endpoint productivo)', () => {
    test('404 si no existe', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(null);
        await expectStatus(() => eliminarReserva(9, buildUser('ADMINISTRADOR')), 404, 'statusCode');
    });

    test('INMOBILIARIA ajena recibe 403', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(
            buildReservaRow({ estado: 'CANCELADA', inmobiliariaId: 5 }),
        );
        await expectStatus(
            () => eliminarReserva(1, buildUser('INMOBILIARIA', 9)),
            403,
            'statusCode',
        );
    });

    test('ya ELIMINADA lanza 409', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(
            buildReservaRow({ estado: 'CANCELADA', estadoOperativo: 'ELIMINADO' }),
        );
        await expectStatus(
            () => eliminarReserva(1, buildUser('ADMINISTRADOR')),
            409,
            'statusCode',
        );
    });

    test('ACTIVA no se puede soft-delete (409) y no toca el lote', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ estado: 'ACTIVA' }));
        await expectStatus(
            () => eliminarReserva(1, buildUser('ADMINISTRADOR')),
            409,
            'statusCode',
        );
        expect(updateLote).not.toHaveBeenCalled();
    });

    test('CANCELADA pasa a ELIMINADO sin side effect de lote', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ estado: 'CANCELADA' }));
        prismaMock.reserva.update.mockResolvedValue(
            buildReservaRow({ estado: 'CANCELADA', estadoOperativo: 'ELIMINADO' }),
        );
        const row = await eliminarReserva(1, buildUser('GESTOR'));
        expect(prismaMock.reserva.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 1 },
                data: { estadoOperativo: 'ELIMINADO' },
            }),
        );
        expect(row.estadoOperativo).toBe('ELIMINADO');
        expect(updateLote).not.toHaveBeenCalled();
    });
});

describe('reactivarReserva', () => {
    test('404 si no existe', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(null);
        await expectStatus(() => reactivarReserva(1, buildUser('ADMINISTRADOR')), 404, 'statusCode');
    });

    test('INMOBILIARIA ajena 403', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(
            buildReservaRow({ estadoOperativo: 'ELIMINADO', inmobiliariaId: 5 }),
        );
        await expectStatus(
            () => reactivarReserva(1, buildUser('INMOBILIARIA', 9)),
            403,
            'statusCode',
        );
    });

    test('ya OPERATIVA lanza 409', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(
            buildReservaRow({ estadoOperativo: 'OPERATIVO' }),
        );
        await expectStatus(
            () => reactivarReserva(1, buildUser('ADMINISTRADOR')),
            409,
            'statusCode',
        );
    });

    test('reactiva solo estadoOperativo, sin tocar lote', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(
            buildReservaRow({ estadoOperativo: 'ELIMINADO' }),
        );
        prismaMock.reserva.update.mockResolvedValue(buildReservaRow({ estadoOperativo: 'OPERATIVO' }));
        await reactivarReserva(1, buildUser('INMOBILIARIA', 5));
        expect(prismaMock.reserva.update.mock.calls[0][0].data).toEqual({
            estadoOperativo: 'OPERATIVO',
        });
        expect(updateLote).not.toHaveBeenCalled();
    });
});

describe('deleteReserva (hard delete — no usado por controller)', () => {
    test('404 si no existe', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(null);
        await expectStatus(() => deleteReserva(1), 404);
    });

    test('si estaba ACTIVA restaura el lote tras borrar', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(
            buildReservaRow({ estado: 'ACTIVA', loteEstadoAlCrear: 'EN_PROMOCION' }),
        );
        prismaMock.reserva.delete.mockResolvedValue({ id: 1 });
        computeRestore.mockResolvedValue('En Promoción');
        await deleteReserva(1);
        expect(prismaMock.reserva.delete).toHaveBeenCalledWith({ where: { id: 1 } });
        expect(updateLote).toHaveBeenCalledWith(3, 'En Promoción');
    });

    test('si no estaba ACTIVA no restaura lote', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(buildReservaRow({ estado: 'CANCELADA' }));
        prismaMock.reserva.delete.mockResolvedValue({ id: 1 });
        await deleteReserva(1);
        expect(updateLote).not.toHaveBeenCalled();
    });
});

describe('ofertas', () => {
    test('getOfertasByReservaId lista por reservaId', async () => {
        prismaMock.ofertaReserva.findMany.mockResolvedValue([{ id: 1, monto: 100000 }]);
        const rows = await getOfertasByReservaId(7);
        expect(rows).toHaveLength(1);
        expect(prismaMock.ofertaReserva.findMany).toHaveBeenCalledWith({
            where: { reservaId: 7 },
            orderBy: { createdAt: 'desc' },
        });
    });

    test('createOferta reserva inexistente lanza Error genérico', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(null);
        await expect(
            createOfertaReserva(1, { monto: 1, action: 'ACEPTAR' }, buildUser('ADMINISTRADOR')),
        ).rejects.toThrow('Reserva no encontrada');
    });

    test('ACEPTAR persiste oferta y pasa la reserva a ACEPTADA', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(
            buildReservaRow({ inmobiliaria: { id: 5, nombre: 'Norte' } }),
        );
        txMock.ofertaReserva.create.mockResolvedValue({ id: 2, monto: 110000 });
        txMock.reserva.update.mockResolvedValue(buildReservaRow({ estado: 'ACEPTADA' }));

        await createOfertaReserva(
            1,
            { monto: 110000, motivo: 'ok', action: 'ACEPTAR' },
            buildUser('ADMINISTRADOR'),
        );
        expect(txMock.ofertaReserva.create.mock.calls[0][0].data).toEqual(
            expect.objectContaining({
                reservaId: 1,
                monto: 110000,
                motivo: 'ok',
                nombreEfector: 'La Federala',
                ownerType: 'CCLF',
            }),
        );
        expect(txMock.reserva.update.mock.calls[0][0].data).toEqual({
            ofertaActual: 110000,
            estado: 'ACEPTADA',
        });
    });

    test('RECHAZAR marca RECHAZADA; otro action es CONTRAOFERTA', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(
            buildReservaRow({ inmobiliaria: { id: 5, nombre: 'Norte' } }),
        );
        txMock.ofertaReserva.create.mockResolvedValue({ id: 3 });
        txMock.reserva.update.mockResolvedValue(buildReservaRow());

        await createOfertaReserva(
            1,
            { monto: 90000, motivo: 'no', action: 'RECHAZAR' },
            buildUser('GESTOR'),
        );
        expect(txMock.reserva.update.mock.calls[0][0].data.estado).toBe('RECHAZADA');

        await createOfertaReserva(
            1,
            { monto: 95000, motivo: 'contra', action: 'CONTRAOFERTAR' },
            buildUser('INMOBILIARIA', 5),
        );
        expect(txMock.reserva.update.mock.calls[1][0].data.estado).toBe('CONTRAOFERTA');
        expect(txMock.ofertaReserva.create.mock.calls[1][0].data).toEqual(
            expect.objectContaining({
                nombreEfector: 'Norte',
                efectorId: 5,
                ownerType: 'INMOBILIARIA',
            }),
        );
    });

    test('RECHAZAR no restaura el lote (side effect ausente vs updateReserva)', async () => {
        prismaMock.reserva.findUnique.mockResolvedValue(
            buildReservaRow({ inmobiliaria: { id: 5, nombre: 'Norte' } }),
        );
        txMock.ofertaReserva.create.mockResolvedValue({ id: 4 });
        txMock.reserva.update.mockResolvedValue(buildReservaRow({ estado: 'RECHAZADA' }));

        await createOfertaReserva(
            1,
            { monto: 100000, motivo: 'no', action: 'RECHAZAR' },
            buildUser('ADMINISTRADOR'),
        );
        expect(updateLote).not.toHaveBeenCalled();
        expect(computeRestore).not.toHaveBeenCalled();
    });
});
