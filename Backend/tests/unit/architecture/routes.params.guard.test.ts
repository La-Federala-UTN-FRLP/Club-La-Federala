// Guard de regresión: toda ruta con parámetros de path (/:id, /:ventaId/...) valida con
// validateParams(). Sin él, el controller recibe el string crudo de la URL o, peor, un
// validatedParams que lanza porque nadie lo validó. Es la brecha que cerró el #257: GET
// /personas/cuil/:cuil era la última ruta con params sin validar.
//
// Inspección por texto, sin AST. Cubre el estilo vigente de los archivos de rutas:
// router.METHOD( '/path', ...middlewares, controller ) en una o varias líneas. Si aparece una
// forma que no entiende (router.route/all/use, path no literal) falla en vez de ignorarla.
import * as fs from 'fs';
import * as path from 'path';
import { extractRoutes } from '../../support/sourceGuards';

const ROUTES_DIR = path.resolve(__dirname, '../../../src/routes');

const HAS_PATH_PARAM = /:[A-Za-z_]\w*/;
const USES_VALIDATE_PARAMS = /\bvalidateParams\s*\(/;
const UNSUPPORTED_FORMS = /\brouter\s*\.\s*(?:route|all|use|param)\s*\(/;

const routeFiles = fs
    .readdirSync(ROUTES_DIR)
    .filter((file) => file.endsWith('.ts'))
    .sort();

function sinValidar(source: string): string[] {
    return extractRoutes(source)
        .filter((route) => route.path !== null && HAS_PATH_PARAM.test(route.path) && !USES_VALIDATE_PARAMS.test(route.block))
        .map((route) => `${route.method} ${route.path}`);
}

describe('routes: toda ruta con :param usa validateParams', () => {
    test('los archivos de rutas se encontraron y exponen rutas con params', () => {
        expect(routeFiles).toContain('persona.routes.ts');
        expect(routeFiles).toContain('files.routes.ts');
        const conParams = routeFiles.flatMap((file) =>
            extractRoutes(fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8')).filter((r) => r.path !== null && HAS_PATH_PARAM.test(r.path)),
        );
        expect(conParams.length).toBeGreaterThan(30);
    });

    test.each(routeFiles)('%s: solo declara rutas con router.get|post|put|patch|delete y path literal', (file) => {
        const source = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
        expect(source).not.toMatch(UNSUPPORTED_FORMS);
        const sinPathLiteral = extractRoutes(source).filter((route) => route.path === null);
        expect(sinPathLiteral).toEqual([]);
    });

    test.each(routeFiles)('%s: las rutas con :param pasan por validateParams', (file) => {
        const source = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
        expect(sinValidar(source)).toEqual([]);
    });

    describe('detector', () => {
        test('detecta una ruta con param sin validateParams (multilínea, con middlewares con args)', () => {
            const codigo = `
                router.get(
                    '/cuil/:cuil',
                    authenticate,
                    authorize('ADMINISTRADOR', 'GESTOR'),
                    controller.porCuil
                );
            `;
            expect(sinValidar(codigo)).toEqual(['GET /cuil/:cuil']);
        });

        test('detecta cada ruta sin validar entre varias, con varios params', () => {
            const codigo = `
                router.delete('/:id/miembros/:miembroId', authenticate, validateParams(a), c.uno);
                router.put('/:id/otra/:otraId', authenticate, validate(body), c.dos);
                router.post("/:id", c.tres);
            `;
            expect(sinValidar(codigo)).toEqual(['PUT /:id/otra/:otraId', 'POST /:id']);
        });

        test('acepta validadores específicos y multer en la cadena', () => {
            const codigo = `
                router.post(
                    '/:id/sustituir',
                    authenticate,
                    validateParams(fileIdParamsSchema),
                    upload.single('file'),
                    (req, res, next) => { next(); },
                    controller.sustituir
                );
            `;
            expect(sinValidar(codigo)).toEqual([]);
        });

        test('no exige validateParams a rutas sin params ni mira paréntesis dentro de strings', () => {
            const codigo = `
                router.get('/', authenticate, validateQuery(q), c.listar);
                router.get('/ver(ificar)', authenticate, c.verificar);
            `;
            expect(sinValidar(codigo)).toEqual([]);
        });

        test('un validateParams solo comentado no cuenta', () => {
            const codigo = `
                router.put(
                    '/:id',
                    authenticate,
                    // validateParams(deleteFileMetadataSchema),
                    /* validateParams(otro), */
                    controller.actualizar
                );
            `;
            expect(sinValidar(codigo)).toEqual(['PUT /:id']);
        });

        test('el validateParams de una ruta vecina no cubre a la siguiente', () => {
            const codigo = `
                router.get('/:id', validateParams(a), c.uno);
                router.get('/otra/:id', c.dos);
            `;
            expect(sinValidar(codigo)).toEqual(['GET /otra/:id']);
        });

        test('un path no literal queda marcado como no evaluable', () => {
            const rutas = extractRoutes(`router.get(PATH, c.uno);`);
            expect(rutas).toEqual([expect.objectContaining({ method: 'GET', path: null })]);
        });

        test('las formas no soportadas se detectan para fallar en vez de ignorarse', () => {
            for (const codigo of ["router.route('/:id').get(c.uno);", "router.all('/:id', c.uno);", "router.use('/:id', c.uno);"]) {
                expect(codigo).toMatch(UNSUPPORTED_FORMS);
            }
        });
    });
});
