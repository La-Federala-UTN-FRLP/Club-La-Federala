import {
    createVentaSchema,
    updateVentaSchema,
    getVentaSchema,
    deleteVentaSchema,
    queryVentaSchema,
} from '../../../src/validations/venta.validation';

function buildValidVentaInput(overrides: Record<string, unknown> = {}) {
    return {
        loteId: 1,
        fechaVenta: '2025-12-01T18:00:00.000Z',
        monto: 100_000,
        tipoPago: 'CONTADO',
        compradorId: 10,
        numero: 'VENTA-001',
        ...overrides,
    };
}

function expectFailedAt(
    result: { success: boolean; error?: { issues: { path: readonly PropertyKey[] }[] } },
    path: (string | number)[],
) {
    expect(result.success).toBe(false);
    if (result.success || !result.error) return;
    expect(
        result.error.issues.some((issue) => path.every((p, i) => issue.path[i] === p)),
    ).toBe(true);
}

describe('createVentaSchema', () => {
    test('acepta venta válida con compradorId legacy', () => {
        const result = createVentaSchema.safeParse(
            buildValidVentaInput({ inmobiliariaId: 5, reservaId: 1, estado: 'INICIADA' }),
        );
        expect(result.success).toBe(true);
    });

    test('acepta venta válida con compradores[]', () => {
        const result = createVentaSchema.safeParse(
            buildValidVentaInput({
                compradorId: undefined,
                compradores: [{ personaId: 10 }],
            }),
        );
        expect(result.success).toBe(true);
    });

    test('acepta monto cero', () => {
        const result = createVentaSchema.safeParse(buildValidVentaInput({ monto: 0 }));
        expect(result.success).toBe(true);
    });

    test('acepta reservaId null', () => {
        const result = createVentaSchema.safeParse(buildValidVentaInput({ reservaId: null }));
        expect(result.success).toBe(true);
    });

    test('rechaza venta sin compradorId ni compradores', () => {
        const { compradorId: _, ...sinComprador } = buildValidVentaInput();
        const result = createVentaSchema.safeParse(sinComprador);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('compradores'))).toBe(true);
        }
    });

    test('rechaza sin número de venta', () => {
        const { numero: _, ...rest } = buildValidVentaInput();
        const result = createVentaSchema.safeParse(rest);
        expectFailedAt(result, ['numero']);
    });

    test('rechaza número de venta demasiado corto', () => {
        const result = createVentaSchema.safeParse(buildValidVentaInput({ numero: 'AB' }));
        expectFailedAt(result, ['numero']);
    });

    test('rechaza loteId negativo', () => {
        const result = createVentaSchema.safeParse(buildValidVentaInput({ loteId: -1 }));
        expectFailedAt(result, ['loteId']);
    });

    test('rechaza fecha de venta inválida', () => {
        const result = createVentaSchema.safeParse(
            buildValidVentaInput({ fechaVenta: 'fecha-invalida' }),
        );
        expectFailedAt(result, ['fechaVenta']);
    });

    test('rechaza monto negativo', () => {
        const result = createVentaSchema.safeParse(buildValidVentaInput({ monto: -1 }));
        expectFailedAt(result, ['monto']);
    });

    test('rechaza estado fuera del enum', () => {
        const result = createVentaSchema.safeParse(
            buildValidVentaInput({ estado: 'ESTADO_INVALIDO' }),
        );
        expectFailedAt(result, ['estado']);
    });

    test('rechaza tipoPago vacío', () => {
        const result = createVentaSchema.safeParse(buildValidVentaInput({ tipoPago: '' }));
        expectFailedAt(result, ['tipoPago']);
    });

    test('exige fechaEscrituraReal cuando estado es ESCRITURADO', () => {
        const result = createVentaSchema.safeParse(
            buildValidVentaInput({ estado: 'ESCRITURADO' }),
        );
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('fechaEscrituraReal'))).toBe(
                true,
            );
        }
    });

    test('rechaza CANCELADA en create sin fechaCancelacion', () => {
        const result = createVentaSchema.safeParse(
            buildValidVentaInput({
                estado: 'CANCELADA',
                motivoCancelacion: 'Cancelación válida',
            }),
        );
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('fechaCancelacion'))).toBe(
                true,
            );
        }
    });

    test('exige fecha y motivo cuando estado es CANCELADA', () => {
        const sinMotivo = createVentaSchema.safeParse(
            buildValidVentaInput({
                estado: 'CANCELADA',
                fechaCancelacion: '2025-12-15T18:00:00.000Z',
            }),
        );
        expect(sinMotivo.success).toBe(false);

        const completa = createVentaSchema.safeParse(
            buildValidVentaInput({
                estado: 'CANCELADA',
                fechaCancelacion: '2025-12-15T18:00:00.000Z',
                motivoCancelacion: 'Cliente desistió',
            }),
        );
        expect(completa.success).toBe(true);
    });

    test('acepta estados válidos con campos condicionales requeridos', () => {
        const estados: Array<Record<string, unknown>> = [
            { estado: 'INICIADA' },
            { estado: 'CON_BOLETO' },
            {
                estado: 'ESCRITURADO',
                fechaEscrituraReal: '2025-12-15T18:00:00.000Z',
            },
            {
                estado: 'CANCELADA',
                fechaCancelacion: '2025-12-15T18:00:00.000Z',
                motivoCancelacion: 'Cliente desistió',
            },
        ];

        for (const extra of estados) {
            const result = createVentaSchema.safeParse(buildValidVentaInput(extra));
            expect(result.success).toBe(true);
        }
    });
});

describe('updateVentaSchema', () => {
    test('acepta actualización parcial de monto', () => {
        const result = updateVentaSchema.safeParse({ monto: 150_000 });
        expect(result.success).toBe(true);
    });

    test('rechaza monto negativo', () => {
        const result = updateVentaSchema.safeParse({ monto: -1 });
        expectFailedAt(result, ['monto']);
    });

    test('rechaza compradores como array vacío', () => {
        const result = updateVentaSchema.safeParse({ compradores: [] });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('compradores'))).toBe(true);
        }
    });

    test('exige fechaEscrituraReal al pasar a ESCRITURADO', () => {
        const result = updateVentaSchema.safeParse({ estado: 'ESCRITURADO' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('fechaEscrituraReal'))).toBe(
                true,
            );
        }
    });

    test('rechaza CANCELADA sin fechaCancelacion', () => {
        const result = updateVentaSchema.safeParse({
            estado: 'CANCELADA',
            motivoCancelacion: 'Cliente desistió',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('fechaCancelacion'))).toBe(true);
        }
    });

    test('rechaza CANCELADA sin motivoCancelacion', () => {
        const result = updateVentaSchema.safeParse({
            estado: 'CANCELADA',
            fechaCancelacion: '2025-12-15T18:00:00.000Z',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('motivoCancelacion'))).toBe(
                true,
            );
        }
    });

    test('acepta CANCELADA con fecha y motivo', () => {
        const result = updateVentaSchema.safeParse({
            estado: 'CANCELADA',
            fechaCancelacion: '2025-12-15T18:00:00.000Z',
            motivoCancelacion: 'Cliente desistió',
        });
        expect(result.success).toBe(true);
    });
});

describe('getVentaSchema', () => {
    test('acepta id válido y coerce string', () => {
        expect(getVentaSchema.safeParse({ id: 1 }).success).toBe(true);
        const coerced = getVentaSchema.safeParse({ id: '5' });
        expect(coerced.success).toBe(true);
        if (coerced.success) expect(coerced.data.id).toBe(5);
    });

    test('rechaza id negativo, cero o no entero', () => {
        expect(getVentaSchema.safeParse({ id: -1 }).success).toBe(false);
        expect(getVentaSchema.safeParse({ id: 0 }).success).toBe(false);
        expect(getVentaSchema.safeParse({ id: 1.5 }).success).toBe(false);
    });
});

describe('deleteVentaSchema', () => {
    test('comparte reglas de id con getVentaSchema', () => {
        expect(deleteVentaSchema.safeParse({ id: 2 }).success).toBe(true);
        expect(deleteVentaSchema.safeParse({ id: 0 }).success).toBe(false);
    });
});

describe('queryVentaSchema', () => {
    test('acepta query vacía', () => {
        expect(queryVentaSchema.safeParse({}).success).toBe(true);
    });

    test('acepta filtros válidos', () => {
        const result = queryVentaSchema.safeParse({
            estado: 'INICIADA',
            estadoOperativo: 'OPERATIVO',
            compradorId: 10,
            vendedorId: 5,
            loteId: 1,
            fechaVentaFrom: '2025-01-01T00:00:00.000Z',
            fechaVentaTo: '2025-12-31T23:59:59.000Z',
            montoMin: 50_000,
            montoMax: 200_000,
        });
        expect(result.success).toBe(true);
    });

    test('rechaza estado inválido', () => {
        const result = queryVentaSchema.safeParse({ estado: 'ESTADO_INVALIDO' });
        expectFailedAt(result, ['estado']);
    });

    test('rechaza compradorId negativo', () => {
        const result = queryVentaSchema.safeParse({ compradorId: -1 });
        expectFailedAt(result, ['compradorId']);
    });

    test('rechaza fechaVentaFrom inválida', () => {
        const result = queryVentaSchema.safeParse({
            fechaVentaFrom: 'fecha-invalida',
        });
        expectFailedAt(result, ['fechaVentaFrom']);
    });

    test('rechaza montoMin negativo', () => {
        const result = queryVentaSchema.safeParse({ montoMin: -1 });
        expectFailedAt(result, ['montoMin']);
    });
});
