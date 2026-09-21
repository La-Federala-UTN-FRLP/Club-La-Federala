import {
    createReservaSchema,
    updateReservaSchema,
    getReservaParamsSchema,
    deleteReservaParamsSchema,
    queryReservasSchema,
    createOfertaSchema,
} from '../../../src/validations/reserva.validation';

function buildValidReservaInput(overrides: Record<string, unknown> = {}) {
    return {
        fechaReserva: '2025-12-01T18:00:00.000Z',
        loteId: 1,
        clienteId: 10,
        numero: 'RES-001',
        ofertaInicial: 150_000,
        fechaFinReserva: '2025-12-31T18:00:00.000Z',
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

describe('createReservaSchema', () => {
    test('acepta una reserva válida con campos opcionales', () => {
        const result = createReservaSchema.safeParse(
            buildValidReservaInput({ inmobiliariaId: 5, sena: 5000 }),
        );
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.loteId).toBe(1);
            expect(result.data.inmobiliariaId).toBe(5);
            expect(result.data.sena).toBe(5000);
            expect(result.data.fechaReserva).toBe(new Date('2025-12-01T18:00:00.000Z').toISOString());
        }
    });

    test('acepta reserva mínima sin inmobiliaria ni seña', () => {
        const result = createReservaSchema.safeParse(buildValidReservaInput());
        expect(result.success).toBe(true);
    });

    test('acepta inmobiliariaId null y seña null', () => {
        const result = createReservaSchema.safeParse(
            buildValidReservaInput({ inmobiliariaId: null, sena: null }),
        );
        expect(result.success).toBe(true);
    });

    test('acepta seña cero', () => {
        const result = createReservaSchema.safeParse(buildValidReservaInput({ sena: 0 }));
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.sena).toBe(0);
    });

    test('coerce loteId y clienteId desde string', () => {
        const result = createReservaSchema.safeParse(
            buildValidReservaInput({ loteId: '2', clienteId: '15' }),
        );
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.loteId).toBe(2);
            expect(result.data.clienteId).toBe(15);
        }
    });

    test('normaliza fechaReserva Date a ISO', () => {
        const result = createReservaSchema.safeParse(
            buildValidReservaInput({ fechaReserva: new Date('2025-12-01T18:00:00.000Z') }),
        );
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.fechaReserva).toBe('2025-12-01T18:00:00.000Z');
        }
    });

    test('rechaza ausencia de fechaReserva', () => {
        const { fechaReserva: _, ...rest } = buildValidReservaInput();
        const result = createReservaSchema.safeParse(rest);
        expect(result.success).toBe(false);
    });

    test('rechaza número de reserva demasiado corto', () => {
        const result = createReservaSchema.safeParse(buildValidReservaInput({ numero: 'AB' }));
        expectFailedAt(result, ['numero']);
    });

    test('rechaza oferta inicial cero o negativa', () => {
        expect(createReservaSchema.safeParse(buildValidReservaInput({ ofertaInicial: 0 })).success).toBe(
            false,
        );
        expect(
            createReservaSchema.safeParse(buildValidReservaInput({ ofertaInicial: -1 })).success,
        ).toBe(false);
    });

    test('rechaza seña negativa', () => {
        const result = createReservaSchema.safeParse(buildValidReservaInput({ sena: -1 }));
        expectFailedAt(result, ['sena']);
    });

    test('rechaza loteId no positivo', () => {
        const result = createReservaSchema.safeParse(buildValidReservaInput({ loteId: -1 }));
        expectFailedAt(result, ['loteId']);
    });

    test('rechaza fecha de reserva inválida', () => {
        const result = createReservaSchema.safeParse(
            buildValidReservaInput({ fechaReserva: 'no-es-fecha' }),
        );
        expect(result.success).toBe(false);
    });

    test('omite claves desconocidas en lugar de fallar', () => {
        const result = createReservaSchema.safeParse(
            buildValidReservaInput({ campoExtra: 'ignorado' }),
        );
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).not.toHaveProperty('campoExtra');
        }
    });
});

describe('updateReservaSchema', () => {
    test('acepta actualización parcial con un campo', () => {
        const result = updateReservaSchema.safeParse({ sena: 10_000 });
        expect(result.success).toBe(true);
    });

    test('rechaza objeto vacío', () => {
        const result = updateReservaSchema.safeParse({});
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.message.includes('al menos un campo'))).toBe(
                true,
            );
        }
    });

    test('acepta sena null para eliminar seña', () => {
        const result = updateReservaSchema.safeParse({ sena: null });
        expect(result.success).toBe(true);
    });

    test('rechaza estado fuera del enum', () => {
        const result = updateReservaSchema.safeParse({ estado: 'INVALIDO' });
        expectFailedAt(result, ['estado']);
    });

    test('acepta cambio de estado válido', () => {
        const result = updateReservaSchema.safeParse({ estado: 'CANCELADA' });
        expect(result.success).toBe(true);
    });
});

describe('getReservaParamsSchema', () => {
    test('acepta id entero positivo', () => {
        expect(getReservaParamsSchema.safeParse({ id: 1 }).success).toBe(true);
    });

    test('coerce id desde string', () => {
        const result = getReservaParamsSchema.safeParse({ id: '5' });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.id).toBe(5);
    });

    test('rechaza id negativo o cero', () => {
        expect(getReservaParamsSchema.safeParse({ id: -1 }).success).toBe(false);
        expect(getReservaParamsSchema.safeParse({ id: 0 }).success).toBe(false);
    });

    test('rechaza id no entero', () => {
        expect(getReservaParamsSchema.safeParse({ id: 1.5 }).success).toBe(false);
    });
});

describe('deleteReservaParamsSchema', () => {
    test('comparte reglas con getReservaParamsSchema', () => {
        expect(deleteReservaParamsSchema.safeParse({ id: 3 }).success).toBe(true);
        expect(deleteReservaParamsSchema.safeParse({ id: 0 }).success).toBe(false);
    });
});

describe('queryReservasSchema', () => {
    test('acepta query vacía', () => {
        expect(queryReservasSchema.safeParse({}).success).toBe(true);
    });

    test('acepta filtros válidos', () => {
        const result = queryReservasSchema.safeParse({
            desde: '2025-01-01T00:00:00.000Z',
            hasta: '2025-12-31T23:59:59.000Z',
            estado: 'ACTIVA',
            estadoOperativo: 'OPERATIVO',
            loteId: 1,
            clienteId: 10,
            inmobiliariaId: 5,
            sena: 5000,
        });
        expect(result.success).toBe(true);
    });

    test('rechaza rango desde > hasta', () => {
        const result = queryReservasSchema.safeParse({
            desde: '2025-12-31T23:59:59.000Z',
            hasta: '2025-01-01T00:00:00.000Z',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('hasta'))).toBe(true);
        }
    });

    test('rechaza fecha desde inválida', () => {
        const result = queryReservasSchema.safeParse({ desde: 'fecha-invalida' });
        expectFailedAt(result, ['desde']);
    });

    test('rechaza seña negativa en query', () => {
        const result = queryReservasSchema.safeParse({ sena: -1 });
        expectFailedAt(result, ['sena']);
    });

    test('rechaza estado de reserva inválido', () => {
        const result = queryReservasSchema.safeParse({ estado: 'NO_EXISTE' });
        expectFailedAt(result, ['estado']);
    });

    test.each([
        ['fechaFinReservaDesde', '2025-06-01T00:00:00.000Z'],
        ['fechaFinReservaHasta', '2025-12-31T23:59:59.000Z'],
    ] as const)('acepta %s con fecha válida', (field, value) => {
        const result = queryReservasSchema.safeParse({ [field]: value });
        expect(result.success).toBe(true);
    });

    test.each([
        ['fechaFinReservaDesde', 'no-es-fecha'],
        ['fechaFinReservaHasta', 'no-es-fecha'],
    ] as const)('rechaza %s con fecha inválida', (field, value) => {
        const result = queryReservasSchema.safeParse({ [field]: value });
        expectFailedAt(result, [field]);
    });
});

describe('createOfertaSchema', () => {
    test('acepta oferta con monto positivo', () => {
        const result = createOfertaSchema.safeParse({ monto: 120_000 });
        expect(result.success).toBe(true);
    });

    test('rechaza monto cero o negativo', () => {
        expect(createOfertaSchema.safeParse({ monto: 0 }).success).toBe(false);
        expect(createOfertaSchema.safeParse({ monto: -100 }).success).toBe(false);
    });

    test('acepta action del enum de negociación', () => {
        const result = createOfertaSchema.safeParse({ monto: 1, action: 'ACEPTAR' });
        expect(result.success).toBe(true);
    });

    test('rechaza action inválida', () => {
        const result = createOfertaSchema.safeParse({ monto: 1, action: 'OTRO' });
        expectFailedAt(result, ['action']);
    });
});
