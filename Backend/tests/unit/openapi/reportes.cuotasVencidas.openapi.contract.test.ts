// Contrato de respuesta de GET /reportes/cuotas-vencidas contra la OpenAPI (CCLF-55).
// Mismo criterio que reportes.openapi.contract.test.ts: respuesta real (ruta → service → fake de
// Prisma con el set de prueba) validada en forma estricta contra el schema de documentacionApi.yaml.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: require('../../support/fakes/cuotaVencida.fake').crearPrismaCuotasFake(),
}));

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/config/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';
import { AHORA_CORTE, DATOS_CUOTAS, PrismaCuotasFake, fijarAhora } from '../../support/fakes/cuotaVencida.fake';

const spec = YAML.parse(fs.readFileSync(path.resolve(__dirname, '../../../documents/documentacionApi.yaml'), 'utf8'));
const db = prisma as unknown as PrismaCuotasFake;

useTestWebEnv();

type Schema = Record<string, any>;

const resolver = (s: Schema): Schema =>
    s.$ref ? resolver(s.$ref.replace(/^#\//, '').split('/').reduce((acc: any, k: string) => acc[k], spec)) : s;

/** Errores de `valor` contra `schema` (subconjunto de OpenAPI 3.0, estricto con claves de más). */
function validar(valor: unknown, schemaIn: Schema, ruta = '$'): string[] {
    const schema = resolver(schemaIn);
    if (valor === null) return schema.nullable ? [] : [`${ruta}: null no permitido`];
    if (schema.allOf) return schema.allOf.flatMap((s: Schema) => validar(valor, s, ruta));
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

const SCHEMA_200 = spec.paths['/reportes/cuotas-vencidas'].get.responses['200'].content['application/json'].schema;

beforeEach(() => {
    db.cargar(DATOS_CUOTAS);
    fijarAhora(AHORA_CORTE);
});

afterEach(() => {
    jest.useRealTimers();
});

describe('Reporte de cuotas vencidas — respuesta real vs OpenAPI', () => {
    test.each(['USD', 'ARS'])('GET /reportes/cuotas-vencidas?moneda=%s cumple ReporteCuotasVencidasResponse', async (moneda) => {
        const res = await request(app).get(`/api/reportes/cuotas-vencidas?moneda=${moneda}`).set(authHeader('ADMINISTRADOR'));
        expect(res.status).toBe(200);
        expect(res.body.data.filas.length).toBeGreaterThan(0);
        expect(validar(res.body, SCHEMA_200)).toEqual([]);
    });

    test('incluye una fila con loteNumero null (ARS) y la valida', async () => {
        const res = await request(app).get('/api/reportes/cuotas-vencidas?moneda=ARS').set(authHeader('GESTOR'));
        expect(res.body.data.filas.some((f: { loteNumero: unknown }) => f.loteNumero === null)).toBe(true);
        expect(validar(res.body, SCHEMA_200)).toEqual([]);
    });

    test('el schema detecta claves de más, tramo desconocido y tipos incorrectos', () => {
        expect(validar({ tramo: '0-0', cuotas: 1, saldo: '1.00', extra: 1 }, { $ref: '#/components/schemas/TramoCuotasVencidas' })).toEqual(
            expect.arrayContaining(['$.extra: clave no documentada', expect.stringContaining('$.tramo: "0-0" fuera de')]),
        );
        expect(validar({ cuotaId: 'x' }, { $ref: '#/components/schemas/CuotaVencidaFila' })).toEqual(
            expect.arrayContaining(['$.cuotaId: se esperaba entero', '$.saldoPendiente: falta']),
        );
    });

    test('los arrays del reporte tienen items tipados (sin { type: object } genérico)', () => {
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
        recorrer(SCHEMA_200, 'cuotasVencidas');
        expect(genericos).toEqual([]);
    });
});
