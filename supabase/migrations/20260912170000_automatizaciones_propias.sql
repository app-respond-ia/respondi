-- Automatizaciones propias del cliente (decidido con Jorge el 12-09-2026):
-- además de las 37 que vienen hechas, el cliente puede crear las suyas con el
-- editor de recetas, y moldear las nuestras. Una propia es una fila más de
-- `automatizaciones` con `receta` rellena y `clave` que empieza por
-- `propia_`. Todo lo de aquí añade: no cambia ni borra nada.
ALTER TABLE public.automatizaciones
  ADD COLUMN IF NOT EXISTS descripcion text,
  -- Las propias: ¿es promoción? Entonces solo a quien haya aceptado recibirlas
  ADD COLUMN IF NOT EXISTS marketing boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.automatizaciones.receta IS
  'Vacía = la receta del catálogo (por `clave`). Rellena = receta propia del cliente, o una del catálogo moldeada por él.';
COMMENT ON COLUMN public.automatizaciones.marketing IS
  'Solo para las propias (clave propia_*): si es promoción, el motor solo escribe a quien acepte promociones.';
