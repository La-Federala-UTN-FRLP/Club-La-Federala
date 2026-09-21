import {
    assertCamposObligatoriosPorEstado,
    assertTransicionEstadoValida,
    assertVentaEliminable,
} from '../../../src/domain/ventaState/ventaState.rules';
import {
    ESTADO_COBRO,
    ESTADO_VENTA,
    isEstadoCancelada,
    isEstadoEscriturado,
    isEstadoPagoCompleto,
    isVentaFinalizada,
    type VentaStateData,
} from '../../../src/domain/ventaState/ventaState.types';
import type { EstadoCobro, EstadoVenta } from '../../../src/generated/prisma';

function venta(overrides: Partial<VentaStateData> = {}): VentaStateData {
    return {
        estado: ESTADO_VENTA.INICIADA,
        estadoCobro: ESTADO_COBRO.PENDIENTE,
        ...overrides,
    };
}

function expectStatus(fn: () => void, status: number) {
    let thrown: unknown;
    try {
        fn();
    } catch (error) {
        thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(thrown).toEqual(expect.objectContaining({ status }));
}

describe('helpers de estado de venta', () => {
    test('isEstadoEscriturado solo reconoce ESCRITURADO', () => {
        expect(isEstadoEscriturado(ESTADO_VENTA.ESCRITURADO)).toBe(true);
        expect(isEstadoEscriturado(ESTADO_VENTA.CON_BOLETO)).toBe(false);
    });

    test('isEstadoCancelada solo reconoce CANCELADA', () => {
        expect(isEstadoCancelada(ESTADO_VENTA.CANCELADA)).toBe(true);
        expect(isEstadoCancelada(ESTADO_VENTA.INICIADA)).toBe(false);
    });

    test('isEstadoPagoCompleto solo reconoce PAGO_COMPLETO', () => {
        expect(isEstadoPagoCompleto(ESTADO_COBRO.PAGO_COMPLETO)).toBe(true);
        expect(isEstadoPagoCompleto(ESTADO_COBRO.EN_CURSO)).toBe(false);
    });

    test('venta finalizada requiere ESCRITURADO y PAGO_COMPLETO a la vez', () => {
        expect(
            isVentaFinalizada(
                venta({
                    estado: ESTADO_VENTA.ESCRITURADO,
                    estadoCobro: ESTADO_COBRO.PAGO_COMPLETO,
                }),
            ),
        ).toBe(true);
    });

    test('ESCRITURADO sin cobro completo no está finalizada', () => {
        expect(
            isVentaFinalizada(
                venta({
                    estado: ESTADO_VENTA.ESCRITURADO,
                    estadoCobro: ESTADO_COBRO.EN_CURSO,
                }),
            ),
        ).toBe(false);
    });

    test('PAGO_COMPLETO en un estado distinto de ESCRITURADO no finaliza la venta', () => {
        expect(
            isVentaFinalizada(
                venta({
                    estado: ESTADO_VENTA.CON_BOLETO,
                    estadoCobro: ESTADO_COBRO.PAGO_COMPLETO,
                }),
            ),
        ).toBe(false);
    });
});

describe('assertTransicionEstadoValida', () => {
    test.each<[EstadoVenta]>([
        [ESTADO_VENTA.INICIADA],
        [ESTADO_VENTA.CON_BOLETO],
        [ESTADO_VENTA.ESCRITURADO],
        [ESTADO_VENTA.CANCELADA],
    ])('permanecer en %s es siempre válido', (estado) => {
        expect(() => assertTransicionEstadoValida(estado, estado)).not.toThrow();
    });

    test.each<[EstadoVenta]>([
        [ESTADO_VENTA.CON_BOLETO],
        [ESTADO_VENTA.ESCRITURADO],
        [ESTADO_VENTA.CANCELADA],
    ])('desde INICIADA permite pasar a %s', (destino) => {
        expect(() =>
            assertTransicionEstadoValida(ESTADO_VENTA.INICIADA, destino),
        ).not.toThrow();
    });

    test.each<[EstadoVenta]>([[ESTADO_VENTA.ESCRITURADO], [ESTADO_VENTA.CANCELADA]])(
        'desde CON_BOLETO permite pasar a %s',
        (destino) => {
            expect(() =>
                assertTransicionEstadoValida(ESTADO_VENTA.CON_BOLETO, destino),
            ).not.toThrow();
        },
    );

    test('desde CON_BOLETO no se puede volver a INICIADA', () => {
        expectStatus(
            () =>
                assertTransicionEstadoValida(ESTADO_VENTA.CON_BOLETO, ESTADO_VENTA.INICIADA),
            400,
        );
    });

    test.each<[EstadoVenta]>([
        [ESTADO_VENTA.INICIADA],
        [ESTADO_VENTA.CON_BOLETO],
        [ESTADO_VENTA.CANCELADA],
    ])('desde ESCRITURADO no permite transicionar a %s', (destino) => {
        expectStatus(
            () => assertTransicionEstadoValida(ESTADO_VENTA.ESCRITURADO, destino),
            400,
        );
    });

    test.each<[EstadoVenta]>([
        [ESTADO_VENTA.INICIADA],
        [ESTADO_VENTA.CON_BOLETO],
        [ESTADO_VENTA.ESCRITURADO],
    ])('desde CANCELADA no permite transicionar a %s', (destino) => {
        expectStatus(
            () => assertTransicionEstadoValida(ESTADO_VENTA.CANCELADA, destino),
            400,
        );
    });
});

describe('assertVentaEliminable', () => {
    test('CANCELADA se puede eliminar aunque el cobro no esté completo', () => {
        expect(() =>
            assertVentaEliminable(
                venta({
                    estado: ESTADO_VENTA.CANCELADA,
                    estadoCobro: ESTADO_COBRO.PENDIENTE,
                }),
            ),
        ).not.toThrow();
    });

    test('ESCRITURADO + PAGO_COMPLETO se puede eliminar por estar finalizada', () => {
        expect(() =>
            assertVentaEliminable(
                venta({
                    estado: ESTADO_VENTA.ESCRITURADO,
                    estadoCobro: ESTADO_COBRO.PAGO_COMPLETO,
                }),
            ),
        ).not.toThrow();
    });

    test('ESCRITURADO sin pago completo no se puede eliminar (409)', () => {
        expectStatus(
            () =>
                assertVentaEliminable(
                    venta({
                        estado: ESTADO_VENTA.ESCRITURADO,
                        estadoCobro: ESTADO_COBRO.EN_CURSO,
                    }),
                ),
            409,
        );
    });

    test.each<[EstadoVenta, EstadoCobro]>([
        [ESTADO_VENTA.INICIADA, ESTADO_COBRO.PENDIENTE],
        [ESTADO_VENTA.CON_BOLETO, ESTADO_COBRO.EN_CURSO],
    ])('%s no es eliminable (409)', (estado, estadoCobro) => {
        expectStatus(() => assertVentaEliminable(venta({ estado, estadoCobro })), 409);
    });
});

describe('assertCamposObligatoriosPorEstado', () => {
    test('ESCRITURADO exige fechaEscrituraReal', () => {
        expect(() =>
            assertCamposObligatoriosPorEstado(ESTADO_VENTA.ESCRITURADO, {
                fechaEscrituraReal: new Date(2026, 2, 15),
            }),
        ).not.toThrow();
    });

    test('ESCRITURADO sin fechaEscrituraReal falla con 400', () => {
        expectStatus(
            () => assertCamposObligatoriosPorEstado(ESTADO_VENTA.ESCRITURADO, {}),
            400,
        );
    });

    test('CANCELADA exige fecha y motivo de cancelación', () => {
        expect(() =>
            assertCamposObligatoriosPorEstado(ESTADO_VENTA.CANCELADA, {
                fechaCancelacion: new Date(2026, 4, 1),
                motivoCancelacion: 'Desistimiento del comprador',
            }),
        ).not.toThrow();
    });

    test('CANCELADA sin fecha falla con 400', () => {
        expectStatus(
            () =>
                assertCamposObligatoriosPorEstado(ESTADO_VENTA.CANCELADA, {
                    motivoCancelacion: 'Desistimiento',
                }),
            400,
        );
    });

    test('CANCELADA sin motivo falla con 400', () => {
        expectStatus(
            () =>
                assertCamposObligatoriosPorEstado(ESTADO_VENTA.CANCELADA, {
                    fechaCancelacion: new Date(2026, 4, 1),
                }),
            400,
        );
    });

    test.each(['', '   '])(
        'CANCELADA con motivo vacío o solo espacios (%j) falla con 400',
        (motivoCancelacion) => {
            expectStatus(
                () =>
                    assertCamposObligatoriosPorEstado(ESTADO_VENTA.CANCELADA, {
                        fechaCancelacion: new Date(2026, 4, 1),
                        motivoCancelacion,
                    }),
                400,
            );
        },
    );

    test('INICIADA no exige campos de escritura ni cancelación', () => {
        expect(() =>
            assertCamposObligatoriosPorEstado(ESTADO_VENTA.INICIADA, {}),
        ).not.toThrow();
    });
});
