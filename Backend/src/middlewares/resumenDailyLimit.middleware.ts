import type { Request, Response, NextFunction } from 'express';
import { fechaCorte, inicioDiaNegocio } from '../services/reporte.service';

// ─────────────────────────────────────────────────────────────────────────────
// Límite diario de POST /api/reportes/resumen (CCLF-37, 40.3): 20 resúmenes por usuario por día.
//
//  · Key: req.user.id (va después de authenticate). No depende de la IP: la identidad por IP no
//    está validada en Cloud Run (AI-042, C1 bloqueado) y el resumen siempre tiene usuario.
//  · Día: día calendario de Buenos Aires (fechaCorte), el mismo de los reportes. El cupo se
//    reinicia a las 00:00 de Argentina; el 429 informa en Retry-After los segundos que faltan.
//  · Qué cuenta: cada pedido que llega a la IA, salga bien o mal (también un 502). Va después de la
//    validación del body, así un 400 no consume cupo. Si fallan los reportes antes de llamar a la IA,
//    el controller devuelve el cupo con liberarCupoResumen.
//  · Store: en memoria, por proceso. Se pierde al reiniciar y no se comparte entre instancias ni
//    revisiones: con N instancias el máximo real es 20 × N. Es la misma limitación del rate limit
//    del login (MemoryStore, AI-042); alcanza para acotar costo y abuso en el uso previsto.
// ─────────────────────────────────────────────────────────────────────────────

export const RESUMEN_LIMITE_DIARIO = 20;

const MS_POR_DIA = 86_400_000;
const LIBERAR_CUPO = 'liberarCupoResumen';

/** Segundos desde `ahora` hasta las 00:00 del día siguiente en Buenos Aires (mínimo 1). */
export function segundosHastaManana(ahora: Date): number {
    const manana = new Date(Date.parse(fechaCorte(ahora)) + MS_POR_DIA).toISOString().slice(0, 10);
    return Math.max(1, Math.ceil((inicioDiaNegocio(manana).getTime() - ahora.getTime()) / 1000));
}

export interface ResumenDailyLimitOptions {
    limite?: number;
    ahora?: () => Date;
}

export function createResumenDailyLimit({ limite = RESUMEN_LIMITE_DIARIO, ahora = () => new Date() }: ResumenDailyLimitOptions = {}) {
    // Solo se guardan los contadores del día en curso: al cambiar de día se vacía todo.
    let dia = '';
    const usados = new Map<number, number>();

    function resumenDailyLimit(req: Request, res: Response, next: NextFunction) {
        const userId = req.user?.id;
        if (userId == null) return next(new Error('resumenDailyLimit requiere authenticate antes en la ruta'));

        const instante = ahora();
        const hoy = fechaCorte(instante);
        if (hoy !== dia) {
            usados.clear();
            dia = hoy;
        }

        const cantidad = usados.get(userId) ?? 0;
        if (cantidad >= limite) {
            // Ruta fija: sin id de usuario, body ni query.
            console.warn('[RATE_LIMIT] 429 POST /api/reportes/resumen');
            res.setHeader('Retry-After', String(segundosHastaManana(instante)));
            return res.status(429).json({
                success: false,
                code: 'TOO_MANY_REQUESTS',
                message: `Alcanzaste el límite de ${limite} resúmenes por día. Podés volver a pedirlo mañana.`,
            });
        }

        // Se reserva antes de seguir: dos pedidos simultáneos no pueden pasar el límite.
        usados.set(userId, cantidad + 1);
        let liberado = false;
        res.locals[LIBERAR_CUPO] = () => {
            if (liberado || dia !== hoy) return;
            liberado = true;
            const actual = usados.get(userId) ?? 0;
            if (actual > 0) usados.set(userId, actual - 1);
        };
        next();
    }

    return Object.assign(resumenDailyLimit, {
        /** Vacía los contadores (tests). */
        reset() {
            usados.clear();
            dia = '';
        },
    });
}

/** Devuelve el cupo reservado por el límite diario para este pedido (si lo hay). Idempotente. */
export function liberarCupoResumen(res: Response): void {
    const liberar = res.locals[LIBERAR_CUPO] as (() => void) | undefined;
    liberar?.();
}

export const resumenDailyLimit = createResumenDailyLimit();
