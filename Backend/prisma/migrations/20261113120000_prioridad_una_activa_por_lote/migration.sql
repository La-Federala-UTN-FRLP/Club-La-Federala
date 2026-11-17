-- Invariante de dominio: un lote tiene como máximo UNA prioridad ACTIVA.
--
-- Hasta ahora solo la validaba la aplicación (SELECT y después INSERT), lo que no alcanza contra dos
-- altas concurrentes. Este índice único PARCIAL es la barrera definitiva: la segunda alta concurrente
-- falla con una violación de unicidad (P2002) que el backend traduce a 409.
--
-- Índice manual: Prisma 6 no expresa índices parciales en schema.prisma. Si un `prisma migrate dev`
-- futuro genera un DROP INDEX "Prioridad_loteId_activa_key", hay que quitarlo de esa migración
-- (lo verifica tests/unit/architecture/migrations.guard.test.ts).
--
-- Precondición: no puede haber hoy dos prioridades ACTIVA para un mismo lote. Para revisarlo antes
-- de desplegar (debe devolver 0 filas):
--
--   SELECT "loteId", count(*) FROM "public"."Prioridad"
--   WHERE "estado" = 'ACTIVA' GROUP BY "loteId" HAVING count(*) > 1;
--
-- Si existen, la migración se detiene con un error explícito y no crea el índice: los duplicados se
-- resuelven a mano (decidir cuál sigue ACTIVA), nunca borrando datos desde la migración.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "public"."Prioridad"
    WHERE "estado" = 'ACTIVA'
    GROUP BY "loteId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay lotes con mas de una prioridad ACTIVA: resolverlos antes de aplicar esta migracion';
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "Prioridad_loteId_activa_key" ON "public"."Prioridad"("loteId") WHERE "estado" = 'ACTIVA';
