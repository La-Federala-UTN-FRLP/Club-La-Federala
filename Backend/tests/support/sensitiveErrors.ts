/**
 * Errores artificiales con contenido que nunca debe salir por HTTP, y la aserción que lo verifica.
 *
 * Contrato de un error inesperado (no de dominio): 500 con un mensaje público genérico, sin el
 * mensaje interno, sin stack, sin metadata del provider (Prisma/Supabase) y sin el objeto error.
 * El detalle puede ir al log del servidor; nunca a la respuesta.
 */
import type request from 'supertest';

export const SENSITIVE_MARKER = 'SECRET-MARKER-c41e';
export const SENSITIVE_META_MARKER = 'PROVIDER-META-5d02';
export const SENSITIVE_DSN = 'postgres://admin:hunter2@10.0.0.5:5432/federala';

/** Error tipo "DB caída" con marcadores en mensaje, código, versión y meta. */
export function errorSensible(mensajeExtra = ''): Error {
    const err = new Error(`${SENSITIVE_MARKER} ${SENSITIVE_DSN} ${mensajeExtra}`.trim());
    Object.assign(err, {
        code: 'P1001',
        clientVersion: '6.18.0',
        meta: { provider: 'postgres', detail: SENSITIVE_META_MARKER },
    });
    return err;
}

/** Textos que delatan detalle interno si aparecen en la respuesta. */
export const TEXTOS_SENSIBLES = [
    SENSITIVE_MARKER,
    SENSITIVE_META_MARKER,
    SENSITIVE_DSN,
    'hunter2',
    'P1001',
    'clientVersion',
];

/** Afirma que la respuesta no contiene ninguno de los textos dados (body y texto crudo). */
export function expectSinTextos(res: request.Response, textos: readonly string[]): void {
    const texto = JSON.stringify(res.body ?? null) + (res.text ?? '');
    for (const sensible of textos) {
        expect(texto).not.toContain(sensible);
    }
}

/** Contrato completo de un error inesperado: 500, mensaje genérico y nada interno. */
export function expectRespuestaSegura500(res: request.Response, err: Error): void {
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe('string');
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body).not.toHaveProperty('meta');
    expectSinTextos(res, TEXTOS_SENSIBLES);
    const primerFrame = (err.stack ?? '').split('\n')[1]?.trim();
    if (primerFrame) expectSinTextos(res, [primerFrame]);
}
