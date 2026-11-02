// Utilidades para los guards de arquitectura que inspeccionan código fuente con regex (sin AST).
// Son deliberadamente simples: ante una forma que no entienden fallan en vez de ignorarla.

// Sin comentarios: varios explican justamente por qué ya no se usa algo (req.params, validators
// viejos). El lookbehind de ':' evita cortar URLs como 'http://x' dentro de strings.
export function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export interface RouteDeclaration {
    method: string;
    // null si el primer argumento no es un string literal (el guard no puede evaluarla).
    path: string | null;
    // Todo lo que hay entre los paréntesis de router.METHOD( ... ): path, middlewares y controller.
    block: string;
}

const ROUTE_START = /\brouter\s*\.\s*(get|post|put|patch|delete)\s*\(/g;
const FIRST_STRING_ARG = /^\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/;

// Extrae cada router.get|post|put|patch|delete(...) balanceando paréntesis e ignorando los que
// aparecen dentro de strings. Soporta llamadas multilínea y middlewares con argumentos.
export function extractRoutes(source: string): RouteDeclaration[] {
    const code = stripComments(source);
    const routes: RouteDeclaration[] = [];
    for (const match of code.matchAll(ROUTE_START)) {
        const start = (match.index ?? 0) + match[0].length;
        let depth = 1;
        let quote: string | null = null;
        let i = start;
        for (; i < code.length && depth > 0; i++) {
            const ch = code[i];
            if (quote) {
                if (ch === '\\') i++;
                else if (ch === quote) quote = null;
            } else if (ch === "'" || ch === '"' || ch === '`') {
                quote = ch;
            } else if (ch === '(') {
                depth++;
            } else if (ch === ')') {
                depth--;
            }
        }
        if (depth !== 0) throw new Error(`router.${match[1]}( sin cerrar cerca de: ${code.slice(start, start + 60)}`);
        const block = code.slice(start, i - 1);
        routes.push({ method: match[1].toUpperCase(), path: FIRST_STRING_ARG.exec(block)?.[2] ?? null, block });
    }
    return routes;
}
