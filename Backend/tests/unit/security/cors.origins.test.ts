import { resolveCorsOrigin } from '../../../src/config/cors.origins';

describe('resolveCorsOrigin', () => {
    describe('contratos actuales', () => {
        test('origin exacto configurado se permite', () => {
            expect(
                resolveCorsOrigin('https://app.example.com', 'https://app.example.com', 'production'),
            ).toBe(true);
        });

        test('sin Origin se permite', () => {
            expect(resolveCorsOrigin(undefined, 'https://app.example.com', 'production')).toBe(true);
        });

        test('localhost se permite en development sin FRONTEND_URL', () => {
            expect(
                resolveCorsOrigin('http://localhost:5173', undefined, 'development'),
            ).toBe(true);
        });

        test('sin Origin se permite en production aunque falte FRONTEND_URL', () => {
            expect(resolveCorsOrigin(undefined, undefined, 'production')).toBe(true);
        });
    });

    describe('regressions fail-closed', () => {
        test('origin desconocido se deniega', () => {
            expect(
                resolveCorsOrigin('https://evil.example', 'https://app.example.com', 'production'),
            ).toBe(false);
        });

        test('substring/prefix del FRONTEND_URL se deniega', () => {
            expect(
                resolveCorsOrigin(
                    'https://federala.example',
                    'https://federala.example.com',
                    'production',
                ),
            ).toBe(false);
        });

        test('suffix malicioso se deniega', () => {
            expect(
                resolveCorsOrigin(
                    'https://federala.example.evil.com',
                    'https://federala.example',
                    'production',
                ),
            ).toBe(false);
        });

        test('localhost no se agrega automáticamente en production', () => {
            expect(
                resolveCorsOrigin(
                    'http://localhost:5173',
                    'https://app.example.com',
                    'production',
                ),
            ).toBe(false);
        });

        test('production sin FRONTEND_URL deniega origins de browser', () => {
            expect(
                resolveCorsOrigin('https://app.example.com', undefined, 'production'),
            ).toBe(false);
        });

        test('CSV accidental no autoriza cada origin por separado', () => {
            expect(
                resolveCorsOrigin(
                    'https://a.example',
                    'https://a.example,https://b.example',
                    'production',
                ),
            ).toBe(false);
        });
    });

    describe('normalización de FRONTEND_URL', () => {
        test('FRONTEND_URL con espacios representa el origin recortado', () => {
            expect(
                resolveCorsOrigin(
                    'https://app.example.com',
                    '  https://app.example.com  ',
                    'production',
                ),
            ).toBe(true);
        });
    });
});
