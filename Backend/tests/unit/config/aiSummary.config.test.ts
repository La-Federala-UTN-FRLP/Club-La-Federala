// Configuración del resumen con IA: se valida al usarla, no en el arranque (parseWebEnv no la exige).
import { AiSummaryConfigError, parseAiSummaryConfig } from '../../../src/config/aiSummary.config';
import { parseWebEnv } from '../../../src/config/env';

function issuesOf(source: Record<string, string | undefined>): string[] {
    try {
        parseAiSummaryConfig(source);
    } catch (err) {
        if (err instanceof AiSummaryConfigError) return err.issues;
        throw err;
    }
    return [];
}

describe('parseAiSummaryConfig', () => {
    test('defaults: location global y modelo gemini-3.5-flash-lite', () => {
        expect(parseAiSummaryConfig({ VERTEX_PROJECT: 'proyecto-ficticio' })).toEqual({
            project: 'proyecto-ficticio',
            location: 'global',
            model: 'gemini-3.5-flash-lite',
        });
    });

    test('vacías o en blanco toman el default', () => {
        expect(parseAiSummaryConfig({ VERTEX_PROJECT: ' proyecto-ficticio ', VERTEX_LOCATION: ' ', AI_SUMMARY_MODEL: '' })).toEqual({
            project: 'proyecto-ficticio',
            location: 'global',
            model: 'gemini-3.5-flash-lite',
        });
    });

    test('respeta los valores configurados', () => {
        expect(
            parseAiSummaryConfig({ VERTEX_PROJECT: 'proyecto-ficticio', VERTEX_LOCATION: 'us-central1', AI_SUMMARY_MODEL: 'gemini-3.5-flash-lite-001' }),
        ).toEqual({ project: 'proyecto-ficticio', location: 'us-central1', model: 'gemini-3.5-flash-lite-001' });
    });

    test.each([
        ['sin VERTEX_PROJECT', {}, 'VERTEX_PROJECT: VERTEX_PROJECT is required'],
        ['VERTEX_PROJECT en blanco', { VERTEX_PROJECT: '  ' }, 'VERTEX_PROJECT: VERTEX_PROJECT is required'],
        ['VERTEX_PROJECT inválido', { VERTEX_PROJECT: 'Mi Proyecto' }, 'VERTEX_PROJECT: VERTEX_PROJECT must be a Google Cloud project ID'],
        ['location con ruta', { VERTEX_PROJECT: 'proyecto-ficticio', VERTEX_LOCATION: 'us/central' }, 'VERTEX_LOCATION: VERTEX_LOCATION must be "global" or a region name'],
        ['modelo con espacios', { VERTEX_PROJECT: 'proyecto-ficticio', AI_SUMMARY_MODEL: 'gemini flash' }, 'AI_SUMMARY_MODEL: AI_SUMMARY_MODEL must be a model name'],
    ])('%s', (_caso, source, issue) => {
        expect(issuesOf(source)).toEqual([issue]);
    });

    test('el mensaje de error no incluye el valor recibido', () => {
        expect(issuesOf({ VERTEX_PROJECT: 'Valor Secreto' }).join(' ')).not.toContain('Valor Secreto');
    });
});

describe('arranque sin IA configurada', () => {
    test('parseWebEnv no exige VERTEX_PROJECT', () => {
        expect(() =>
            parseWebEnv({
                NODE_ENV: 'development',
                DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
                JWT_SECRET: 'secret',
                SUPABASE_URL: 'https://example.supabase.co',
                SUPABASE_SERVICE_KEY: 'service-key',
            }),
        ).not.toThrow();
    });
});
