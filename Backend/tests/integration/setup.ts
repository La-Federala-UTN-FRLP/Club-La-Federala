// Setup de los tests de integración: apunta el Prisma de la app a la base de prueba ANTES de que se
// importe src/config/prisma. Sin TEST_DATABASE_URL los tests fallan (no se saltean en silencio).
const url = process.env.TEST_DATABASE_URL;
if (!url) {
    throw new Error('Falta TEST_DATABASE_URL: los tests de integración necesitan una base PostgreSQL descartable con las migraciones aplicadas.');
}
if (/supabase|amazonaws|render\.com|neon\.tech/i.test(url)) {
    throw new Error('TEST_DATABASE_URL parece una base remota: los tests de integración vacían la base.');
}
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.NODE_ENV = 'test';
