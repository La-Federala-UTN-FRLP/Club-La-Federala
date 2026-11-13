// D5 — listados sin truncamiento silencioso (services reales, Prisma mockeado).
//
// Antes: Ubicaciones devolvía como máximo 10 (take fijo) con total = count() de toda la tabla;
// Personas devolvía las 100 más recientes si no venía limit (el frontend nunca lo manda), con un
// total mayor que lo devuelto y sin paginación. Ninguno era una regla de negocio.
// Ahora: Ubicaciones devuelve el listado completo y total = cantidad devuelta; Personas no trunca
// sin limit y respeta un limit explícito. (Usuarios: tests/unit/services/usuario.service.test.ts.
// Fracciones conserva su tope: el dominio admite como máximo 8.)
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        ubicacion: { findMany: jest.fn(), count: jest.fn() },
        persona: { findMany: jest.fn(), count: jest.fn() },
    },
}));

import prismaReal from '../../../src/config/prisma';
import { getAllUbicaciones } from '../../../src/services/ubicacion.service';
import { getAllPersonas } from '../../../src/services/persona.service';

type Mock = jest.Mock;
const prisma = prismaReal as unknown as {
    ubicacion: { findMany: Mock; count: Mock };
    persona: { findMany: Mock; count: Mock };
};

const ADMIN = { role: 'ADMINISTRADOR' };
const INMOBILIARIA = { role: 'INMOBILIARIA', inmobiliariaId: 7 };

beforeEach(() => {
    jest.clearAllMocks();
});

describe('getAllUbicaciones', () => {
    test('devuelve más de 10 y total coincide con lo devuelto', async () => {
        const filas = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, calle: 'MACA', numero: i + 1 }));
        prisma.ubicacion.findMany.mockResolvedValue(filas);

        const result = await getAllUbicaciones();

        expect(result.ubicaciones).toHaveLength(12);
        expect(result.total).toBe(12);
        expect(prisma.ubicacion.findMany).toHaveBeenCalledWith({ orderBy: { id: 'asc' } });
    });
});

describe('getAllPersonas — limit', () => {
    const takeDeLaConsulta = () => prisma.persona.findMany.mock.calls[0][0].take;

    beforeEach(() => {
        prisma.persona.findMany.mockResolvedValue([]);
        prisma.persona.count.mockResolvedValue(0);
    });

    test.each([
        ['ADMINISTRADOR', ADMIN],
        ['INMOBILIARIA', INMOBILIARIA],
    ])('%s sin limit: consulta completa (sin take)', async (_rol, user) => {
        await getAllPersonas(user, {});

        expect(prisma.persona.findMany).toHaveBeenCalledTimes(1);
        expect(takeDeLaConsulta()).toBeUndefined();
    });

    test.each([
        ['ADMINISTRADOR', ADMIN],
        ['INMOBILIARIA', INMOBILIARIA],
    ])('%s con ?limit=25: respeta 25', async (_rol, user) => {
        await getAllPersonas(user, { limit: 25 });

        expect(takeDeLaConsulta()).toBe(25);
    });
});
