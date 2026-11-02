// Guard de regresión: ningún controller lee req.params directamente.
// Los params de path se validan y transforman en la ruta (validateParams) y el controller los lee
// con validatedParams(req, schema). Leer req.params reintroduce la brecha "validé un valor y operé
// sobre otro": parseInt("5abc") = 5, Number("1e2") = 100, strings crudos hasta Prisma.
import * as fs from 'fs';
import * as path from 'path';
import { stripComments } from '../../support/sourceGuards';

const CONTROLLERS_DIR = path.resolve(__dirname, '../../../src/controllers');

// req.params, request.params, req?.params, req['params'] y la desestructuración { params } = req.
// validatedParams(req, schema) no coincide: tras `req` viene una coma, no `.params`.
const READS_REQ_PARAMS = /\b(?:req|request)\s*(?:\??\.\s*params\b|\[\s*['"]params['"]\s*\])|\{[^}]*\bparams\b[^}]*\}\s*=\s*(?:req|request)(?![\w.[?])/;

const controllers = fs
    .readdirSync(CONTROLLERS_DIR)
    .filter((file) => file.endsWith('.ts'))
    .sort();

describe('controllers: los params se leen con validatedParams, no con req.params', () => {
    test('el directorio de controllers se encontró', () => {
        expect(controllers.length).toBeGreaterThan(0);
        expect(controllers).toContain('persona.controller.ts');
        expect(controllers).toContain('file.controller.ts');
    });

    test.each(controllers)('%s no lee req.params', (file) => {
        const source = stripComments(fs.readFileSync(path.join(CONTROLLERS_DIR, file), 'utf8'));
        expect(source).not.toMatch(READS_REQ_PARAMS);
    });

    test('el detector reconoce las formas de lectura que debe prohibir', () => {
        for (const codigo of [
            'const id = req.params.id;',
            'const { cuil } = req.params;',
            'const id = parseInt(req.params.id, 10);',
            'const p = req.params as Foo;',
            'req?.params',
            "req['params']",
            'req["params"]',
            'request.params.id',
            'req . params.id',
            'const { params } = req;',
            'const { params, body } = req;',
        ]) {
            expect(codigo).toMatch(READS_REQ_PARAMS);
        }
    });

    test('el detector no marca validatedParams, otras claves ni los comentarios', () => {
        const permitido = stripComments(`
            // antes se leía req.params.id
            /* const { id } = req.params; */
            const { id } = validatedParams(req, getPersonaSchema);
            const { params } = req.body;
            const params = validatedParams(req, schema);
            const x = req.validated?.params;
            const url = 'http://x'; // otro comentario
        `);
        expect(permitido).not.toMatch(READS_REQ_PARAMS);
        expect(permitido).toContain("const url = 'http://x';");
    });
});
