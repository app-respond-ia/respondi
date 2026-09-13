-- ---------------------------------------------------------------------------
-- EL ASISTENTE DE IA DEL PANEL (14-09-2026)
--
-- Decidido con Jorge: el chat de soporte no solo responde dudas, también
-- hace cosas. El cliente pide "créame una etiqueta de devoluciones" y el
-- asistente lo prepara, lo enseña, y lo ejecuta cuando el cliente confirma.
--
-- Tres reglas que marcan el diseño:
--   1. El asistente actúa con los permisos de quien está dentro, nunca más.
--      Por eso cada herramienta llama a la MISMA acción del panel, que ya
--      comprueba permisos, valida y registra auditoría.
--   2. Nada se ejecuta sin confirmar. La propuesta se guarda aquí, en el
--      servidor, con sus argumentos; el navegador solo manda "confirmo esta".
--      Así nadie puede cambiar los argumentos entre la propuesta y el sí.
--   3. En el registro de cambios tiene que verse que lo hizo la IA y también
--      qué usuario se lo pidió (`audit_log.por_asistente` + `user_id`).
-- ---------------------------------------------------------------------------

-- 1. En el registro de cambios: hecho por el asistente, a petición de X
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS por_asistente boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.audit_log.por_asistente IS
  'true si el cambio lo ejecutó el asistente de IA. El usuario que se lo pidió sigue en user_id.';

-- 2. Las conversaciones con el asistente
CREATE TABLE IF NOT EXISTS public.asistente_conversaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.sucursales (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  titulo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asistente_conversaciones_usuario
  ON public.asistente_conversaciones (user_id, actualizado_en DESC);

-- 3. Los mensajes de cada conversación
CREATE TABLE IF NOT EXISTS public.asistente_mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES public.asistente_conversaciones (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  papel text NOT NULL CHECK (papel IN ('usuario', 'asistente')),
  contenido text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asistente_mensajes_conversacion
  ON public.asistente_mensajes (conversacion_id, created_at);

-- 4. Lo que el asistente propone hacer. Se ejecuta solo tras un "confirmo".
CREATE TABLE IF NOT EXISTS public.asistente_acciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES public.asistente_conversaciones (id) ON DELETE CASCADE,
  mensaje_id uuid REFERENCES public.asistente_mensajes (id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.sucursales (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  -- Qué herramienta y con qué argumentos, tal cual los pidió la IA
  herramienta text NOT NULL,
  argumentos jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Lo que se le enseña al cliente en la tarjeta de confirmación
  resumen text NOT NULL,
  -- Sección de permisos a la que pertenece, para volver a comprobarla al
  -- confirmar (los permisos pueden haber cambiado entre medias)
  seccion text,
  -- Borrar algo pide una confirmación más dura en la pantalla
  destructiva boolean NOT NULL DEFAULT false,
  estado text NOT NULL DEFAULT 'propuesta'
    CHECK (estado IN ('propuesta', 'hecha', 'rechazada', 'fallida', 'caducada')),
  resultado jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ejecutada_en timestamptz
);

CREATE INDEX IF NOT EXISTS asistente_acciones_conversacion
  ON public.asistente_acciones (conversacion_id, created_at);

-- 5. Seguridad: cada uno ve y usa solo sus conversaciones con el asistente.
--    No hay nada compartido: es el chat privado de cada usuario.
ALTER TABLE public.asistente_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistente_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistente_acciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asistente_conversaciones_propias ON public.asistente_conversaciones;
CREATE POLICY asistente_conversaciones_propias ON public.asistente_conversaciones FOR ALL
  USING ((SELECT is_super_admin()) OR (user_id = (SELECT auth.uid()) AND tenant_id = (SELECT auth_tenant_id())))
  WITH CHECK ((SELECT is_super_admin()) OR (user_id = (SELECT auth.uid()) AND tenant_id = (SELECT auth_tenant_id())));

DROP POLICY IF EXISTS asistente_mensajes_propios ON public.asistente_mensajes;
CREATE POLICY asistente_mensajes_propios ON public.asistente_mensajes FOR ALL
  USING ((SELECT is_super_admin()) OR EXISTS (
    SELECT 1 FROM public.asistente_conversaciones c
    WHERE c.id = conversacion_id AND c.user_id = (SELECT auth.uid())
  ))
  WITH CHECK ((SELECT is_super_admin()) OR EXISTS (
    SELECT 1 FROM public.asistente_conversaciones c
    WHERE c.id = conversacion_id AND c.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS asistente_acciones_propias ON public.asistente_acciones;
CREATE POLICY asistente_acciones_propias ON public.asistente_acciones FOR ALL
  USING ((SELECT is_super_admin()) OR (user_id = (SELECT auth.uid()) AND tenant_id = (SELECT auth_tenant_id())))
  WITH CHECK ((SELECT is_super_admin()) OR (user_id = (SELECT auth.uid()) AND tenant_id = (SELECT auth_tenant_id())));
