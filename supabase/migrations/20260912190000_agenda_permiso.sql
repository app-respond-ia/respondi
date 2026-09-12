-- Agenda (12-09-2026), primera parte. Solo añade.
--
-- Va en un archivo aparte porque Postgres no deja usar un valor nuevo de una
-- lista (enum) en la misma transacción en que se añade: las tablas y
-- políticas de la agenda, que ya lo usan, van en el archivo siguiente.

-- 1. La sección de permisos "Agenda": quién puede ver y tocar citas,
--    recursos y ajustes de la agenda de cada sucursal.
ALTER TYPE public.seccion_permiso ADD VALUE IF NOT EXISTS 'agenda';

-- 2. Para que la base de datos pueda impedir por sí misma que dos citas
--    ocupen el mismo recurso a la misma hora (restricción de solapamiento
--    sobre un rango de tiempo + el id del recurso).
CREATE EXTENSION IF NOT EXISTS btree_gist;
