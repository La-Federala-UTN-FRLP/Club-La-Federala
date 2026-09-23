jest.mock('../../../src/config/prisma', () =>
    require('../../support/mocks/prisma').lotePrismaMock,
);

jest.mock('../../../src/domain/loteState/loteState.effects', () => ({
    cancelActivesOnNoDisponible: jest.fn(),
}));

import {
    createLote,
    deleteLote,
    getAllLotes,
    getLoteById,
    updatedLote,
    updateLoteState,
} from '../../../src/services/lote.service';
import { cancelActivesOnNoDisponible } from '../../../src/domain/loteState/loteState.effects';
import { Prisma } from '../../../src/generated/prisma';
import { lotePrismaMock as prismaMock, resetPrismaMock } from '../../support/mocks/prisma';

const cancelActives = cancelActivesOnNoDisponible as jest.Mock;

afterEach(() => {
    resetPrismaMock(prismaMock);
    cancelActives.mockReset();
});

function buildInquilino(overrides: Record<string, unknown> = {}) {
    return {
        id: 20,
        nombre: 'Ana',
        apellido: 'Perez',
        razonSocial: null,
        identificadorTipo: 'DNI',
        identificadorValor: '30111222',
        ...overrides,
    };
}

function buildAlquilerActivo(overrides: Record<string, unknown> = {}) {
    return {
        id: 50,
        loteId: 1,
        inquilinoId: 20,
        estado: 'ACTIVO',
        fechaInicio: new Date('2026-02-01T10:00:00.000Z'),
        fechaFin: null,
        inquilino: buildInquilino(),
        ...overrides,
    };
}

function buildPrismaLote(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        numero: 16,
        mapId: 'Lote16-3',
        tipo: 'LOTE_VENTA',
        descripcion: 'Lote esquinero con servicios',
        estado: 'DISPONIBLE',
        subestado: 'EN_CONSTRUCCION',
        fondo: new Prisma.Decimal('35.50'),
        frente: new Prisma.Decimal('20.75'),
        numPartido: 62,
        superficie: new Prisma.Decimal('480.33'),
        alquiler: false,
        deuda: false,
        precio: new Prisma.Decimal('125000.50'),
        nombreEspacioComun: null,
        capacidad: null,
        fraccionId: 3,
        propietarioId: 7,
        ubicacionId: 5,
        inquilinoId: null,
        inquilino: null,
        alquileres: [],
        promociones: [],
        prioridad: [],
        Venta: [{ id: 11 }],
        reserva: [{ id: 21 }],
        createdAt: new Date('2025-10-01T10:00:00.000Z'),
        updateAt: null,
        ...overrides,
    };
}

function stubList(lotes: unknown[], count = lotes.length) {
    prismaMock.lote.findMany.mockResolvedValue(lotes);
    prismaMock.lote.count.mockResolvedValue(count);
}

function listWhere() {
    return prismaMock.lote.findMany.mock.calls[0][0].where;
}

function buildCreatePayload(overrides: Record<string, unknown> = {}) {
    return {
        tipo: 'Lote Venta',
        estado: 'Disponible',
        subestado: 'En Construccion',
        numero: 16,
        precio: 125000.5,
        fraccionId: 3,
        propietarioId: 7,
        ...overrides,
    };
}

function stubCreateLookups(fraccion: { numero: number } | null = { numero: 3 }, existing: unknown = null) {
    prismaMock.fraccion.findUnique.mockResolvedValue(fraccion);
    prismaMock.lote.findFirst.mockResolvedValue(existing);
}

function stubLoteActual(estado = 'DISPONIBLE', extra: Record<string, unknown> = {}) {
    prismaMock.lote.findUnique.mockResolvedValue({
        id: 1,
        estado,
        ubicacion: { id: 5, calle: 'MACA', numero: 10 },
        ...extra,
    });
}

async function expectStatus(fn: () => Promise<unknown>, statusCode: number) {
    let thrown: unknown;
    try {
        await fn();
    } catch (error) {
        thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(thrown).toEqual(expect.objectContaining({ statusCode }));
}

describe('getAllLotes', () => {
    test('enriquece lote sin alquiler activo como NO_ALQUILADO', async () => {
        stubList([buildPrismaLote()]);

        const result = await getAllLotes();
        const lote = result.lotes[0];

        expect(result.lotes).toHaveLength(1);
        expect(lote.ocupacion).toBe('NO_ALQUILADO');
        expect(lote.alquilerActivo).toBeNull();
        expect(lote.inquilino).toBeNull();
        expect(lote.inquilinoId).toBeNull();
    });

    test('enriquece lote con alquiler activo como ALQUILADO y expone inquilino del alquiler', async () => {
        const alquiler = buildAlquilerActivo();
        stubList([
            buildPrismaLote({
                alquileres: [alquiler],
                inquilino: buildInquilino({ id: 99, nombre: 'Legacy' }),
                inquilinoId: 99,
            }),
        ]);

        const lote = (await getAllLotes()).lotes[0];

        expect(lote.ocupacion).toBe('ALQUILADO');
        expect(lote.alquilerActivo).toEqual({
            id: alquiler.id,
            inquilino: alquiler.inquilino,
            fechaInicio: alquiler.fechaInicio,
        });
        expect(lote.inquilino).toEqual(alquiler.inquilino);
        expect(lote.inquilinoId).toBe(20);
    });

    test.each([
        [{ estado: 'Disponible' }, { estado: 'DISPONIBLE' }],
        [
            { estado: ['Disponible', 'En Promoción'] },
            { estado: { in: ['DISPONIBLE', 'EN_PROMOCION'] } },
        ],
        [{ subestado: 'En Construccion' }, { subestado: 'EN_CONSTRUCCION' }],
        [{ tipo: 'Lote Venta' }, { tipo: 'LOTE_VENTA' }],
        [{ propietarioId: '7' }, { propietarioId: 7 }],
        [{ ubicacionId: 5 }, { ubicacionId: 5 }],
        [{ deudor: true }, { deuda: true }],
        [{ deudor: 'false' }, { deuda: false }],
    ])('filtro %j se traduce a Prisma %j', async (query, expectedWhere) => {
        stubList([]);
        await getAllLotes(query);
        expect(listWhere()).toEqual(expect.objectContaining(expectedWhere));
    });

    test('filtro estado=Alquilado no se aplica: ALQUILADO no es estado operativo', async () => {
        stubList([]);
        await getAllLotes({ estado: 'Alquilado' });
        expect(listWhere().estado).toBeUndefined();
    });

    test('label de estado no reconocido se ignora silenciosamente', async () => {
        stubList([]);
        await getAllLotes({ estado: 'NoExiste' });
        expect(listWhere().estado).toBeUndefined();
    });

    test('ocupacion=ALQUILADO deja solo lotes con alquiler activo y total post-filtro', async () => {
        stubList(
            [
                buildPrismaLote({ id: 1, alquileres: [buildAlquilerActivo()] }),
                buildPrismaLote({ id: 2, alquileres: [] }),
            ],
            99,
        );

        const result = await getAllLotes({ ocupacion: 'ALQUILADO' });

        expect(result.lotes).toHaveLength(1);
        expect(result.lotes[0].id).toBe(1);
        expect(result.total).toBe(1);
    });

    test('ocupacion=NO_ALQUILADO deja solo lotes sin alquiler activo', async () => {
        stubList([
            buildPrismaLote({ id: 1, alquileres: [buildAlquilerActivo()] }),
            buildPrismaLote({ id: 2, alquileres: [] }),
        ]);

        const result = await getAllLotes({ ocupacion: 'NO_ALQUILADO' });
        expect(result.lotes.map((l: { id: number }) => l.id)).toEqual([2]);
        expect(result.total).toBe(1);
    });

    test('TECNICO no recibe deuda ni relaciones de venta/reserva', async () => {
        stubList([
            buildPrismaLote({
                deuda: true,
                Venta: [{ id: 11 }],
                venta: [{ id: 12 }],
                ventas: [{ id: 13 }],
                reserva: [{ id: 21 }],
                Reserva: [{ id: 22 }],
                reservas: [{ id: 23 }],
            }),
        ]);

        const lote = (await getAllLotes({}, 'TECNICO')).lotes[0];
        for (const field of [
            'deuda',
            'Venta',
            'venta',
            'ventas',
            'reserva',
            'Reserva',
            'reservas',
        ]) {
            expect(lote).not.toHaveProperty(field);
        }
    });
});

describe('getLoteById', () => {
    test('devuelve lote existente sin alquiler enriquecido como NO_ALQUILADO', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(buildPrismaLote());

        const result = await getLoteById(1);

        expect(prismaMock.lote.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 1 } }),
        );
        expect(result).toEqual(
            expect.objectContaining({
                id: 1,
                ocupacion: 'NO_ALQUILADO',
                alquilerActivo: null,
            }),
        );
    });

    test('devuelve lote con alquiler activo enriquecido como ALQUILADO', async () => {
        const alquiler = buildAlquilerActivo();
        prismaMock.lote.findUnique.mockResolvedValue(buildPrismaLote({ alquileres: [alquiler] }));

        const result = await getLoteById(1);
        expect(result.ocupacion).toBe('ALQUILADO');
        expect(result.alquilerActivo).toEqual(expect.objectContaining({ id: 50 }));
        expect(result.inquilinoId).toBe(20);
    });

    test('TECNICO recibe versión sanitizada', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(buildPrismaLote({ deuda: true }));
        const result = await getLoteById(1, 'TECNICO');
        expect(result).not.toHaveProperty('deuda');
        expect(result).not.toHaveProperty('Venta');
        expect(result).not.toHaveProperty('reserva');
    });

    test('inexistente lanza 404', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(null);
        await expect(getLoteById(999)).rejects.toThrow('Lote no encontrado');
        await expectStatus(() => getLoteById(999), 404);
    });
});

describe('createLote', () => {
    test('Lote Venta sin precio lanza 400', async () => {
        await expect(createLote(buildCreatePayload({ precio: null }))).rejects.toThrow(
            /precio es obligatorio/i,
        );
        await expectStatus(() => createLote(buildCreatePayload({ precio: undefined })), 400);
        expect(prismaMock.lote.create).not.toHaveBeenCalled();
    });

    test('Espacio Comun con precio lanza 400', async () => {
        await expect(
            createLote(buildCreatePayload({ tipo: 'Espacio Comun', precio: 5000 })),
        ).rejects.toThrow(/precio no aplica/i);
        expect(prismaMock.lote.create).not.toHaveBeenCalled();
    });

    test('Lote Venta válido crea con mappings DTO → Prisma', async () => {
        stubCreateLookups();
        prismaMock.lote.create.mockResolvedValue(buildPrismaLote());

        const result = await createLote(buildCreatePayload({ ubicacionId: 5 }));
        const data = prismaMock.lote.create.mock.calls[0][0].data;

        expect(result.id).toBe(1);
        expect(data.tipo).toBe('LOTE_VENTA');
        expect(data.estado).toBe('DISPONIBLE');
        expect(data.subestado).toBe('EN_CONSTRUCCION');
        expect(data.numero).toBe(16);
        expect(data.fraccion).toEqual({ connect: { id: 3 } });
        expect(data.propietario).toEqual({ connect: { id: 7 } });
        expect(data.ubicacion).toEqual({ connect: { id: 5 } });
    });

    test('Espacio Comun válido se crea sin precio', async () => {
        stubCreateLookups();
        prismaMock.lote.create.mockResolvedValue(buildPrismaLote({ tipo: 'ESPACIO_COMUN' }));

        await createLote(
            buildCreatePayload({ tipo: 'Espacio Comun', precio: undefined, nombreEspacioComun: 'Salón' }),
        );
        expect(prismaMock.lote.create.mock.calls[0][0].data.tipo).toBe('ESPACIO_COMUN');
        expect(prismaMock.lote.create.mock.calls[0][0].data.precio).toBeUndefined();
    });

    test('sin numero ni numeroLote lanza 400', async () => {
        await expectStatus(
            () => createLote(buildCreatePayload({ numero: undefined, numeroLote: undefined })),
            400,
        );
    });

    test('acepta fallback legacy numeroLote', async () => {
        stubCreateLookups();
        prismaMock.lote.create.mockResolvedValue(buildPrismaLote({ numero: 8 }));

        await createLote(buildCreatePayload({ numero: undefined, numeroLote: 8 }));
        expect(prismaMock.lote.create.mock.calls[0][0].data.numero).toBe(8);
    });

    test('fracción inexistente lanza 404', async () => {
        stubCreateLookups(null);
        await expectStatus(() => createLote(buildCreatePayload()), 404);
        expect(prismaMock.lote.create).not.toHaveBeenCalled();
    });

    test('mismo número en la misma fracción lanza 409', async () => {
        stubCreateLookups({ numero: 3 }, { id: 99, mapId: 'Lote16-3' });

        await expect(createLote(buildCreatePayload())).rejects.toThrow(/ya existe un lote/i);
        await expectStatus(() => createLote(buildCreatePayload()), 409);
        expect(prismaMock.lote.findFirst).toHaveBeenCalledWith({
            where: { numero: 16, fraccionId: 3 },
            select: { id: true, mapId: true },
        });
        expect(prismaMock.lote.create).not.toHaveBeenCalled();
    });

    test('mapId provisto se conserva', async () => {
        stubCreateLookups();
        prismaMock.lote.create.mockResolvedValue(buildPrismaLote());
        await createLote(buildCreatePayload({ mapId: 'CUSTOM-1' }));
        expect(prismaMock.lote.create.mock.calls[0][0].data.mapId).toBe('CUSTOM-1');
    });

    test.each([undefined, '', '   '])(
        'sin mapId usable (%j) genera Lote{numero}-{fraccion}',
        async (mapId) => {
            stubCreateLookups({ numero: 3 });
            prismaMock.lote.create.mockResolvedValue(buildPrismaLote());
            await createLote(buildCreatePayload({ mapId }));
            expect(prismaMock.lote.create.mock.calls[0][0].data.mapId).toBe('Lote16-3');
        },
    );

    test('deuda omitted default false; deuda explícita se respeta', async () => {
        stubCreateLookups();
        prismaMock.lote.create.mockResolvedValue(buildPrismaLote());

        await createLote(buildCreatePayload({ deuda: undefined }));
        expect(prismaMock.lote.create.mock.calls[0][0].data.deuda).toBe(false);

        prismaMock.lote.create.mockClear();
        await createLote(buildCreatePayload({ deuda: true }));
        expect(prismaMock.lote.create.mock.calls[0][0].data.deuda).toBe(true);
    });

    test('calle + numeroCalle sin ubicacionId hace nested create', async () => {
        stubCreateLookups();
        prismaMock.lote.create.mockResolvedValue(buildPrismaLote());

        await createLote(
            buildCreatePayload({
                ubicacionId: undefined,
                calle: 'MACA',
                numeroCalle: 120,
            }),
        );
        expect(prismaMock.lote.create.mock.calls[0][0].data.ubicacion).toEqual({
            create: { calle: 'MACA', numero: 120 },
        });
    });

    test('ubicacionId tiene prioridad sobre calle+numeroCalle', async () => {
        stubCreateLookups();
        prismaMock.lote.create.mockResolvedValue(buildPrismaLote());

        await createLote(
            buildCreatePayload({ ubicacionId: 5, calle: 'MACA', numeroCalle: 120 }),
        );
        expect(prismaMock.lote.create.mock.calls[0][0].data.ubicacion).toEqual({
            connect: { id: 5 },
        });
    });
});

describe('updatedLote', () => {
    test('lote inexistente lanza 404 y no actualiza', async () => {
        prismaMock.lote.findUnique.mockResolvedValue(null);
        await expectStatus(() => updatedLote(999, { descripcion: 'x' }), 404);
        expect(prismaMock.lote.update).not.toHaveBeenCalled();
    });

    test('lote existente actualiza campos simples y mappings DTO', async () => {
        stubLoteActual();
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote({ descripcion: 'Actualizado' }));

        const result = await updatedLote(1, {
            descripcion: 'Actualizado',
            superficie: 500,
            estado: 'Reservado',
            subestado: 'Construido',
            tipo: 'Lote Venta',
            propietarioId: 9,
        });
        const data = prismaMock.lote.update.mock.calls[0][0].data;

        expect(result.descripcion).toBe('Actualizado');
        expect(data.superficie).toBe(500);
        expect(data.estado).toBe('RESERVADO');
        expect(data.subestado).toBe('CONSTRUIDO');
        expect(data.tipo).toBe('LOTE_VENTA');
        expect(data.propietario).toEqual({ connect: { id: 9 } });
        expect(data.descripcion).toBe('Actualizado');
    });

    test('rechaza estado Alquilado con 400: ocupación está separada', async () => {
        stubLoteActual();
        await expect(updatedLote(1, { estado: 'Alquilado' })).rejects.toThrow(
            /ALQUILADO ya no es un estado válido/i,
        );
        await expectStatus(() => updatedLote(1, { estado: 'Alquilado' }), 400);
        expect(prismaMock.lote.update).not.toHaveBeenCalled();
    });

    test('Prisma P2025 en update se traduce a 404', async () => {
        stubLoteActual();
        prismaMock.lote.update.mockRejectedValue({ code: 'P2025' });
        await expect(updatedLote(1, { descripcion: 'x' })).rejects.toThrow('Lote no encontrado');
        await expectStatus(() => updatedLote(1, { descripcion: 'x' }), 404);
    });
});

describe('updatedLote — TECNICO', () => {
    test('permite subestado y lo mapea a enum Prisma', async () => {
        stubLoteActual();
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote());
        await updatedLote(1, { subestado: 'Construido' }, 'TECNICO');
        expect(prismaMock.lote.update.mock.calls[0][0].data.subestado).toBe('CONSTRUIDO');
    });

    test('permite superficie', async () => {
        stubLoteActual();
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote());
        await updatedLote(1, { superficie: 520 }, 'TECNICO');
        expect(prismaMock.lote.update.mock.calls[0][0].data.superficie).toBe(520);
    });

    test('permite archivos (planos)', async () => {
        stubLoteActual();
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote());
        const archivos = { create: [{ filename: 'plano.pdf', tipo: 'PLANO' }] };
        await updatedLote(1, { archivos }, 'TECNICO');
        expect(prismaMock.lote.update.mock.calls[0][0].data.archivos).toEqual(archivos);
    });

    test('payload mixto conserva permitidos y descarta frente/fondo/precio', async () => {
        stubLoteActual();
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote());
        await updatedLote(
            1,
            {
                subestado: 'Construido',
                superficie: 520,
                frente: 18,
                fondo: 40,
                precio: 200000,
                descripcion: 'no',
            },
            'TECNICO',
        );
        const data = prismaMock.lote.update.mock.calls[0][0].data;
        expect(data.subestado).toBe('CONSTRUIDO');
        expect(data.superficie).toBe(520);
        expect(data.frente).toBeUndefined();
        expect(data.fondo).toBeUndefined();
        expect(data.precio).toBeUndefined();
        expect(data.descripcion).toBeUndefined();
    });

    test('sin campos permitidos lanza 403', async () => {
        await expect(updatedLote(1, { precio: 200000, frente: 18 }, 'TECNICO')).rejects.toThrow(
            /subestado, superficie y archivos/i,
        );
        await expectStatus(() => updatedLote(1, { precio: 1 }, 'TECNICO'), 403);
        expect(prismaMock.lote.findUnique).not.toHaveBeenCalled();
        expect(prismaMock.lote.update).not.toHaveBeenCalled();
    });
});

describe('updatedLote — ocupación / alquiler', () => {
    test('ALQUILADO sobre lote NO_DISPONIBLE lanza 400', async () => {
        stubLoteActual('NO_DISPONIBLE');
        await expectStatus(
            () => updatedLote(1, { ocupacion: 'ALQUILADO', inquilinoId: 20 }),
            400,
        );
        expect(prismaMock.alquiler.create).not.toHaveBeenCalled();
    });

    test('ALQUILADO sin inquilinoId válido lanza 400', async () => {
        stubLoteActual();
        await expectStatus(() => updatedLote(1, { ocupacion: 'ALQUILADO' }), 400);
        await expectStatus(() => updatedLote(1, { ocupacion: 'ALQUILADO', inquilinoId: 0 }), 400);
    });

    test('ALQUILADO con persona inexistente lanza 404', async () => {
        stubLoteActual();
        prismaMock.persona.findUnique.mockResolvedValue(null);
        await expectStatus(
            () => updatedLote(1, { ocupacion: 'ALQUILADO', inquilinoId: 20 }),
            404,
        );
    });

    test('ALQUILADO con persona no OPERATIVA lanza 400', async () => {
        stubLoteActual();
        prismaMock.persona.findUnique.mockResolvedValue({ estadoOperativo: 'ELIMINADO' });
        await expect(updatedLote(1, { ocupacion: 'ALQUILADO', inquilinoId: 20 })).rejects.toThrow(
            /inquilino inactivo/i,
        );
        await expectStatus(
            () => updatedLote(1, { ocupacion: 'ALQUILADO', inquilinoId: 20 }),
            400,
        );
    });

    test('ALQUILADO con el mismo inquilino no finaliza ni crea otro alquiler', async () => {
        stubLoteActual();
        prismaMock.persona.findUnique.mockResolvedValue({ estadoOperativo: 'OPERATIVO' });
        prismaMock.alquiler.findFirst.mockResolvedValue(buildAlquilerActivo({ inquilinoId: 20 }));
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote());

        await updatedLote(1, { ocupacion: 'ALQUILADO', inquilinoId: 20 });

        expect(prismaMock.alquiler.update).not.toHaveBeenCalled();
        expect(prismaMock.alquiler.create).not.toHaveBeenCalled();
    });

    test('ALQUILADO con otro inquilino finaliza el actual y crea uno ACTIVO', async () => {
        stubLoteActual();
        prismaMock.persona.findUnique.mockResolvedValue({ estadoOperativo: 'OPERATIVO' });
        prismaMock.alquiler.findFirst.mockResolvedValue(buildAlquilerActivo({ inquilinoId: 20 }));
        prismaMock.alquiler.update.mockResolvedValue({});
        prismaMock.alquiler.create.mockResolvedValue({});
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote());

        await updatedLote(1, { ocupacion: 'ALQUILADO', inquilinoId: 30 });

        expect(prismaMock.alquiler.update).toHaveBeenCalledWith({
            where: { id: 50 },
            data: { estado: 'FINALIZADO', fechaFin: expect.any(Date) },
        });
        expect(prismaMock.alquiler.create).toHaveBeenCalledWith({
            data: {
                loteId: 1,
                inquilinoId: 30,
                estado: 'ACTIVO',
                fechaInicio: expect.any(Date),
            },
        });
    });

    test('ALQUILADO sin alquiler previo crea uno ACTIVO', async () => {
        stubLoteActual();
        prismaMock.persona.findUnique.mockResolvedValue({ estadoOperativo: 'OPERATIVO' });
        prismaMock.alquiler.findFirst.mockResolvedValue(null);
        prismaMock.alquiler.create.mockResolvedValue({});
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote());

        await updatedLote(1, { ocupacion: 'ALQUILADO', inquilinoId: 20 });

        expect(prismaMock.alquiler.update).not.toHaveBeenCalled();
        expect(prismaMock.alquiler.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                loteId: 1,
                inquilinoId: 20,
                estado: 'ACTIVO',
                fechaInicio: expect.any(Date),
            }),
        });
    });

    test('NO_ALQUILADO finaliza el alquiler activo si existe', async () => {
        stubLoteActual();
        prismaMock.alquiler.findFirst.mockResolvedValue(buildAlquilerActivo());
        prismaMock.alquiler.update.mockResolvedValue({});
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote());

        await updatedLote(1, { ocupacion: 'NO_ALQUILADO' });

        expect(prismaMock.alquiler.update).toHaveBeenCalledWith({
            where: { id: 50 },
            data: { estado: 'FINALIZADO', fechaFin: expect.any(Date) },
        });
        expect(prismaMock.alquiler.create).not.toHaveBeenCalled();
    });

    test('NO_ALQUILADO sin alquiler activo no crea ni falla', async () => {
        stubLoteActual();
        prismaMock.alquiler.findFirst.mockResolvedValue(null);
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote());

        await updatedLote(1, { ocupacion: 'NO_ALQUILADO' });

        expect(prismaMock.alquiler.update).not.toHaveBeenCalled();
        expect(prismaMock.alquiler.create).not.toHaveBeenCalled();
        expect(prismaMock.lote.update).toHaveBeenCalled();
    });
});

describe('updatedLote — NO_DISPONIBLE + effects', () => {
    test('transición a No Disponible cancela operaciones activas una vez', async () => {
        stubLoteActual('DISPONIBLE');
        cancelActives.mockResolvedValue(undefined);
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote({ estado: 'NO_DISPONIBLE' }));

        await updatedLote(1, { estado: 'No Disponible' });

        expect(cancelActives).toHaveBeenCalledTimes(1);
        expect(cancelActives).toHaveBeenCalledWith(1);
        expect(prismaMock.lote.update.mock.calls[0][0].data.estado).toBe('NO_DISPONIBLE');
    });

    test('si ya estaba NO_DISPONIBLE no vuelve a cancelar', async () => {
        stubLoteActual('NO_DISPONIBLE');
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote({ estado: 'NO_DISPONIBLE' }));

        await updatedLote(1, { estado: 'No Disponible' });

        expect(cancelActives).not.toHaveBeenCalled();
    });
});

describe('updatedLote — ubicación', () => {
    test('calle + numeroCalle con ubicación existente llama ubicacion.update', async () => {
        stubLoteActual('DISPONIBLE', {
            ubicacion: { id: 5, calle: 'MACA', numero: 10 },
        });
        prismaMock.ubicacion.update.mockResolvedValue({});
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote());

        await updatedLote(1, { calle: 'ZORZAL', numeroCalle: 44 });

        expect(prismaMock.ubicacion.update).toHaveBeenCalledWith({
            where: { id: 5 },
            data: { calle: 'ZORZAL', numero: 44 },
        });
        expect(prismaMock.lote.update.mock.calls[0][0].data.ubicacion).toBeUndefined();
    });

    test('calle + numeroCalle sin ubicación hace nested create', async () => {
        stubLoteActual('DISPONIBLE', { ubicacion: null });
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote());

        await updatedLote(1, { calle: 'MACA', numeroCalle: 120 });

        expect(prismaMock.ubicacion.update).not.toHaveBeenCalled();
        expect(prismaMock.lote.update.mock.calls[0][0].data.ubicacion).toEqual({
            create: { calle: 'MACA', numero: 120 },
        });
    });

    test('ubicacionId sin calle/numero conecta ubicación existente', async () => {
        stubLoteActual();
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote());

        await updatedLote(1, { ubicacionId: 8 });

        expect(prismaMock.lote.update.mock.calls[0][0].data.ubicacion).toEqual({
            connect: { id: 8 },
        });
    });
});

describe('deleteLote', () => {
    test('TECNICO recibe 403 y no elimina archivos, reservas, ventas ni el lote', async () => {
        await expect(deleteLote(1, 'TECNICO')).rejects.toThrow(/no están autorizados/i);
        await expectStatus(() => deleteLote(1, 'TECNICO'), 403);
        expect(prismaMock.archivos.deleteMany).not.toHaveBeenCalled();
        expect(prismaMock.reserva.deleteMany).not.toHaveBeenCalled();
        expect(prismaMock.venta.deleteMany).not.toHaveBeenCalled();
        expect(prismaMock.lote.delete).not.toHaveBeenCalled();
    });

    test('rol permitido borra archivos, reservas y ventas del lote y luego el lote', async () => {
        prismaMock.archivos.deleteMany.mockResolvedValue({ count: 1 });
        prismaMock.reserva.deleteMany.mockResolvedValue({ count: 2 });
        prismaMock.venta.deleteMany.mockResolvedValue({ count: 1 });
        prismaMock.lote.delete.mockResolvedValue({ id: 1 });

        const result = await deleteLote(1, 'GESTOR');

        expect(result).toEqual({ message: 'Lote eliminado correctamente' });
        expect(prismaMock.archivos.deleteMany).toHaveBeenCalledWith({
            where: { idLoteAsociado: 1 },
        });
        expect(prismaMock.reserva.deleteMany).toHaveBeenCalledWith({ where: { loteId: 1 } });
        expect(prismaMock.venta.deleteMany).toHaveBeenCalledWith({ where: { loteId: 1 } });
        expect(prismaMock.lote.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });
});

describe('updateLoteState', () => {
    test('mapea DTO español a enum Prisma sobre el id indicado', async () => {
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote({ estado: 'RESERVADO' }));

        await updateLoteState(10, 'Reservado');

        expect(prismaMock.lote.update).toHaveBeenCalledWith({
            where: { id: 10 },
            data: { estado: 'RESERVADO' },
        });
    });

    test('con transaction client usa tx.lote.update y no el prisma global', async () => {
        const tx = { lote: { update: jest.fn().mockResolvedValue(buildPrismaLote({ estado: 'DISPONIBLE' })) } };
        prismaMock.lote.update.mockResolvedValue(buildPrismaLote({ estado: 'RESERVADO' }));

        await updateLoteState(10, 'Disponible', tx as never);

        expect(tx.lote.update).toHaveBeenCalledWith({
            where: { id: 10 },
            data: { estado: 'DISPONIBLE' },
        });
        expect(prismaMock.lote.update).not.toHaveBeenCalled();
    });
});
