// Personas — reservas del cliente para INMOBILIARIA (service real, Prisma mockeado).
//
// Antes: en el listado (view MIS_CLIENTES), INMOBILIARIA recibía _count.Reserva y _count.Venta con
// las reservas y ventas del cliente en TODAS las inmobiliarias (actividad ajena) y reservas: [] (la
// relación no se incluía). El detalle mostraba "Reservas (8)" y, al abrirlo, "Sin reservas".
// Ahora: la lista y el conteo de reservas, y el conteo de ventas, se filtran por la inmobiliaria del
// usuario. ADMINISTRADOR (y el resto de los roles) mantiene la consulta sin cambios.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        persona: { findMany: jest.fn(), count: jest.fn() },
    },
}));

import prismaReal from '../../../src/config/prisma';
import { getAllPersonas } from '../../../src/services/persona.service';

type Mock = jest.Mock;
const prisma = prismaReal as unknown as {
    persona: { findMany: Mock; count: Mock };
};

const ADMIN = { role: 'ADMINISTRADOR' };
const INMO_A = { role: 'INMOBILIARIA', inmobiliariaId: 7 };
const INMO_B = { role: 'INMOBILIARIA', inmobiliariaId: 9 };

const consulta = () => prisma.persona.findMany.mock.calls[0][0];

// Cliente de la inmobiliaria A con reservas en A y en otras inmobiliarias. Prisma, con el filtro de
// la consulta, devuelve solo las de A en la lista y en el conteo.
const clienteDeA = {
    id: 23,
    nombre: 'ClienteA',
    apellido: 'QA',
    razonSocial: null,
    identificadorTipo: 'DNI',
    identificadorValor: '90000002',
    email: null,
    contacto: null,
    estadoOperativo: 'OPERATIVO',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    inmobiliariaId: 7,
    inmobiliaria: { id: 7, nombre: 'Inmobiliaria A' },
    jefeDeFamiliaId: null,
    jefeDeFamilia: null,
    miembrosFamilia: [],
    alquileres: [],
    _count: { lotesPropios: 0, lotesAlquilados: 0, alquileres: 0, Reserva: 2, Venta: 0 },
    Reserva: [
        { id: 31, numero: 'RES-31', createdAt: new Date('2026-11-20T00:00:00Z'), loteId: 5 },
        { id: 30, numero: 'RES-30', createdAt: new Date('2026-11-10T00:00:00Z'), loteId: 4 },
    ],
};

beforeEach(() => {
    jest.clearAllMocks();
    prisma.persona.findMany.mockResolvedValue([]);
    prisma.persona.count.mockResolvedValue(0);
});

describe('getAllPersonas — reservas del cliente para INMOBILIARIA', () => {
    test('INMOBILIARIA A: la lista de reservas se filtra por su inmobiliaria', async () => {
        await getAllPersonas(INMO_A, {});

        expect(consulta().include.Reserva).toEqual({
            where: { inmobiliariaId: 7 },
            select: { id: true, numero: true, createdAt: true, loteId: true },
            take: 10,
            orderBy: { createdAt: 'desc' },
        });
    });

    test('INMOBILIARIA A: el conteo de reservas y de ventas no incluye las de otras inmobiliarias', async () => {
        await getAllPersonas(INMO_A, {});

        const conteo = consulta().include._count.select;
        expect(conteo.Reserva).toEqual({ where: { inmobiliariaId: 7 } });
        expect(conteo.Venta).toEqual({ where: { inmobiliariaId: 7 } });
        // Propietario e inquilino no cambian.
        expect(conteo.lotesPropios).toBe(true);
        expect(conteo.alquileres).toBe(true);
    });

    test('INMOBILIARIA A: la respuesta trae sus reservas con la cantidad correcta', async () => {
        prisma.persona.findMany.mockResolvedValue([clienteDeA]);
        prisma.persona.count.mockResolvedValue(1);

        const { personas } = await getAllPersonas(INMO_A, {});
        const persona = personas[0] as typeof personas[0] & { reservas: Array<{ id: number }> };

        expect(persona.reservas.map((r) => r.id)).toEqual([31, 30]);
        expect(persona._count?.Reserva).toBe(2);
    });

    test('INMOBILIARIA B: filtra por su propia inmobiliaria, nunca por la de otra', async () => {
        await getAllPersonas(INMO_B, {});

        expect(consulta().include.Reserva.where).toEqual({ inmobiliariaId: 9 });
        expect(consulta().include._count.select.Reserva).toEqual({ where: { inmobiliariaId: 9 } });
    });

    test('ADMINISTRADOR: la consulta del listado no cambia (conteo de todas, sin lista filtrada)', async () => {
        await getAllPersonas(ADMIN, {});

        const { include } = consulta();
        expect(include._count.select.Reserva).toBe(true);
        expect(include._count.select.Venta).toBe(true);
        expect(include.Reserva).toBeUndefined();
    });
});
