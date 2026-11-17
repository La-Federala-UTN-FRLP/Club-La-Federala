// Prioridades: invariante "un lote tiene como máximo UNA prioridad ACTIVA" bajo concurrencia real
// (PostgreSQL real, services reales).
//
// Barreras:
// - índice único parcial "Prioridad_loteId_activa_key" (loteId WHERE estado = 'ACTIVA');
// - alta: INSERT de la prioridad y después UPDATE del lote condicionado al estado validado;
// - cierre (cancelar/finalizar/expirar): UPDATE de la prioridad condicionado a ACTIVA y después
//   UPDATE del lote condicionado a CON_PRIORIDAD, en la misma transacción.
//
// Los interleavings se fuerzan sin sleeps: una transacción "bloqueadora" retiene la fila del lote;
// la operación bajo prueba queda esperando ese lock (se detecta en pg_stat_activity) y recién
// entonces se libera.
import { cancelPrioridad, createPrioridad, expirePrioridadesVencidas, finalizePrioridad, MENSAJE_PRIORIDAD_ACTIVA_EXISTENTE } from '../../src/services/prioridad.service';
import {
    bloquearLote, crearLote, esperarBloqueados, estadoLote, prioridadesActivas, prisma, resetDb, resultado, retenerLock,
} from './support/db';

const ADMIN = { role: 'ADMINISTRADOR' };
const DIA = 24 * 60 * 60 * 1000;
const ahora = Date.now();
const enDias = (d: number) => new Date(ahora + d * DIA);

let numero = 0;
const alta = (loteId: number, finEnDias = 30) =>
    createPrioridad(
        { numero: `P-${++numero}`, loteId, fechaInicio: new Date(ahora - DIA).toISOString(), fechaFin: enDias(finEnDias).toISOString() },
        ADMIN,
    );

beforeEach(async () => {
    await resetDb();
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe('la base garantiza una sola ACTIVA por lote', () => {
    test('un segundo INSERT ACTIVA para el mismo lote falla; CANCELADA/otros lotes no', async () => {
        const lote = await crearLote();
        const otro = await crearLote();
        const base = { loteId: lote.id, ownerType: 'CCLF' as const, fechaFin: enDias(5) };

        await prisma.prioridad.create({ data: { ...base, numero: 'X-1' } });
        const segunda = await resultado(prisma.prioridad.create({ data: { ...base, numero: 'X-2' } }));
        expect(segunda.ok).toBe(false);
        expect((segunda as any).error.code).toBe('P2002');

        await expect(prisma.prioridad.create({ data: { ...base, numero: 'X-3', estado: 'CANCELADA' } })).resolves.toBeDefined();
        await expect(prisma.prioridad.create({ data: { ...base, numero: 'X-4', loteId: otro.id } })).resolves.toBeDefined();
    });
});

describe('alta A vs alta B (mismo lote)', () => {
    test('las dos pasan la validación, la base deja entrar a una sola: la otra recibe 409', async () => {
        const lote = await crearLote();
        const bloqueo = retenerLock(bloquearLote(lote.id));
        await bloqueo.tomado;

        // A inserta y espera el lock del lote; B pasó la validación (A no confirmó) y espera el índice.
        const a = resultado(alta(lote.id));
        const b = resultado(alta(lote.id));
        await esperarBloqueados(2);
        bloqueo.liberar();
        await bloqueo.terminado;

        const resultados = await Promise.all([a, b]);
        const ok = resultados.filter((r) => r.ok);
        const fallidos = resultados.filter((r) => !r.ok) as Array<{ ok: false; error: any }>;
        expect(ok).toHaveLength(1);
        expect(fallidos).toHaveLength(1);
        expect(fallidos[0].error).toMatchObject({ status: 409, message: MENSAJE_PRIORIDAD_ACTIVA_EXISTENTE });
        expect(await prioridadesActivas(lote.id)).toHaveLength(1);
        expect(await prisma.prioridad.count({ where: { loteId: lote.id } })).toBe(1); // el perdedor no dejó filas
        expect(await estadoLote(lote.id)).toBe('CON_PRIORIDAD');
    });

    test('diez altas simultáneas: exactamente una gana', async () => {
        const lote = await crearLote();

        const resultados = await Promise.all(Array.from({ length: 10 }, () => resultado(alta(lote.id))));

        expect(resultados.filter((r) => r.ok)).toHaveLength(1);
        for (const r of resultados.filter((x) => !x.ok) as Array<{ ok: false; error: any }>) {
            expect(r.error.status).toBe(409);
        }
        expect(await prioridadesActivas(lote.id)).toHaveLength(1);
        expect(await estadoLote(lote.id)).toBe('CON_PRIORIDAD');
    });
});

const CIERRES = [
    ['cancelar', (id: number) => cancelPrioridad(id, ADMIN), 'CANCELADA'],
    ['finalizar', (id: number) => finalizePrioridad(id, ADMIN), 'FINALIZADA'],
    ['expirar', async (_id: number) => expirePrioridadesVencidas(enDias(2)), 'EXPIRADA'],
] as const;

describe.each(CIERRES)('%s A vs alta B', (_nombre, cerrar, estadoFinal) => {
    test('con el cierre de A en curso, B no entra; cuando A confirma, el lote se restaura una vez y B puede entrar', async () => {
        const lote = await crearLote();
        const a = await alta(lote.id, 1); // vence en 1 día (para expirar con now = +2 días)

        const bloqueo = retenerLock(bloquearLote(lote.id));
        await bloqueo.tomado;
        const cierre = resultado(cerrar(a.id));
        await esperarBloqueados(1); // A ya salió de ACTIVA (sin confirmar) y espera el lock del lote

        // B ve el lote CON_PRIORIDAD (A no confirmó): no entra.
        const bDurante = await resultado(alta(lote.id));
        expect(bDurante.ok).toBe(false);
        expect((bDurante as any).error.status).toBe(409);

        bloqueo.liberar();
        await bloqueo.terminado;
        expect((await cierre).ok).toBe(true);
        expect((await prisma.prioridad.findUnique({ where: { id: a.id } }))?.estado).toBe(estadoFinal);
        expect(await estadoLote(lote.id)).toBe('DISPONIBLE');

        const b = await alta(lote.id);
        expect(b.estado).toBe('ACTIVA');
        expect(await prioridadesActivas(lote.id)).toEqual([expect.objectContaining({ id: b.id })]);
        expect(await estadoLote(lote.id)).toBe('CON_PRIORIDAD');
    });

    test('un cierre tardío de A con B ya ACTIVA no libera el lote ni pisa estados', async () => {
        const lote = await crearLote();
        const a = await alta(lote.id, 1);
        await cerrar(a.id); // A cerrada, lote restaurado
        const b = await alta(lote.id, 30); // B ACTIVA, lote CON_PRIORIDAD

        // Reintento tardío del mismo cierre sobre A (o una corrida del job): no hace nada.
        const tardio = await resultado(cerrar(a.id));
        if (_nombre === 'expirar') expect(tardio).toEqual({ ok: true, value: { expired: 0 } });
        else expect((tardio as any).error.status).toBe(400);

        expect((await prisma.prioridad.findUnique({ where: { id: a.id } }))?.estado).toBe(estadoFinal);
        expect((await prisma.prioridad.findUnique({ where: { id: b.id } }))?.estado).toBe('ACTIVA');
        expect(await estadoLote(lote.id)).toBe('CON_PRIORIDAD');
    });
});

describe('cierres concurrentes de la misma prioridad', () => {
    test('cancelar, finalizar y expirar a la vez: gana uno y el lote se restaura una sola vez', async () => {
        const lote = await crearLote('EN_PROMOCION');
        const a = await alta(lote.id, 1);

        const resultados = await Promise.all([
            resultado(cancelPrioridad(a.id, ADMIN)),
            resultado(finalizePrioridad(a.id, ADMIN)),
            resultado(expirePrioridadesVencidas(enDias(2))),
        ]);

        const ganadores = resultados.filter((r) => r.ok && !(r.value && 'expired' in (r.value as object) && (r.value as any).expired === 0));
        expect(ganadores).toHaveLength(1);
        expect(['CANCELADA', 'FINALIZADA', 'EXPIRADA']).toContain((await prisma.prioridad.findUnique({ where: { id: a.id } }))?.estado);
        expect(await estadoLote(lote.id)).toBe('EN_PROMOCION');
    });
});

describe('alta con el lote cambiando entre la validación y la escritura', () => {
    test('el lote pasa a RESERVADO antes de que el alta lo marque: 409 y no queda la prioridad', async () => {
        const lote = await crearLote();
        const bloqueo = retenerLock(bloquearLote(lote.id), (tx) =>
            tx.lote.update({ where: { id: lote.id }, data: { estado: 'RESERVADO' } }),
        );
        await bloqueo.tomado;

        const b = resultado(alta(lote.id)); // validó DISPONIBLE, insertó y espera el lock del lote
        await esperarBloqueados(1);
        bloqueo.liberar();
        await bloqueo.terminado;

        const r = await b;
        expect(r.ok).toBe(false);
        expect((r as any).error.status).toBe(409);
        expect(await prisma.prioridad.count({ where: { loteId: lote.id } })).toBe(0);
        expect(await estadoLote(lote.id)).toBe('RESERVADO');
    });
});
