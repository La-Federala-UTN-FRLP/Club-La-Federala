// Borrado definitivo de Persona contra altas concurrentes que la referencian (PostgreSQL real,
// services reales).
//
// La FK de co-compra (_VentaCompradores → Persona) es ON DELETE CASCADE y la de miembro familiar es
// SET NULL: si el borrado llegara a ejecutarse, se llevaría (o desarmaría) en silencio una relación
// creada después de contar. El borrado bloquea primero la fila de la persona (FOR UPDATE); toda alta
// que la referencie verifica su FK con FOR KEY SHARE sobre esa fila, así que se serializan:
// - alta primero → el borrado espera, cuenta la relación nueva y responde 409;
// - borrado primero → el alta espera y después falla por FK; la persona no se borró con relaciones.
import {
    createPersona,
    deletePersonaDefinitivo,
    eliminarMiembroFamiliar,
    MENSAJE_JEFE_ES_MIEMBRO,
    MENSAJE_PERSONA_CON_ASOCIACIONES,
    MENSAJE_TITULAR_CON_MIEMBROS,
} from '../../src/services/persona.service';
import { crearLote, crearPersona, esperarBloqueados, prisma, resetDb, resultado, retenerLock } from './support/db';

let numeroVenta = 0;
async function crearVenta(compradorId: number) {
    const lote = await crearLote();
    return prisma.venta.create({
        data: { numero: `V-${++numeroVenta}`, loteId: lote.id, fechaVenta: new Date(), monto: 1000, tipoPago: 'CONTADO', compradorId },
    });
}

async function coCompradores(ventaId: number): Promise<number[]> {
    const venta = await prisma.venta.findUnique({ where: { id: ventaId }, select: { compradores: { select: { id: true } } } });
    return (venta?.compradores ?? []).map((c) => c.id);
}

beforeEach(async () => {
    await resetDb();
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe('DELETE persona vs alta concurrente como co-compradora', () => {
    test('la co-compra se agrega mientras el borrado está en curso → 409 y la co-compra se conserva', async () => {
        const principal = await crearPersona();
        const x = await crearPersona();
        const venta = await crearVenta(principal.id);

        // Alta de la co-compra sin confirmar (su FK tomó FOR KEY SHARE sobre la persona).
        const alta = retenerLock((tx) =>
            tx.venta.update({ where: { id: venta.id }, data: { compradores: { connect: { id: x.id } } } }),
        );
        await alta.tomado;

        const borrado = resultado(deletePersonaDefinitivo(x.id));
        await esperarBloqueados(1); // el FOR UPDATE del borrado espera a la co-compra
        alta.liberar();
        await alta.terminado;

        const r = await borrado;
        expect(r.ok).toBe(false);
        expect((r as any).error).toMatchObject({ statusCode: 409, message: MENSAJE_PERSONA_CON_ASOCIACIONES });
        expect(await prisma.persona.findUnique({ where: { id: x.id } })).not.toBeNull();
        expect(await coCompradores(venta.id)).toEqual([x.id]);
    });

    test('el borrado llega primero → la co-compra concurrente falla y no se pierde ninguna relación', async () => {
        const principal = await crearPersona();
        const x = await crearPersona();
        const venta = await crearVenta(principal.id);

        // Misma secuencia que el borrado transaccional: FOR UPDATE, (conteo = 0) y DELETE al confirmar.
        const borrado = retenerLock(
            (tx) => tx.$queryRaw`SELECT "id" FROM "Persona" WHERE "id" = ${x.id} FOR UPDATE`,
            (tx) => tx.persona.delete({ where: { id: x.id } }),
        );
        await borrado.tomado;

        const coCompra = resultado(prisma.venta.update({ where: { id: venta.id }, data: { compradores: { connect: { id: x.id } } } }));
        await esperarBloqueados(1); // la FK de la co-compra espera el lock de la persona
        borrado.liberar();
        await borrado.terminado;

        expect((await coCompra).ok).toBe(false);
        expect(await coCompradores(venta.id)).toEqual([]);
    });

    test('co-compradora ya existente → 409', async () => {
        const principal = await crearPersona();
        const x = await crearPersona();
        const venta = await crearVenta(principal.id);
        await prisma.venta.update({ where: { id: venta.id }, data: { compradores: { connect: { id: x.id } } } });

        await expect(deletePersonaDefinitivo(x.id)).rejects.toMatchObject({ statusCode: 409 });
        expect(await coCompradores(venta.id)).toEqual([x.id]);
    });

    test('sin relaciones → se borra', async () => {
        const x = await crearPersona();

        await expect(deletePersonaDefinitivo(x.id)).resolves.toEqual({ message: 'Persona eliminada definitivamente' });
        expect(await prisma.persona.findUnique({ where: { id: x.id } })).toBeNull();
    });
});

describe('grupo familiar (modelo plano) contra la base real', () => {
    test('DELETE titular mientras se agrega un miembro → 409 y la familia queda intacta', async () => {
        const titular = await crearPersona();

        const alta = retenerLock((tx) => tx.persona.create({
            data: { identificadorTipo: 'DNI', identificadorValor: '45000001', updateAt: new Date(), jefeDeFamiliaId: titular.id },
        }));
        await alta.tomado;

        const borrado = resultado(deletePersonaDefinitivo(titular.id));
        await esperarBloqueados(1);
        alta.liberar();
        await alta.terminado;

        const r = await borrado;
        expect((r as any).error).toMatchObject({ statusCode: 409, message: MENSAJE_TITULAR_CON_MIEMBROS });
        expect(await prisma.persona.count({ where: { jefeDeFamiliaId: titular.id } })).toBe(1);
    });

    test('no se puede armar una cadena A → B → C', async () => {
        const a = await crearPersona();
        const b = await crearPersona({ jefeDeFamiliaId: a.id });

        await expect(
            createPersona({ identificadorTipo: 'DNI' as never, identificadorValor: '45000002', nombre: 'C', apellido: 'Test', jefeDeFamiliaId: b.id }, { role: 'ADMINISTRADOR' }),
        ).rejects.toMatchObject({ statusCode: 409, message: MENSAJE_JEFE_ES_MIEMBRO });
        expect(await prisma.persona.count({ where: { jefeDeFamiliaId: b.id } })).toBe(0);
    });

    test('miembro sin otras asociaciones se borra; miembro co-comprador → 409', async () => {
        const titular = await crearPersona();
        const libre = await crearPersona({ jefeDeFamiliaId: titular.id, categoria: 'MIEMBRO_FAMILIAR' });
        const coComprador = await crearPersona({ jefeDeFamiliaId: titular.id, categoria: 'MIEMBRO_FAMILIAR' });
        const venta = await crearVenta(titular.id);
        await prisma.venta.update({ where: { id: venta.id }, data: { compradores: { connect: { id: coComprador.id } } } });

        await expect(eliminarMiembroFamiliar(titular.id, libre.id)).resolves.toEqual({ success: true });
        await expect(eliminarMiembroFamiliar(titular.id, coComprador.id)).rejects.toMatchObject({ statusCode: 409 });
        expect(await coCompradores(venta.id)).toEqual([coComprador.id]);
    });
});
