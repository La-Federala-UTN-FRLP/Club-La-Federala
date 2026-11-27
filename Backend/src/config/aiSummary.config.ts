/**
 * Configuración del resumen con IA (Gemini en Vertex AI).
 *
 * No forma parte de parseWebEnv: se valida recién cuando se pide un resumen, para que la app arranque
 * aunque la IA no esté configurada (los reportes no dependen de ella). Sin API key: la autenticación
 * es por Application Default Credentials (en Cloud Run, la service account del servicio).
 */
export const DEFAULT_VERTEX_LOCATION = 'global';
export const DEFAULT_AI_SUMMARY_MODEL = 'gemini-3.5-flash-lite';

export type AiSummaryConfig = {
    project: string;
    location: string;
    model: string;
};

// ID de proyecto de Google Cloud: 6–30 caracteres, minúsculas, dígitos y guiones, empieza con letra.
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
// "global" o una región (southamerica-east1, us-central1...).
const LOCATION = /^[a-z][a-z0-9-]*[a-z0-9]$/;
// Nombre de modelo sin rutas ni espacios (gemini-3.5-flash-lite, gemini-3.5-flash-lite-001...).
const MODEL = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;

export class AiSummaryConfigError extends Error {
    readonly issues: string[];

    constructor(issues: string[]) {
        super(issues.join('; '));
        this.name = 'AiSummaryConfigError';
        this.issues = issues;
    }
}

function valueOrDefault(value: string | undefined, fallback: string): string {
    const trimmed = value?.trim();
    return trimmed ? trimmed : fallback;
}

/**
 * Lee y valida VERTEX_PROJECT, VERTEX_LOCATION y AI_SUMMARY_MODEL. Los mensajes de error nombran
 * la variable y la regla, nunca el valor recibido.
 */
export function parseAiSummaryConfig(
    source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): AiSummaryConfig {
    const project = source.VERTEX_PROJECT?.trim() ?? '';
    const location = valueOrDefault(source.VERTEX_LOCATION, DEFAULT_VERTEX_LOCATION);
    const model = valueOrDefault(source.AI_SUMMARY_MODEL, DEFAULT_AI_SUMMARY_MODEL);

    const issues: string[] = [];
    if (!project) {
        issues.push('VERTEX_PROJECT: VERTEX_PROJECT is required');
    } else if (!PROJECT_ID.test(project)) {
        issues.push('VERTEX_PROJECT: VERTEX_PROJECT must be a Google Cloud project ID');
    }
    if (!LOCATION.test(location)) {
        issues.push('VERTEX_LOCATION: VERTEX_LOCATION must be "global" or a region name');
    }
    if (!MODEL.test(model)) {
        issues.push('AI_SUMMARY_MODEL: AI_SUMMARY_MODEL must be a model name');
    }
    if (issues.length > 0) throw new AiSummaryConfigError(issues);

    return { project, location, model };
}
