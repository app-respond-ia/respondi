-- Un correo puede traer varios archivos. Hasta ahora solo se guardaba el
-- primero y se avisaba de cuántos más había. `adjuntos` guarda todos (el
-- primero sigue también en media_url/media_tipo, que es lo que mira la IA para
-- las fotos). Solo añade una columna: no cambia nada de lo guardado.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS adjuntos jsonb;

COMMENT ON COLUMN public.messages.adjuntos IS
  'Archivos del mensaje: [{ruta, tipo, nombre}]. El primero coincide con media_url/media_tipo.';
