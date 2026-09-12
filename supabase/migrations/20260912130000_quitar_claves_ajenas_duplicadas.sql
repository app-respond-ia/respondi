-- ARREGLO de la migración anterior (20260912120000). Se añadieron 107 claves
-- ajenas creyendo que faltaban, pero 105 ya existían: la consulta que se usó
-- para buscarlas miraba `information_schema`, que SOLO enseña los objetos
-- sobre los que el rol que pregunta tiene permisos — y el rol de solo lectura
-- no los tenía, así que parecían no existir. Las relaciones estaban.
--
-- Duplicarlas rompe las consultas de la app: PostgREST no sabe por cuál de las
-- dos relaciones unir dos tablas ("more than one relationship was found") y
-- devuelve error en Chats, Conversaciones y Casos.
--
-- Aquí se quitan las 105 duplicadas y se quedan las 2 que sí faltaban de
-- verdad (vendedores → usuario y registro de comisiones → usuario), más el
-- índice que faltaba, que sí era real.
--
-- Regla para la próxima vez: para mirar el esquema, `pg_catalog`
-- (pg_constraint, pg_class...), nunca `information_schema` desde un rol
-- limitado.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    WITH fks AS (
      SELECT c.conname, c.conrelid, a.attname col, c.confrelid
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace AND n.nspname = 'public'
      JOIN LATERAL unnest(c.conkey) k(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
    ),
    duplicadas AS (
      SELECT conrelid, col, confrelid FROM fks GROUP BY conrelid, col, confrelid HAVING count(*) > 1
    )
    SELECT f.conname, f.conrelid::regclass::text AS tabla
    FROM fks f
    JOIN duplicadas d ON d.conrelid = f.conrelid AND d.col = f.col AND d.confrelid = f.confrelid
    WHERE f.conname LIKE 'fk\_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.tabla, r.conname);
  END LOOP;
END $$;
