// Guard de regresión: ningún controller lee req.query directamente.
// En Express 5 req.query es un getter que re-parsea la URL en cada acceso; la query validada y
// transformada por Zod vive en req.validated.query y se lee con validatedQuery(req, schema).
// Un controller que vuelva a leer req.query reintroduce la brecha "validé un valor y operé
// sobre otro" (strings crudos, claves que el schema no declara).
import * as fs from 'fs';
import * as path from 'path';

const CONTROLLERS_DIR = path.resolve(__dirname, '../../../src/controllers');

// Sin comentarios: algunos explican por qué ya no se lee req.query.
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// req.query, request.query, req?.query, req['query'] y la desestructuración { query } = req.
const READS_REQ_QUERY = /\b(?:req|request)\s*(?:\??\.\s*query\b|\[\s*['"]query['"]\s*\])|\{[^}]*\bquery\b[^}]*\}\s*=\s*(?:req|request)(?![\w.[?])/;

const controllers = fs
    .readdirSync(CONTROLLERS_DIR)
    .filter((file) => file.endsWith('.ts'))
    .sort();

describe('controllers: la query se lee con validatedQuery, no con req.query', () => {
    test('el directorio de controllers se encontró', () => {
        expect(controllers.length).toBeGreaterThan(0);
        expect(controllers).toContain('lote.controller.ts');
    });

    test.each(controllers)('%s no lee req.query', (file) => {
        const source = stripComments(fs.readFileSync(path.join(CONTROLLERS_DIR, file), 'utf8'));
        expect(source).not.toMatch(READS_REQ_QUERY);
    });

    test('el detector reconoce las formas de lectura que debe prohibir', () => {
        for (const codigo of [
            'const x = req.query.loteId;',
            'const { a } = req.query;',
            'const q = req.query as Foo;',
            'req?.query',
            "req['query']",
            'request.query.foo',
            'const { query } = req;',
        ]) {
            expect(codigo).toMatch(READS_REQ_QUERY);
        }
    });

    test('el detector no marca el uso de validatedQuery ni los comentarios', () => {
        const permitido = stripComments(`
            // antes se leía req.query.loteId
            /* req.query */
            const query = validatedQuery(req, queryLoteSchema);
            const { query: body } = req.body;
            const { query } = req.body;
            const url = 'http://x'; // otro comentario
        `);
        expect(permitido).not.toMatch(READS_REQ_QUERY);
        expect(permitido).toContain("const url = 'http://x';");
    });
});
