/**
 * Tests de integración contra una base PostgreSQL real y descartable (constraints, locks y carreras
 * que un mock no puede representar). No forman parte de `npm test`.
 *
 *   TEST_DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/fed_test npm run test:integration
 *
 * La base debe tener las migraciones aplicadas (`prisma migrate deploy`) y se VACÍA en cada test:
 * nunca apuntarla a una base con datos reales.
 *
 * @type {import('jest').Config}
 */
const base = require('./jest.config');

module.exports = {
    ...base,
    roots: ['<rootDir>/tests/integration'],
    testMatch: ['**/*.int.test.ts'],
    testPathIgnorePatterns: ['/node_modules/'],
    setupFiles: ['<rootDir>/tests/integration/setup.ts'],
    testTimeout: 60000,
};
