-- Cuándo caduca el token de Meta de un canal de WhatsApp (11-09-2026).
-- El token de prueba de Meta dura 24 h; si el cliente no lo cambia por uno de
-- "usuario del sistema" (que no caduca), su WhatsApp deja de funcionar al día
-- siguiente. Al conectar se pregunta a Meta y, si caduca, Canales lo avisa con
-- la fecha. Vacío = no caduca o no se sabe. Solo añade una columna.
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS token_caduca_en timestamptz;

COMMENT ON COLUMN public.channels.token_caduca_en IS
  'Cuándo caduca el token de Meta guardado (null: no caduca o no se sabe).';
