// Guard de migraciones para restricciones que Prisma 6 no expresa en schema.prisma.
//
// El índice único parcial "Prioridad_loteId_activa_key" (una prioridad ACTIVA por lote) existe solo en
// SQL. Si un `prisma migrate dev` futuro generara un DROP de ese índice, la invariante dejaría de estar
// garantizada por la base sin que nadie lo note. Este test lo impide.
import fs from 'fs';
import path from 'path';

const MIGRATIONS = path.resolve(__dirname, '../../../prisma/migrations');
const INDICE = 'Prioridad_loteId_activa_key';
const CREACION = '20261113120000_prioridad_una_activa_por_lote';

const migraciones = fs
    .readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
const sql = (nombre: string) => fs.readFileSync(path.join(MIGRATIONS, nombre, 'migration.sql'), 'utf8');

test('la migración crea el índice único parcial sobre ACTIVA, con la precondición de datos', () => {
    expect(migraciones).toContain(CREACION);
    const texto = sql(CREACION);
    expect(texto).toMatch(new RegExp(`CREATE UNIQUE INDEX "${INDICE}" ON "public"\\."Prioridad"\\("loteId"\\) WHERE "estado" = 'ACTIVA'`));
    expect(texto).toMatch(/RAISE EXCEPTION/);
});

test('ninguna migración posterior elimina el índice', () => {
    const posteriores = migraciones.filter((m) => m > CREACION);
    for (const m of posteriores) {
        expect({ migracion: m, dropea: new RegExp(`DROP INDEX[^;]*"${INDICE}"`, 'i').test(sql(m)) }).toEqual({ migracion: m, dropea: false });
    }
});
