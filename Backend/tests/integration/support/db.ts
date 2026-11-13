// Utilidades para tests de integración contra PostgreSQL real.
import prisma from '../../../src/config/prisma';

export { prisma };

/** Vacía todas las tablas de la app (no la de migraciones). */
export async function resetDb(): Promise<void> {
    const tablas = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tablas.length === 0) return;
    const lista = tablas.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

let secuencia = 0;
const siguiente = () => ++secuencia;

export async function crearPersona(extra: Record<string, unknown> = {}) {
    const n = siguiente();
    return prisma.persona.create({
        data: { identificadorTipo: 'DNI', identificadorValor: String(30000000 + n), nombre: `Persona${n}`, apellido: 'Test', updateAt: new Date(), ...extra },
    });
}

export async function crearLote(estado: 'DISPONIBLE' | 'EN_PROMOCION' = 'DISPONIBLE') {
    const n = siguiente();
    const fraccion = await prisma.fraccion.create({ data: { numero: n } });
    const propietario = await crearPersona();
    return prisma.lote.create({ data: { tipo: 'LOTE_VENTA', estado, fraccionId: fraccion.id, propietarioId: propietario.id, numero: n } });
}

export async function estadoLote(id: number): Promise<string | undefined> {
    return (await prisma.lote.findUnique({ where: { id }, select: { estado: true } }))?.estado;
}

export async function prioridadesActivas(loteId: number) {
    return prisma.prioridad.findMany({ where: { loteId, estado: 'ACTIVA' } });
}

/**
 * Espera (sin timers) a que haya al menos `n` backends de esta base bloqueados esperando un lock.
 * Cada iteración es una consulta a pg_stat_activity.
 */
export async function esperarBloqueados(n: number): Promise<void> {
    for (let i = 0; i < 5000; i++) {
        const [{ bloqueados }] = await prisma.$queryRaw<Array<{ bloqueados: bigint }>>`
            SELECT count(*) AS bloqueados FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        if (Number(bloqueados) >= n) return;
    }
    throw new Error(`No se llegó a ${n} backend(s) bloqueado(s)`);
}

/**
 * Transacción que toma un lock y lo retiene hasta que se llama a `liberar()`. Opcionalmente ejecuta
 * `antesDeConfirmar` (con el lock tomado) justo antes de confirmar.
 */
export function retenerLock(
    tomarLock: (tx: typeof prisma) => Promise<unknown>,
    antesDeConfirmar?: (tx: typeof prisma) => Promise<unknown>,
) {
    let liberar!: () => void;
    const liberado = new Promise<void>((resolve) => { liberar = resolve; });
    let avisarTomado!: () => void;
    const tomado = new Promise<void>((resolve) => { avisarTomado = resolve; });

    const terminado = prisma.$transaction(
        async (tx) => {
            await tomarLock(tx as unknown as typeof prisma);
            avisarTomado();
            await liberado;
            if (antesDeConfirmar) await antesDeConfirmar(tx as unknown as typeof prisma);
        },
        { timeout: 60000, maxWait: 60000 },
    );
    return { tomado, liberar, terminado };
}

/** Lock de fila sobre un lote (como el que toma un UPDATE de otra transacción). */
export const bloquearLote = (loteId: number) => (tx: typeof prisma) =>
    tx.$queryRaw`SELECT "id" FROM "Lote" WHERE "id" = ${loteId} FOR UPDATE`;

/** Resultado de una promesa sin que un rechazo corte el test. */
export async function resultado<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: any }> {
    try {
        return { ok: true, value: await p };
    } catch (error) {
        return { ok: false, error };
    }
}
