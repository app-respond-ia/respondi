-- Versiones e historial de las plantillas de WhatsApp (13-09-2026).
-- Decidido con Jorge: cada cliente puede editar cualquier plantilla (también
-- las prediseñadas). Al editarla se crea una VERSIÓN nueva, que va a Meta a
-- revisión con nombre "<familia>_v<n>"; mientras Meta la revisa se sigue
-- usando la versión en uso, y se puede volver a cualquier versión aprobada.
-- Meta no permite usar una plantilla editada hasta que la vuelve a aprobar,
-- por eso cada versión es una plantilla distinta en Meta.

ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS familia text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS en_uso boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activar_al_aprobar boolean NOT NULL DEFAULT false,
  -- Qué dato va en cada hueco cuando la manda una automatización
  -- (["cliente","pedido","total"]); null si la plantilla es del cliente
  ADD COLUMN IF NOT EXISTS huecos jsonb,
  ADD COLUMN IF NOT EXISTS ejemplos jsonb,
  -- De dónde salió: 'predisenada' (Respondi), 'cliente' (escrita en
  -- Respondi) o 'meta' (creada en Meta y traída al actualizar)
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS creado_por uuid;

-- Las que ya existen: familia y versión salen del nombre
UPDATE public.whatsapp_templates
SET familia = regexp_replace(nombre, '_v[0-9]+$', ''),
    version = COALESCE(NULLIF(substring(nombre from '_v([0-9]+)$'), '')::integer, 1),
    origen = CASE WHEN nombre LIKE 'respondi\_%' THEN 'predisenada' ELSE origen END
WHERE familia IS NULL;

-- En uso: la versión aprobada más alta de cada familia (si ninguna está
-- aprobada, la más alta)
WITH elegida AS (
  SELECT DISTINCT ON (channel_id, familia, idioma) id
  FROM public.whatsapp_templates
  ORDER BY channel_id, familia, idioma, (estado = 'aprobada') DESC, version DESC
)
UPDATE public.whatsapp_templates t SET en_uso = (t.id IN (SELECT id FROM elegida));

ALTER TABLE public.whatsapp_templates ALTER COLUMN familia SET NOT NULL;

-- Si alguien inserta sin familia (código viejo, pruebas), se rellena sola
CREATE OR REPLACE FUNCTION public.whatsapp_templates_rellenar_familia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.familia IS NULL OR NEW.familia = '' THEN
    NEW.familia := regexp_replace(NEW.nombre, '_v[0-9]+$', '');
    NEW.version := COALESCE(NULLIF(substring(NEW.nombre from '_v([0-9]+)$'), '')::integer, 1);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS whatsapp_templates_familia ON public.whatsapp_templates;
CREATE TRIGGER whatsapp_templates_familia
  BEFORE INSERT ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_templates_rellenar_familia();

-- Un estado más: borrada en Meta pero guardada aquí como historial
ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_estado_check;
ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_estado_check
  CHECK (estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text, 'pausada'::text, 'desactivada'::text, 'borrada'::text]));
ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_origen_check;
ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_origen_check
  CHECK (origen = ANY (ARRAY['meta'::text, 'cliente'::text, 'predisenada'::text]));

-- Solo una versión en uso por familia e idioma
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_en_uso_unica
  ON public.whatsapp_templates (channel_id, familia, idioma) WHERE en_uso;
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_familia
  ON public.whatsapp_templates (channel_id, familia, idioma, version DESC);
