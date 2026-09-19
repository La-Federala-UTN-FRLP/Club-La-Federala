import type { TipoFile } from '../../../src/types/files.types';
import {
    canInmobiliariaAccessVenta,
    canUpdateAprobacion,
    canUseIncludeDeleted,
    canUserAccessArchivo,
    getUserInmobiliariaId,
    isInmobiliaria,
    type ArchivoForAuth,
    type FileAuthUser,
    type VentaForAuth,
} from '../../../src/utils/file.auth.utils';

const inmo: FileAuthUser = { role: 'INMOBILIARIA', inmobiliariaId: 7 };
const gestor: FileAuthUser = { role: 'GESTOR', inmobiliariaId: 7 };

function archivo(overrides: Partial<ArchivoForAuth> = {}): ArchivoForAuth {
    return {
        tipo: 'PLANO',
        ventaId: null,
        estadoOperativo: 'OPERATIVO',
        ...overrides,
    };
}

describe('isInmobiliaria', () => {
    test('rol INMOBILIARIA es true', () => {
        expect(isInmobiliaria(inmo)).toBe(true);
    });

    test('cualquier otro rol es false', () => {
        expect(isInmobiliaria(gestor)).toBe(false);
        expect(isInmobiliaria({ role: 'ADMINISTRADOR' })).toBe(false);
    });

    test('user undefined es false', () => {
        expect(isInmobiliaria(undefined)).toBe(false);
    });
});

describe('getUserInmobiliariaId', () => {
    test('devuelve el id cuando la inmobiliaria está definida', () => {
        expect(getUserInmobiliariaId(inmo)).toBe(7);
    });

    test('null o ausente se normaliza a null', () => {
        expect(getUserInmobiliariaId({ role: 'INMOBILIARIA', inmobiliariaId: null })).toBeNull();
        expect(getUserInmobiliariaId({ role: 'INMOBILIARIA' })).toBeNull();
    });

    test('user undefined no tiene inmobiliaria', () => {
        expect(getUserInmobiliariaId(undefined)).toBeNull();
    });
});

describe('canInmobiliariaAccessVenta', () => {
    const venta: VentaForAuth = { inmobiliariaId: 7 };

    test('venta null no es accesible', () => {
        expect(canInmobiliariaAccessVenta(inmo, null)).toBe(false);
    });

    test('usuario sin inmobiliaria no accede', () => {
        expect(
            canInmobiliariaAccessVenta({ role: 'INMOBILIARIA', inmobiliariaId: null }, venta),
        ).toBe(false);
    });

    test('misma inmobiliaria permite el acceso', () => {
        expect(canInmobiliariaAccessVenta(inmo, venta)).toBe(true);
    });

    test('inmobiliaria distinta deniega el acceso', () => {
        expect(canInmobiliariaAccessVenta(inmo, { inmobiliariaId: 99 })).toBe(false);
    });
});

describe('canUserAccessArchivo', () => {
    const ventaPropia: VentaForAuth = { inmobiliariaId: 7 };
    const ventaAjena: VentaForAuth = { inmobiliariaId: 99 };
    const docsVenta: TipoFile[] = ['BOLETO', 'ESCRITURA', 'OTRO'];

    test('usuario que no es INMOBILIARIA no recibe esta restricción adicional', () => {
        expect(
            canUserAccessArchivo(
                gestor,
                archivo({ tipo: 'BOLETO', ventaId: 1 }),
                ventaAjena,
            ),
        ).toBe(true);
    });

    test('INMOBILIARIA no accede a un archivo ELIMINADO', () => {
        expect(
            canUserAccessArchivo(
                inmo,
                archivo({ tipo: 'PLANO', estadoOperativo: 'ELIMINADO' }),
                ventaPropia,
            ),
        ).toBe(false);
    });

    test('INMOBILIARIA puede ver PLANO (documento de lote, sin ownership de venta)', () => {
        expect(canUserAccessArchivo(inmo, archivo({ tipo: 'PLANO' }), null)).toBe(true);
    });

    test('INMOBILIARIA puede ver IMAGEN según contrato actual 5.4', () => {
        expect(canUserAccessArchivo(inmo, archivo({ tipo: 'IMAGEN' }), null)).toBe(true);
    });

    test.each(docsVenta)(
        'INMOBILIARIA no accede a %s sin ventaId',
        (tipo) => {
            expect(
                canUserAccessArchivo(inmo, archivo({ tipo, ventaId: null }), ventaPropia),
            ).toBe(false);
        },
    );

    test.each(docsVenta)(
        'INMOBILIARIA accede a %s de una venta de su inmobiliaria',
        (tipo) => {
            expect(
                canUserAccessArchivo(inmo, archivo({ tipo, ventaId: 21 }), ventaPropia),
            ).toBe(true);
        },
    );

    test.each(docsVenta)(
        'INMOBILIARIA no accede a %s de una venta de otra inmobiliaria',
        (tipo) => {
            expect(
                canUserAccessArchivo(inmo, archivo({ tipo, ventaId: 21 }), ventaAjena),
            ).toBe(false);
        },
    );
});

describe('canUseIncludeDeleted', () => {
    test.each([
        ['ADMINISTRADOR', true],
        ['GESTOR', true],
        ['TECNICO', false],
        ['INMOBILIARIA', false],
    ] as const)('rol %s → %s', (role, esperado) => {
        expect(canUseIncludeDeleted({ role })).toBe(esperado);
    });

    test('user undefined no puede pedir includeDeleted', () => {
        expect(canUseIncludeDeleted(undefined)).toBe(false);
    });
});

describe('canUpdateAprobacion', () => {
    test.each([
        ['ADMINISTRADOR', 'COMISION', true],
        ['GESTOR', 'COMISION', true],
        ['TECNICO', 'COMISION', true],
        ['INMOBILIARIA', 'COMISION', false],
        ['ADMINISTRADOR', 'MUNICIPIO', true],
        ['GESTOR', 'MUNICIPIO', true],
        ['TECNICO', 'MUNICIPIO', false],
        ['INMOBILIARIA', 'MUNICIPIO', false],
    ] as const)('%s sobre %s → %s', (role, target, esperado) => {
        expect(canUpdateAprobacion(role, target)).toBe(esperado);
    });
});
