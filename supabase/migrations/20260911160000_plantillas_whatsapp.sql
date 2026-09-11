-- Plantillas de WhatsApp de verdad (11-09-2026).
-- WhatsApp solo deja escribir libremente a un cliente durante las 24 h
-- siguientes a su último mensaje; después, solo con una plantilla aprobada
-- por Meta. Hasta ahora las plantillas se guardaban en Respondi pero nunca se
-- mandaban a Meta, y no se podían enviar desde Chats.
-- Todo lo de aquí es añadir: no cambia ni borra datos.

-- 1. La cuenta de WhatsApp Business del canal: Meta crea y lista las
--    plantillas por cuenta, no por número.
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS meta_waba_id text;

COMMENT ON COLUMN public.channels.meta_waba_id IS
  'Identificador de la cuenta de WhatsApp Business (WABA) del número. Hace falta para crear y consultar plantillas.';

-- 2. Las partes de la plantilla tal como las tiene Meta (cabecera, cuerpo,
--    pie, botones), para enseñarla y saber qué huecos hay que rellenar al
--    enviarla. `contenido` sigue siendo el texto del cuerpo.
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS componentes jsonb;

-- Meta también pausa o desactiva plantillas (por quejas o baja calidad)
ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_estado_check;
ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_estado_check
  CHECK (estado = ANY (ARRAY['pendiente', 'aprobada', 'rechazada', 'pausada', 'desactivada']));

-- 3. Un mensaje enviado con plantilla: cuál y con qué valores en sus huecos.
--    `contenido` guarda el texto ya rellenado, que es lo que se ve en Chats.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS plantilla jsonb;

COMMENT ON COLUMN public.messages.plantilla IS
  'Si el mensaje es una plantilla de WhatsApp: {nombre, idioma, parametros}. Se envía como plantilla en vez de como texto.';
