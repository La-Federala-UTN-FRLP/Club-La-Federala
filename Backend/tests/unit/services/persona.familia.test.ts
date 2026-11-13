// Grupo familiar: modelo PLANO (services reales, Prisma mockeado).
//
// Una familia tiene un único titular y N miembros directos; una persona pertenece como máximo a una
// familia. No hay familias anidadas ni ciclos: un miembro no puede ser titular, un titular con
// miembros no puede pasar a ser miembro y nadie es su propio jefe.
//
// Caminos que asignan jefe de familia:
// - POST /personas con jefeDeFamiliaId (createPersona): la persona es nueva;
// - POST /personas/:id/grupo-familiar/miembros (crearMiembroFamiliar): el miembro es nuevo.
// PUT /personas no modifica el jefe de familia (el campo se ignora): ninguna persona existente pasa
// a ser miembro, por eso no se pueden construir ciclos (A→B, B→A) ni reasignar a un segundo jefe.
// El borrado (titular con miembros → 409) está en persona.delete.test.ts.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        persona: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
        inmobiliaria: { findUnique: jest.fn() },
    },
}));

import prismaReal from '../../../src/config/prisma';
import { Prisma } from '../../../src/generated/prisma';
import {
    assertJefeDeFamiliaAsignable,
    createPersona,
    crearMiembroFamiliar,
    updatePersona,
    MENSAJE_JEFE_ES_MIEMBRO,
    MENSAJE_JEFE_INEXISTENTE,
    MENSAJE_JEFE_PROPIO,
    MENSAJE_TITULAR_NO_PUEDE_SER_MIEMBRO,
} from '../../../src/services/persona.service';

type Mock = jest.Mock;
const prisma = prismaReal as unknown as {
    persona: { findUnique: Mock; create: Mock; update: Mock; count: Mock };
    inmobiliaria: { findUnique: Mock };
};

const ADMIN = { role: 'ADMINISTRADOR' };

/** "Base" de personas: id → jefeDeFamiliaId. */
let jefes: Record<number, number | null>;

function personaRow(id: number, extra: Record<string, unknown> = {}) {
    return {
        id, nombre: `P${id}`, apellido: 'Test', razonSocial: null, identificadorTipo: 'DNI', identificadorValor: `${id}`.padStart(8, '0'),
        contacto: null, categoria: 'CLIENTE', estadoOperativo: 'OPERATIVO', inmobiliariaId: null, jefeDeFamiliaId: jefes[id] ?? null,
        createdAt: new Date('2026-01-01T00:00:00Z'), updateAt: null, fechaBaja: null, user: null, inmobiliaria: null,
        jefeDeFamilia: null, miembrosFamilia: [], alquileres: [], _count: { lotesPropios: 1, alquileres: 0 },
        ...extra,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    // 1 = titular (sin jefe); 2 = miembro de 1; 3 = otra persona sin familia
    jefes = { 1: null, 2: 1, 3: null };
    prisma.persona.findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) => {
        if ('identificadorTipo_identificadorValor' in args.where) return null; // identificador libre
        const id = args.where.id as number;
        return id in jefes ? personaRow(id) : null;
    });
    prisma.persona.count.mockImplementation(async ({ where }: { where: { jefeDeFamiliaId: number } }) =>
        Object.values(jefes).filter((j) => j === where.jefeDeFamiliaId).length,
    );
    prisma.persona.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const id = Math.max(...Object.keys(jefes).map(Number)) + 1;
        jefes[id] = (data.jefeDeFamiliaId as number | undefined) ?? null;
        return { id, ...data };
    });
});

const altaPersona = (jefeDeFamiliaId?: number) =>
    createPersona({ identificadorTipo: 'DNI' as never, identificadorValor: '40111222', nombre: 'Nueva', apellido: 'Persona', jefeDeFamiliaId }, ADMIN);

const altaMiembro = (titularId: number) =>
    crearMiembroFamiliar(titularId, { nombre: 'Hijo', apellido: 'Test', identificadorTipo: 'DNI' as never, identificadorValor: '40999888' });

describe('alta de persona con jefe de familia (POST /personas)', () => {
    test('jefe válido → se persiste en el mismo INSERT (sin un update posterior)', async () => {
        await altaPersona(1);

        expect(prisma.persona.create).toHaveBeenCalledWith({ data: expect.objectContaining({ jefeDeFamiliaId: 1 }) });
        expect(prisma.persona.update).not.toHaveBeenCalled();
    });

    test('segundo miembro del mismo titular → permitido', async () => {
        await altaPersona(1);

        expect(Object.values(jefes).filter((j) => j === 1)).toHaveLength(2);
    });

    test('el jefe ya es miembro de otra familia (A→B, B→C) → 409 sin crear', async () => {
        await expect(altaPersona(2)).rejects.toMatchObject({ statusCode: 409, message: MENSAJE_JEFE_ES_MIEMBRO });
        expect(prisma.persona.create).not.toHaveBeenCalled();
    });

    test('jefe inexistente → 400 sin crear', async () => {
        await expect(altaPersona(99)).rejects.toMatchObject({ statusCode: 400, message: MENSAJE_JEFE_INEXISTENTE });
        expect(prisma.persona.create).not.toHaveBeenCalled();
    });

    test('el jefe se borra entre la validación y el INSERT (FK) → 400', async () => {
        prisma.persona.create.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated', { code: 'P2003', clientVersion: 'test' }),
        );

        await expect(altaPersona(1)).rejects.toMatchObject({ statusCode: 400, message: MENSAJE_JEFE_INEXISTENTE });
    });

    test('sin jefe → alta normal sin consultar familia', async () => {
        await altaPersona();

        expect(prisma.persona.create).toHaveBeenCalledWith({ data: expect.not.objectContaining({ jefeDeFamiliaId: expect.anything() }) });
        expect(prisma.persona.count).not.toHaveBeenCalled();
    });
});

describe('alta de miembro familiar (POST /personas/:id/grupo-familiar/miembros)', () => {
    test('titular normal → se crea el miembro', async () => {
        await expect(altaMiembro(1)).resolves.toEqual(expect.objectContaining({ id: 4 }));
        expect(jefes[4]).toBe(1);
    });

    test('un miembro no puede tener miembros (no hay familias anidadas) → 409 sin crear', async () => {
        await expect(altaMiembro(2)).rejects.toMatchObject({ statusCode: 409, message: MENSAJE_JEFE_ES_MIEMBRO });
        expect(prisma.persona.create).not.toHaveBeenCalled();
    });
});

describe('invariantes del helper central (assertJefeDeFamiliaAsignable)', () => {
    test('nadie es su propio jefe → 400', async () => {
        await expect(assertJefeDeFamiliaAsignable(3, 3)).rejects.toMatchObject({ statusCode: 400, message: MENSAJE_JEFE_PROPIO });
    });

    test('un titular con miembros no puede pasar a ser miembro → 409', async () => {
        await expect(assertJefeDeFamiliaAsignable(3, 1)).rejects.toMatchObject({
            statusCode: 409, message: MENSAJE_TITULAR_NO_PUEDE_SER_MIEMBRO,
        });
    });

    test('ciclo A↔B: B ya es miembro de A, A no puede pasar a ser miembro de B → 409', async () => {
        await expect(assertJefeDeFamiliaAsignable(2, 1)).rejects.toMatchObject({ statusCode: 409 });
    });

    test('persona sin familia con jefe titular válido → permitido', async () => {
        await expect(assertJefeDeFamiliaAsignable(1, 3)).resolves.toBeUndefined();
    });
});

describe('PUT /personas no modifica el jefe de familia', () => {
    test('jefeDeFamiliaId en el update se ignora: no hay reasignación, segundo jefe ni ciclo', async () => {
        prisma.persona.update.mockImplementation(async ({ where }: { where: { id: number } }) => personaRow(where.id));

        await updatePersona(1, { nombre: 'Titular', jefeDeFamiliaId: 2 });

        const { data } = prisma.persona.update.mock.calls[0][0];
        expect(data).not.toHaveProperty('jefeDeFamiliaId');
        expect(data).not.toHaveProperty('jefeDeFamilia');
        expect(jefes[1]).toBeNull();
    });
});
