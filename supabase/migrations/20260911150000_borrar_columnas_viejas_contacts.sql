-- Borra las columnas obsoletas de `contacts`: trato, modo, respuesta_auto y
-- nota. Desde el 11-09-2026 cada sucursal tiene su propia ficha de cada
-- contacto en `contactos_sucursal` (migración 20260911120000), y ni la app ni
-- ninguna función, vista o regla de la base las usa ya.
--
-- Autorizado por Jorge el 11-09-2026 ("borra lo que haga falta").
-- Comprobado antes de borrar: ningún contacto tenía datos propios en ellas
-- (todos con trato 'normal' y el resto vacío), así que no se pierde nada. Solo
-- dependían de ellas sus propias comprobaciones (contacts_trato_check,
-- contacts_modo_check) y el valor por defecto de trato, que se van con ellas.

ALTER TABLE public.contacts
  DROP COLUMN IF EXISTS trato,
  DROP COLUMN IF EXISTS modo,
  DROP COLUMN IF EXISTS respuesta_auto,
  DROP COLUMN IF EXISTS nota;
