-- Plantilla de reapertura y secciones de permisos (11-09-2026). Solo añade.

-- 1. La plantilla que la IA manda cuando el negocio abre y han pasado más de
--    24 h desde que el cliente escribió (WhatsApp no deja mandarle texto).
--    Es un ajuste del canal de WhatsApp de cada sucursal. Si se borra la
--    plantilla, el ajuste se queda vacío.
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS plantilla_reapertura_id uuid
  REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.channels.plantilla_reapertura_id IS
  'Plantilla aprobada que la IA envía si, al ir a contestar, han pasado más de 24 h desde el último mensaje del cliente.';

-- 2. Lo que el motor apunta en ai_logs en esos casos
ALTER TYPE public.resultado_ia ADD VALUE IF NOT EXISTS 'ventana_cerrada';
ALTER TYPE public.resultado_ia ADD VALUE IF NOT EXISTS 'plantilla_reapertura';

-- 3. Las secciones de permisos que usa la app y faltaban en la lista de la
--    base de datos (ver docs/arquitectura.md, "Permisos y roles"). Las que
--    sobran (blacklist, roles, soporte) se dejan: quitar valores de una lista
--    así obliga a rehacerla entera y no aporta nada.
ALTER TYPE public.seccion_permiso ADD VALUE IF NOT EXISTS 'contactos';
ALTER TYPE public.seccion_permiso ADD VALUE IF NOT EXISTS 'facturacion';
