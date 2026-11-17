// Borrado definitivo de Persona (DELETE /api/personas/:id, solo ADMINISTRADOR) y borrado de un
// miembro familiar (DELETE /api/personas/:id/grupo-familiar/miembros/:miembroId).
//
// Ambos caminos usan el mismo borrado transaccional: bloquea la fila de la persona (SELECT … FOR
// UPDATE), cuenta sus asociaciones y recién entonces borra. Bloquean (409, sin borrar):
// - asociaciones comerciales: lotes propios o alquilados, alquileres, reservas, ventas como comprador
//   principal o como co-comprador (la FK de co-compra es CASCADE: borrarla la quitaría de la venta);
// - miembros familiares (titular): la FK es SET NULL y desarmaría la familia en silencio.
// La carrera contra una alta concurrente (co-compra, miembro) se prueba contra una base real en
// tests/integration/personas.borrado.int.test.ts.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        persona: { findUnique: jest.fn(), delete: jest.fn() },
        $queryRaw: jest.fn(),
        $transaction: jest.fn(),
    },
}));

import prismaReal from '../../../src/config/prisma';
import {
    deletePersonaDefinitivo,
    eliminarMiembroFamiliar,
    MENSAJE_PERSONA_CON_ASOCIACIONES,
    MENSAJE_TITULAR_CON_MIEMBROS,
} from '../../../src/services/persona.service';

type Mock = jest.Mock;
const prisma = prismaReal as unknown as {
    persona: { findUnique: Mock; delete: Mock };
    $queryRaw: Mock;
    $transaction: Mock;
};

const SIN_ASOCIACIONES = {
    lotesPropios: 0, lotesAlquilados: 0, alquileres: 0, Reserva: 0, Venta: 0, ventasComoComprador: 0, miembrosFamilia: 0,
};
const conteo = (counts: Partial<typeof SIN_ASOCIACIONES>) => ({ _count: { ...SIN_ASOCIACIONES, ...counts } });

beforeEach(() => {
    jest.clearAllMocks();
    // tx = el mismo cliente; el lock encuentra la fila.
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    prisma.$queryRaw.mockResolvedValue([{ id: 9 }]);
    prisma.persona.delete.mockResolvedValue({ id: 9 });
});

describe('deletePersonaDefinitivo', () => {
    test('bloquea la fila, cuenta las asociaciones y borra, en ese orden y en una transacción', async () => {
        prisma.persona.findUnique.mockResolvedValue(conteo({}));

        await expect(deletePersonaDefinitivo(9)).resolves.toEqual({ message: 'Persona eliminada definitivamente' });

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        const [sql, id] = prisma.$queryRaw.mock.calls[0];
        expect(sql.join('?')).toMatch(/SELECT "id" FROM "public"\."Persona" WHERE "id" = \? FOR UPDATE/);
        expect(id).toBe(9);
        const orden = [prisma.$queryRaw, prisma.persona.findUnique, prisma.persona.delete].map((m) => m.mock.invocationCallOrder[0]);
        expect(orden).toEqual([...orden].sort((a, b) => a - b));
        expect(prisma.persona.delete).toHaveBeenCalledWith({ where: { id: 9 } });
    });

    test('el conteo incluye co-compras y miembros familiares', async () => {
        prisma.persona.findUnique.mockResolvedValue(conteo({}));

        await deletePersonaDefinitivo(9);

        const args = prisma.persona.findUnique.mock.calls[0][0];
        expect(Object.keys(args.select._count.select).sort()).toEqual(Object.keys(SIN_ASOCIACIONES).sort());
    });

    test.each([
        ['co-compradora de una venta', { ventasComoComprador: 1 }],
        ['comprador principal', { Venta: 1 }],
        ['propietaria de un lote', { lotesPropios: 1 }],
        ['inquilina de un lote', { lotesAlquilados: 1 }],
        ['con alquileres', { alquileres: 1 }],
        ['con reservas', { Reserva: 1 }],
    ])('%s → 409 sin borrar', async (_caso, counts) => {
        prisma.persona.findUnique.mockResolvedValue(conteo(counts));

        await expect(deletePersonaDefinitivo(9)).rejects.toMatchObject({ statusCode: 409, message: MENSAJE_PERSONA_CON_ASOCIACIONES });
        expect(prisma.persona.delete).not.toHaveBeenCalled();
    });

    test('titular con miembros familiares → 409 sin borrar (no se desarma la familia)', async () => {
        prisma.persona.findUnique.mockResolvedValue(conteo({ miembrosFamilia: 2 }));

        await expect(deletePersonaDefinitivo(9)).rejects.toMatchObject({ statusCode: 409, message: MENSAJE_TITULAR_CON_MIEMBROS });
        expect(prisma.persona.delete).not.toHaveBeenCalled();
    });

    test('persona inexistente → 404 sin borrar', async () => {
        prisma.$queryRaw.mockResolvedValue([]);

        await expect(deletePersonaDefinitivo(9)).rejects.toMatchObject({ statusCode: 404 });
        expect(prisma.persona.findUnique).not.toHaveBeenCalled();
        expect(prisma.persona.delete).not.toHaveBeenCalled();
    });
});

describe('eliminarMiembroFamiliar — mismos guards que el borrado definitivo', () => {
    const TITULAR = { id: 5, estadoOperativo: 'OPERATIVO', jefeDeFamiliaId: null };
    const MIEMBRO = { id: 9, categoria: 'MIEMBRO_FAMILIAR', jefeDeFamiliaId: 5 };

    function stubFamilia(counts: Partial<typeof SIN_ASOCIACIONES>) {
        prisma.persona.findUnique.mockImplementation(async (args: { where: { id: number }; select?: unknown }) => {
            if (args.select) return conteo(counts); // conteo dentro de la transacción
            return args.where.id === TITULAR.id ? TITULAR : MIEMBRO;
        });
    }

    test('miembro sin otras asociaciones → se borra', async () => {
        stubFamilia({});

        await expect(eliminarMiembroFamiliar(5, 9)).resolves.toEqual({ success: true });
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
        expect(prisma.persona.delete).toHaveBeenCalledWith({ where: { id: 9 } });
    });

    test('miembro co-comprador de una venta → 409 sin borrar (antes la co-compra se perdía)', async () => {
        stubFamilia({ ventasComoComprador: 1 });

        await expect(eliminarMiembroFamiliar(5, 9)).rejects.toMatchObject({ statusCode: 409, message: MENSAJE_PERSONA_CON_ASOCIACIONES });
        expect(prisma.persona.delete).not.toHaveBeenCalled();
    });
});
