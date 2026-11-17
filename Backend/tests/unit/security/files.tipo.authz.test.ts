// Autorización por tipo de archivo en /api/files (ruta → controller → service real; Prisma y
// Supabase Storage mockeados).
//
// Política (Block 3):
// - TECNICO accede solo a documentación técnica: PLANO e IMAGEN. BOLETO, ESCRITURA y OTRO son
//   documentos de venta (comerciales/legales: exigen ventaId y se guardan bajo venta-{id}) y le
//   quedan vedados para leer, firmar URL, subir, sustituir y aprobar. Un tipo no contemplado
//   también se le deniega (default deny).
// - Lecturas por id, signed URL, sustituir y aprobaciones de un tipo vedado → 404, igual que la
//   convención existente de Files para INMOBILIARIA (no se revela si el id existe ni su tipo).
//   Listados → se filtran. Upload de un tipo vedado → 403 (el tipo lo elige quien llama).
// - ADMINISTRADOR / GESTOR conservan acceso completo. INMOBILIARIA conserva sus reglas 5.4.
const mockStorage = {
    upload: jest.fn(),
    createSignedUrl: jest.fn(),
    remove: jest.fn(),
};

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({ storage: { from: jest.fn(() => mockStorage) } })),
}));

jest.mock('../../../src/config/prisma', () => {
    const db: any = {
        archivos: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
        venta: { findUnique: jest.fn(), findMany: jest.fn() },
    };
    db.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(db));
    return { __esModule: true, default: db };
});

import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/config/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';

const db = prisma as any;

useTestWebEnv();

type Tipo = 'PLANO' | 'IMAGEN' | 'BOLETO' | 'ESCRITURA' | 'OTRO';

const PERMITIDOS_TECNICO: Tipo[] = ['PLANO', 'IMAGEN'];
const VEDADOS_TECNICO: Tipo[] = ['BOLETO', 'ESCRITURA', 'OTRO'];
const TODOS: Tipo[] = [...PERMITIDOS_TECNICO, ...VEDADOS_TECNICO];

const LOTE = 3;
const VENTA = 21;
const INMO_PROPIA = 7;
const INMO_AJENA = 99;
const ID: Record<Tipo, number> = { PLANO: 101, IMAGEN: 102, BOLETO: 103, ESCRITURA: 104, OTRO: 105 };

const nombre = (tipo: Tipo) => `${tipo.toLowerCase()}-confidencial.pdf`;
const path = (tipo: Tipo) => `lote-${LOTE}/${tipo}/objeto-${tipo.toLowerCase()}.pdf`;
const uploader = (tipo: Tipo) => `carga-${tipo.toLowerCase()}@example.com`;

function fila(tipo: Tipo, overrides: Record<string, unknown> = {}) {
    return {
        id: ID[tipo],
        nombreArchivo: nombre(tipo),
        linkArchivo: path(tipo),
        tipo,
        idLoteAsociado: LOTE,
        ventaId: VEDADOS_TECNICO.includes(tipo) ? VENTA : null,
        estadoOperativo: 'OPERATIVO',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        uploadedBy: uploader(tipo),
        ...(tipo === 'PLANO' && { estadoAprobacionComision: 'PENDIENTE', estadoAprobacionMunicipio: 'PENDIENTE' }),
        ...overrides,
    };
}

const FILAS = new Map<number, ReturnType<typeof fila>>();

const TECNICO = authHeader('TECNICO');
const ADMIN = authHeader('ADMINISTRADOR');
const GESTOR = authHeader('GESTOR');
const INMO = authHeader('INMOBILIARIA', INMO_PROPIA);

const PDF = Buffer.from('%PDF-1.4 contenido de prueba');
const adjuntarPdf = (req: request.Test) => req.attach('file', PDF, { filename: 'nuevo.pdf', contentType: 'application/pdf' });

/** Ningún dato del archivo vedado aparece en la respuesta. */
function sinMetadata(body: unknown, tipo: Tipo) {
    const texto = JSON.stringify(body);
    expect(texto).not.toContain(nombre(tipo));
    expect(texto).not.toContain(path(tipo));
    expect(texto).not.toContain(uploader(tipo));
}

let ventaInmobiliariaId: number | null = INMO_PROPIA;

beforeEach(() => {
    FILAS.clear();
    for (const tipo of TODOS) FILAS.set(ID[tipo], fila(tipo));

    db.archivos.findUnique.mockImplementation(async ({ where: { id } }: { where: { id: number } }) => FILAS.get(id) ?? null);
    db.archivos.findMany.mockImplementation(async ({ where }: { where: { ventaId?: number } }) =>
        [...FILAS.values()].filter((f) => where.ventaId === undefined || f.ventaId === where.ventaId),
    );
    db.archivos.update.mockImplementation(async ({ where: { id }, data }: any) => ({ ...FILAS.get(id), ...data }));
    db.archivos.create.mockImplementation(async ({ data }: any) => ({ id: 500, createdAt: new Date(), updatedAt: new Date(), estadoOperativo: 'OPERATIVO', ...data }));

    ventaInmobiliariaId = INMO_PROPIA;
    db.venta.findUnique.mockImplementation(async () => ({ loteId: LOTE, inmobiliariaId: ventaInmobiliariaId }));
    db.venta.findMany.mockImplementation(async () => [{ id: VENTA, inmobiliariaId: ventaInmobiliariaId }]);

    mockStorage.upload.mockResolvedValue({ error: null });
    mockStorage.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example/firmada' }, error: null });
});

// ─── TECNICO × lectura ──────────────────────────────────────────────────────

describe('TECNICO — GET /api/files/:id', () => {
    test.each(PERMITIDOS_TECNICO)('%s → 200 con la metadata', async (tipo) => {
        const res = await request(app).get(`/api/files/${ID[tipo]}`).set(TECNICO);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: ID[tipo], tipo });
    });

    test.each(VEDADOS_TECNICO)('%s → 404 sin metadata', async (tipo) => {
        const res = await request(app).get(`/api/files/${ID[tipo]}`).set(TECNICO);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ success: false, code: 'NOT_FOUND', message: 'Archivo no encontrado' });
        sinMetadata(res.body, tipo);
    });
});

describe('TECNICO — POST /api/files/:id/url (signed URL)', () => {
    test.each(PERMITIDOS_TECNICO)('%s → 200 con signed URL', async (tipo) => {
        const res = await request(app).post(`/api/files/${ID[tipo]}/url`).set(TECNICO);
        expect(res.status).toBe(200);
        expect(res.body.signedUrl).toBe('https://storage.example/firmada');
        expect(mockStorage.createSignedUrl).toHaveBeenCalledWith(path(tipo), expect.any(Number), expect.anything());
    });

    test.each(VEDADOS_TECNICO)('%s → 404 y nunca se firma la URL (aunque conozca el id)', async (tipo) => {
        const res = await request(app).post(`/api/files/${ID[tipo]}/url`).set(TECNICO);
        expect(res.status).toBe(404);
        expect(res.body).not.toHaveProperty('signedUrl');
        expect(mockStorage.createSignedUrl).not.toHaveBeenCalled();
        sinMetadata(res.body, tipo);
    });
});

describe('TECNICO — listados', () => {
    test('GET /lote/:id devuelve solo PLANO e IMAGEN del lote', async () => {
        const res = await request(app).get(`/api/files/lote/${LOTE}`).set(TECNICO);
        expect(res.status).toBe(200);
        expect(res.body.map((f: { tipo: string }) => f.tipo).sort()).toEqual(['IMAGEN', 'PLANO']);
        for (const tipo of VEDADOS_TECNICO) sinMetadata(res.body, tipo);
    });

    test('GET /venta/:ventaId no expone documentos de venta', async () => {
        const res = await request(app).get(`/api/files/venta/${VENTA}`).set(TECNICO);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    test('GET /venta/:ventaId con ?tipo=BOLETO tampoco los expone', async () => {
        const res = await request(app).get(`/api/files/venta/${VENTA}?tipo=BOLETO`).set(TECNICO);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

// ─── TECNICO × escritura ────────────────────────────────────────────────────

describe('TECNICO — POST /api/files (upload)', () => {
    test.each(VEDADOS_TECNICO)('%s → 403 sin tocar storage, venta ni DB', async (tipo) => {
        const res = await adjuntarPdf(
            request(app).post('/api/files').set(TECNICO).field('idLoteAsociado', String(LOTE)).field('tipo', tipo).field('ventaId', String(VENTA)),
        );
        expect(res.status).toBe(403);
        expect(mockStorage.upload).not.toHaveBeenCalled();
        expect(db.archivos.create).not.toHaveBeenCalled();
        expect(db.venta.findUnique).not.toHaveBeenCalled();
    });

    test.each(PERMITIDOS_TECNICO)('%s → 201 (acceso técnico legítimo)', async (tipo) => {
        const res = await adjuntarPdf(request(app).post('/api/files').set(TECNICO).field('idLoteAsociado', String(LOTE)).field('tipo', tipo));
        expect(res.status).toBe(201);
        expect(mockStorage.upload).toHaveBeenCalledTimes(1);
    });
});

describe('TECNICO — POST /api/files/:id/sustituir', () => {
    test.each(VEDADOS_TECNICO)('%s → 404 sin subir ni dar de baja nada', async (tipo) => {
        const res = await adjuntarPdf(request(app).post(`/api/files/${ID[tipo]}/sustituir`).set(TECNICO));
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ success: false, code: 'NOT_FOUND', message: 'Archivo no encontrado' });
        expect(mockStorage.upload).not.toHaveBeenCalled();
        expect(db.archivos.update).not.toHaveBeenCalled();
        expect(db.archivos.create).not.toHaveBeenCalled();
    });

    test('BOLETO eliminado → 404 (no 400: no revela que existe)', async () => {
        FILAS.set(ID.BOLETO, fila('BOLETO', { estadoOperativo: 'ELIMINADO' }));
        const res = await adjuntarPdf(request(app).post(`/api/files/${ID.BOLETO}/sustituir`).set(TECNICO));
        expect(res.status).toBe(404);
    });

    test('PLANO → 200 (acceso técnico legítimo)', async () => {
        const res = await adjuntarPdf(request(app).post(`/api/files/${ID.PLANO}/sustituir`).set(TECNICO));
        expect(res.status).toBe(200);
        expect(mockStorage.upload).toHaveBeenCalledTimes(1);
    });
});

describe('TECNICO — PATCH /api/files/:id/aprobaciones', () => {
    test.each(VEDADOS_TECNICO)('%s → 404: la autorización por tipo precede a la acción y a la validación de tipo', async (tipo) => {
        const res = await request(app).patch(`/api/files/${ID[tipo]}/aprobaciones`).set(TECNICO).send({ target: 'COMISION', estado: 'APROBADO' });
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ success: false, code: 'NOT_FOUND', message: 'Archivo no encontrado' });
        expect(db.archivos.update).not.toHaveBeenCalled();
    });

    test('PLANO + COMISION → 200 (regla 5.5 intacta)', async () => {
        const res = await request(app).patch(`/api/files/${ID.PLANO}/aprobaciones`).set(TECNICO).send({ target: 'COMISION', estado: 'APROBADO' });
        expect(res.status).toBe(200);
        expect(db.archivos.update).toHaveBeenCalledTimes(1);
    });

    test('PLANO + MUNICIPIO → 403 (regla 5.5 intacta)', async () => {
        const res = await request(app).patch(`/api/files/${ID.PLANO}/aprobaciones`).set(TECNICO).send({ target: 'MUNICIPIO', estado: 'APROBADO' });
        expect(res.status).toBe(403);
        expect(db.archivos.update).not.toHaveBeenCalled();
    });
});

// ─── ADMINISTRADOR / GESTOR: sin cambios ─────────────────────────────────────

describe.each([
    ['ADMINISTRADOR', ADMIN],
    ['GESTOR', GESTOR],
])('%s conserva acceso completo', (_rol, header) => {
    test.each(VEDADOS_TECNICO)('GET /:id de %s → 200', async (tipo) => {
        const res = await request(app).get(`/api/files/${ID[tipo]}`).set(header);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: ID[tipo], tipo });
    });

    test.each(VEDADOS_TECNICO)('signed URL de %s → 200', async (tipo) => {
        const res = await request(app).post(`/api/files/${ID[tipo]}/url`).set(header);
        expect(res.status).toBe(200);
        expect(res.body.signedUrl).toBe('https://storage.example/firmada');
    });

    test('GET /lote/:id lista todos los tipos', async () => {
        const res = await request(app).get(`/api/files/lote/${LOTE}`).set(header);
        expect(res.body.map((f: { tipo: string }) => f.tipo).sort()).toEqual([...TODOS].sort());
    });

    test('GET /venta/:ventaId lista los documentos de venta', async () => {
        const res = await request(app).get(`/api/files/venta/${VENTA}`).set(header);
        expect(res.body.map((f: { tipo: string }) => f.tipo).sort()).toEqual([...VEDADOS_TECNICO].sort());
    });

    test.each(VEDADOS_TECNICO)('upload de %s → 201', async (tipo) => {
        const res = await adjuntarPdf(
            request(app).post('/api/files').set(header).field('idLoteAsociado', String(LOTE)).field('tipo', tipo).field('ventaId', String(VENTA)),
        );
        expect(res.status).toBe(201);
    });

    test.each(VEDADOS_TECNICO)('sustituir %s → 200', async (tipo) => {
        const res = await adjuntarPdf(request(app).post(`/api/files/${ID[tipo]}/sustituir`).set(header));
        expect(res.status).toBe(200);
    });

    test('aprobaciones sobre BOLETO conserva su 400 de dominio', async () => {
        const res = await request(app).patch(`/api/files/${ID.BOLETO}/aprobaciones`).set(header).send({ target: 'COMISION', estado: 'APROBADO' });
        expect(res.status).toBe(400);
        expect(db.archivos.update).not.toHaveBeenCalled();
    });
});

// ─── INMOBILIARIA: reglas 5.4 sin cambios ────────────────────────────────────

describe('INMOBILIARIA conserva ownership por venta', () => {
    test.each(VEDADOS_TECNICO)('%s de una venta propia → GET 200 y signed URL 200', async (tipo) => {
        expect((await request(app).get(`/api/files/${ID[tipo]}`).set(INMO)).status).toBe(200);
        expect((await request(app).post(`/api/files/${ID[tipo]}/url`).set(INMO)).status).toBe(200);
    });

    test.each(VEDADOS_TECNICO)('%s de una venta ajena → GET 404 y signed URL 404', async (tipo) => {
        ventaInmobiliariaId = INMO_AJENA;
        expect((await request(app).get(`/api/files/${ID[tipo]}`).set(INMO)).status).toBe(404);
        expect((await request(app).post(`/api/files/${ID[tipo]}/url`).set(INMO)).status).toBe(404);
        expect(mockStorage.createSignedUrl).not.toHaveBeenCalled();
    });

    test.each(PERMITIDOS_TECNICO)('%s (documento de lote) → 200 sin depender de la venta', async (tipo) => {
        ventaInmobiliariaId = INMO_AJENA;
        expect((await request(app).get(`/api/files/${ID[tipo]}`).set(INMO)).status).toBe(200);
    });

    test('GET /lote/:id: venta propia → todos; venta ajena → solo PLANO e IMAGEN', async () => {
        const propia = await request(app).get(`/api/files/lote/${LOTE}`).set(INMO);
        expect(propia.body.map((f: { tipo: string }) => f.tipo).sort()).toEqual([...TODOS].sort());

        ventaInmobiliariaId = INMO_AJENA;
        const ajena = await request(app).get(`/api/files/lote/${LOTE}`).set(INMO);
        expect(ajena.body.map((f: { tipo: string }) => f.tipo).sort()).toEqual(['IMAGEN', 'PLANO']);
    });

    test('GET /venta/:ventaId: venta propia → documentos; venta ajena → 404', async () => {
        const propia = await request(app).get(`/api/files/venta/${VENTA}`).set(INMO);
        expect(propia.status).toBe(200);
        expect(propia.body.map((f: { tipo: string }) => f.tipo).sort()).toEqual([...VEDADOS_TECNICO].sort());

        ventaInmobiliariaId = INMO_AJENA;
        expect((await request(app).get(`/api/files/venta/${VENTA}`).set(INMO)).status).toBe(404);
    });
});
