/**
 * Factory de mocks Prisma parciales para tests de services.
 *
 * No replica el cliente completo: cada suite declara solo los modelos y
 * métodos que realmente usa. Los valores de retorno se configuran en el
 * test (nada de happy-path automático).
 *
 * Tipos: delegates parciales con `jest.Mock`. No se tipa contra PrismaClient
 * completo porque el surface del client generado es demasiado amplio y
 * forzaría `as any` global o un mock de todo Prisma.
 */

export const PRISMA_DELEGATE_METHODS = [
    'findMany',
    'findUnique',
    'findFirst',
    'create',
    'update',
    'delete',
    'count',
    'groupBy',
    'deleteMany',
] as const;

export type PrismaDelegateMethod = (typeof PRISMA_DELEGATE_METHODS)[number];

export type PrismaDelegateMock<M extends PrismaDelegateMethod = PrismaDelegateMethod> = {
    [K in M]: jest.Mock;
};

export type PrismaMockFromSpec<S extends Record<string, readonly PrismaDelegateMethod[]>> = {
    [K in keyof S]: PrismaDelegateMock<S[K][number]>;
};

export function createPrismaMock<S extends Record<string, readonly PrismaDelegateMethod[]>>(
    spec: S,
): PrismaMockFromSpec<S> {
    const mock: Record<string, Record<string, jest.Mock>> = {};
    for (const [model, methods] of Object.entries(spec)) {
        const delegate: Record<string, jest.Mock> = {};
        for (const method of methods) {
            delegate[method] = jest.fn();
        }
        mock[model] = delegate;
    }
    return mock as PrismaMockFromSpec<S>;
}

export function resetPrismaMock(mock: object): void {
    for (const [key, value] of Object.entries(mock)) {
        if (typeof value === 'function' && 'mockReset' in value) {
            const fn = value as jest.Mock;
            if (key === '$transaction') {
                fn.mockClear();
            } else {
                fn.mockReset();
            }
            continue;
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            resetPrismaMock(value);
        }
    }
}

/** Spec del piloto Inmobiliaria. */
export const inmobiliariaPrismaSpec = {
    inmobiliaria: [
        'findMany',
        'count',
        'findUnique',
        'findFirst',
        'create',
        'update',
        'delete',
    ],
    venta: ['groupBy', 'count'],
    reserva: ['groupBy', 'count'],
    prioridad: ['groupBy', 'count'],
} as const;

export const inmobiliariaPrismaMock = createPrismaMock(inmobiliariaPrismaSpec);

/** Spec de Lote: solo delegates que el service usa de verdad. */
export const lotePrismaSpec = {
    lote: ['findMany', 'count', 'findUnique', 'findFirst', 'create', 'update', 'delete'],
    alquiler: ['findFirst', 'update', 'create'],
    persona: ['findUnique'],
    ubicacion: ['update'],
    fraccion: ['findUnique'],
    archivos: ['deleteMany'],
    reserva: ['deleteMany'],
    venta: ['deleteMany'],
} as const;

export const lotePrismaMock = createPrismaMock(lotePrismaSpec);

/** Spec de Reserva: delegates del client + tx mínimo para $transaction. */
export const reservaPrismaSpec = {
    reserva: ['findMany', 'findUnique', 'findFirst', 'update', 'delete'],
    lote: ['findUnique'],
    prioridad: ['findFirst'],
    persona: ['findUnique'],
    inmobiliaria: ['findUnique'],
    ofertaReserva: ['findMany'],
} as const;

export const reservaTxMock = {
    reserva: {
        create: jest.fn(),
        update: jest.fn(),
    },
    ofertaReserva: {
        create: jest.fn(),
    },
    lote: {
        update: jest.fn(),
    },
};

export const reservaPrismaMock = {
    ...createPrismaMock(reservaPrismaSpec),
    $transaction: jest.fn(async (cb: (tx: typeof reservaTxMock) => unknown) => cb(reservaTxMock)),
};

/** Spec mínimo para job expireReservas. */
export const expireReservasPrismaSpec = {
    reserva: ['findMany'],
} as const;

export const expireReservasPrismaMock = createPrismaMock(expireReservasPrismaSpec);
