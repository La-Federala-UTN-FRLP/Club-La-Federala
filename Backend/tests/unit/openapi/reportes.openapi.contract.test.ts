// Contrato de respuesta de los reportes contra la OpenAPI (CCLF-54).
// Valida respuestas reales (ruta → service → fakes de Prisma con el set de prueba) contra el schema
// documentado en documentacionApi.yaml. El validador cubre el subconjunto de OpenAPI 3.0 que usan
// estos schemas y es estricto: una clave no documentada o un array sin `items` tipado falla.
jest.mock('../../../src/config/prisma', () => {
    const inventario = require('../../support/fakes/loteInventario.fake').crearPrismaInventarioFake();
    const ventas = require('../../support/fakes/ventaReporte.fake').crearPrismaVentasFake();
    return { __esModule: true, default: { lote: inventario.lote, venta: ventas.venta, fakes: { inventario, ventas } } };
});

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/config/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';
import { DATOS_INVENTARIO, PrismaInventarioFake } from '../../support/fakes/loteInventario.fake';
import { DATOS_VENTAS, PrismaVentasFake } from '../../support/fakes/ventaReporte.fake';

const spec = YAML.parse(fs.readFileSync(path.resolve(__dirname, '../../../documents/documentacionApi.yaml'), 'utf8'));

const { fakes } = prisma as unknown as { fakes: { inventario: PrismaInventarioFake; ventas: PrismaVentasFake } };

useTestWebEnv();

type Schema = Record<string, any>;

const resolver = (s: Schema): Schema =>
    s.$ref ? resolver(s.$ref.replace(/^#\//, '').split('/').reduce((acc: any, k: string) => acc[k], spec)) : s;

/** Errores de `valor` contra `schema`, con la ruta JSON de cada uno. */
function validar(valor: unknown, schemaIn: Schema, ruta = '$'): string[] {
    const schema = resolver(schemaIn);
    if (valor === null) return schema.nullable ? [] : [`${ruta}: null no permitido`];
    if (schema.allOf) {
        return schema.allOf.flatMap((s: Schema) => validar(valor, s, ruta));
    }
    const errores: string[] = [];
    if (schema.enum && !schema.enum.includes(valor)) errores.push(`${ruta}: ${JSON.stringify(valor)} fuera de ${schema.enum}`);
    switch (schema.type) {
        case 'object': {
            if (typeof valor !== 'object' || Array.isArray(valor)) return [`${ruta}: se esperaba objeto`];
            const props = schema.properties ?? {};
            if (Object.keys(props).length === 0) errores.push(`${ruta}: objeto sin propiedades documentadas`);
            for (const req of schema.required ?? []) if (!(req in (valor as object))) errores.push(`${ruta}.${req}: falta`);
            for (const [k, v] of Object.entries(valor as object)) {
                if (!props[k]) errores.push(`${ruta}.${k}: clave no documentada`);
                else errores.push(...validar(v, props[k], `${ruta}.${k}`));
            }
            break;
        }
        case 'array':
            if (!Array.isArray(valor)) return [`${ruta}: se esperaba array`];
            if (!schema.items) return [`${ruta}: array sin items`];
            valor.forEach((item, i) => errores.push(...validar(item, schema.items, `${ruta}[${i}]`)));
            break;
        case 'integer':
            if (!Number.isInteger(valor)) errores.push(`${ruta}: se esperaba entero`);
            break;
        case 'boolean':
            if (typeof valor !== 'boolean') errores.push(`${ruta}: se esperaba boolean`);
            break;
        case 'string':
            if (typeof valor !== 'string') return [`${ruta}: se esperaba string`];
            if (schema.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) errores.push(`${ruta}: no es fecha`);
            if (schema.pattern && !new RegExp(schema.pattern).test(valor)) errores.push(`${ruta}: no cumple ${schema.pattern}`);
            break;
        default:
            errores.push(`${ruta}: tipo ${schema.type} no soportado por el validador`);
    }
    return errores;
}

const schema200 = (ruta: string) => spec.paths[ruta].get.responses['200'].content['application/json'].schema;

beforeEach(() => {
    fakes.inventario.cargar(DATOS_INVENTARIO);
    fakes.ventas.cargar(DATOS_VENTAS);
});

describe('Reportes — respuesta real vs OpenAPI', () => {
    test('GET /reportes/ventas con datos (incluye otrasMonedas y filas) cumple ReporteVentasResponse', async () => {
        const res = await request(app).get('/api/reportes/ventas?desde=2026-11-01&hasta=2026-11-30').set(authHeader('ADMINISTRADOR'));
        expect(res.status).toBe(200);
        expect(res.body.data.otrasMonedas.length).toBeGreaterThan(0);
        expect(res.body.data.filas.length).toBeGreaterThan(0);
        expect(res.body.data.filas.some((f: { fechaEscritura: unknown }) => f.fechaEscritura === null)).toBe(true);
        expect(validar(res.body, schema200('/reportes/ventas'))).toEqual([]);
    });

    test('GET /reportes/inventario con datos cumple ReporteInventarioResponse', async () => {
        const res = await request(app).get('/api/reportes/inventario').set(authHeader('GESTOR'));
        expect(res.status).toBe(200);
        expect(validar(res.body, schema200('/reportes/inventario'))).toEqual([]);
    });

    test('el validador detecta claves de más y tipos incorrectos', () => {
        const s = schema200('/reportes/ventas');
        expect(validar({ success: true, data: {}, extra: 1 }, s)).toEqual(expect.arrayContaining(['$.extra: clave no documentada', '$.data.corte: falta']));
        expect(validar({ ventaId: 'x' },{ $ref: '#/components/schemas/VentaReporteFila' })).toEqual(
            expect.arrayContaining(['$.ventaId: se esperaba entero', '$.monto: falta']),
        );
    });

    test('los arrays de ventas e inventario tienen items tipados (sin { type: object } genérico)', () => {
        const genericos: string[] = [];
        const recorrer = (nodo: Schema, ruta: string) => {
            const s = resolver(nodo);
            if (s.type === 'array') {
                const items = resolver(s.items ?? {});
                if (!items.properties && !items.type) genericos.push(ruta);
                if (items.type === 'object' && !items.properties) genericos.push(ruta);
                recorrer(s.items, `${ruta}[]`);
            }
            for (const [k, v] of Object.entries<Schema>(s.properties ?? {})) recorrer(v, `${ruta}.${k}`);
        };
        recorrer(schema200('/reportes/ventas'), 'ventas');
        recorrer(schema200('/reportes/inventario'), 'inventario');
        expect(genericos).toEqual([]);
    });
});
