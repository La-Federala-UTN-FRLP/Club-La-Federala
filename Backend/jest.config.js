/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
    // Integración contra PostgreSQL real: npm run test:integration (jest.integration.config.js).
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/integration/'],
    clearMocks: true,
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: 'tsconfig.test.json',
            },
        ],
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.test.ts',
        '!src/**/*.spec.ts',
        '!src/generated/**',
    ],
};
