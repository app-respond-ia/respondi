-- Cimientos de Shopify (12-09-2026): conectar la tienda del negocio y el
-- motor de automatizaciones. Todo lo de aquí añade: no cambia ni borra nada.
--
-- Dos piezas:
--   1. La tienda conectada (dominio + token en la caja fuerte), igual que un
--      canal de mensajería: cada cliente trae su propia cuenta.
--   2. El motor: cada automatización es una "receta" guardada (disparador →
--      condiciones → acciones → espera). Aquí se guarda cuáles tiene
--      encendidas cada sucursal y el registro de todo lo que hace, para que
--      nunca se escriba dos veces al mismo cliente por el mismo motivo.

-- ---------------------------------------------------------------------------
-- 1. La tienda conectada
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tiendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  -- De momento solo Shopify; la columna existe para no rehacer la tabla
  -- cuando entren WooCommerce u otras.
  plataforma text NOT NULL DEFAULT 'shopify' CHECK (plataforma IN ('shopify')),
  dominio text NOT NULL,
  nombre text,
  moneda text,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'activo', 'error', 'desconectado')),
  -- El token de la Admin API NO se guarda aquí: va cifrado en la caja fuerte
  -- (Vault) y aquí solo queda la referencia, como con Meta y el correo.
  secreto_id uuid,
  -- Lo no secreto: permisos concedidos, zona horaria de la tienda, ajustes.
  configuracion jsonb NOT NULL DEFAULT '{}'::jsonb,
  ultimo_error text,
  ultima_sincronizacion timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tiendas_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  CONSTRAINT tiendas_sucursal_fk FOREIGN KEY (branch_id)
    REFERENCES public.sucursales (id) ON DELETE CASCADE
);

-- Una tienda de cada plataforma por sucursal, y una misma tienda no puede
-- estar conectada a dos cuentas de Respondi a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS tiendas_sucursal_plataforma_unica
  ON public.tiendas (branch_id, plataforma);
CREATE UNIQUE INDEX IF NOT EXISTS tiendas_dominio_unico
  ON public.tiendas (lower(dominio));
CREATE INDEX IF NOT EXISTS idx_tiendas_tenant ON public.tiendas (tenant_id);

COMMENT ON TABLE public.tiendas IS
  'Tienda online conectada por el negocio (Shopify). El token va en Vault; aquí solo la referencia.';

-- ---------------------------------------------------------------------------
-- 2. Guardar y leer el token de una tienda (solo el servidor de la app)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guardar_credenciales_tienda(p_tienda_id uuid, p_credenciales text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secreto uuid;
BEGIN
  SELECT secreto_id INTO v_secreto FROM public.tiendas WHERE id = p_tienda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tienda no encontrada';
  END IF;

  IF v_secreto IS NOT NULL AND EXISTS (SELECT 1 FROM vault.secrets WHERE id = v_secreto) THEN
    PERFORM vault.update_secret(v_secreto, p_credenciales);
  ELSE
    v_secreto := vault.create_secret(p_credenciales, 'tienda_' || p_tienda_id::text, 'Claves de la tienda online');
    UPDATE public.tiendas SET secreto_id = v_secreto WHERE id = p_tienda_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.leer_credenciales_tienda(p_tienda_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ds.decrypted_secret
  FROM public.tiendas t
  JOIN vault.decrypted_secrets ds ON ds.id = t.secreto_id
  WHERE t.id = p_tienda_id
$$;

CREATE OR REPLACE FUNCTION public.borrar_credenciales_tienda(p_tienda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secreto uuid;
BEGIN
  SELECT secreto_id INTO v_secreto FROM public.tiendas WHERE id = p_tienda_id;
  IF v_secreto IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secreto;
  END IF;
  UPDATE public.tiendas SET secreto_id = NULL WHERE id = p_tienda_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guardar_credenciales_tienda(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.leer_credenciales_tienda(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.borrar_credenciales_tienda(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_credenciales_tienda(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.leer_credenciales_tienda(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.borrar_credenciales_tienda(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Lo que pasa en la tienda (avisos de Shopify y repasos programados)
-- ---------------------------------------------------------------------------
-- Shopify avisa en cuanto pasa algo (webhook) y espera respuesta rápida: se
-- apunta aquí y se procesa aparte. La clave única evita procesar dos veces el
-- mismo aviso cuando Shopify lo reintenta.
CREATE TABLE IF NOT EXISTS public.tienda_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  tienda_id uuid NOT NULL,
  tipo text NOT NULL,
  referencia text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  recibido_en timestamptz NOT NULL DEFAULT now(),
  procesado_en timestamptz,
  error text,
  CONSTRAINT tienda_eventos_tienda_fk FOREIGN KEY (tienda_id)
    REFERENCES public.tiendas (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS tienda_eventos_unicos
  ON public.tienda_eventos (tienda_id, tipo, referencia);
CREATE INDEX IF NOT EXISTS idx_tienda_eventos_pendientes
  ON public.tienda_eventos (recibido_en) WHERE procesado_en IS NULL;

COMMENT ON TABLE public.tienda_eventos IS
  'Avisos de la tienda (webhooks de Shopify) a la espera de que el motor los procese.';

-- ---------------------------------------------------------------------------
-- 4. Qué automatizaciones tiene encendidas cada sucursal
-- ---------------------------------------------------------------------------
-- El catálogo de automatizaciones (nombre, categoría, receta) vive en el
-- código, versionado con la app. Aquí solo se guarda cuáles están encendidas
-- y con qué ajustes. `receta` queda vacía para las de catálogo; el día que
-- haya editor visual, el cliente guardará ahí su propia receta sin tocar
-- nada más.
CREATE TABLE IF NOT EXISTS public.automatizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  clave text NOT NULL,
  nombre text,
  activa boolean NOT NULL DEFAULT false,
  ajustes jsonb NOT NULL DEFAULT '{}'::jsonb,
  receta jsonb,
  ultima_ejecucion timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automatizaciones_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  CONSTRAINT automatizaciones_sucursal_fk FOREIGN KEY (branch_id)
    REFERENCES public.sucursales (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS automatizaciones_sucursal_clave_unica
  ON public.automatizaciones (branch_id, clave);
CREATE INDEX IF NOT EXISTS idx_automatizaciones_activas
  ON public.automatizaciones (clave) WHERE activa;

COMMENT ON TABLE public.automatizaciones IS
  'Automatizaciones encendidas por sucursal. Nacen todas apagadas; el cliente enciende las que quiera.';

-- ---------------------------------------------------------------------------
-- 5. Registro y cola: cada vez que una automatización actúa
-- ---------------------------------------------------------------------------
-- Una fila = una automatización actuando sobre una cosa concreta (un pedido,
-- un carrito, un cliente). Sirve de dos cosas a la vez:
--   · cola de espera: estado 'programada' + ejecutar_en (el "espera 2 horas")
--   · registro: qué se hizo, cuándo y por qué se omitió
-- La clave única (automatización + referencia) es el freno de seguridad: no
-- se escribe dos veces al mismo cliente por el mismo motivo.
CREATE TABLE IF NOT EXISTS public.automatizaciones_ejecuciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  automatizacion_id uuid NOT NULL,
  clave text NOT NULL,
  referencia text,
  estado text NOT NULL DEFAULT 'programada'
    CHECK (estado IN ('programada', 'hecha', 'omitida', 'error', 'cancelada')),
  paso smallint NOT NULL DEFAULT 0,
  ejecutar_en timestamptz NOT NULL DEFAULT now(),
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  detalle text,
  contact_id uuid,
  conversation_id uuid,
  intentos smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automatizaciones_ejecuciones_automatizacion_fk FOREIGN KEY (automatizacion_id)
    REFERENCES public.automatizaciones (id) ON DELETE CASCADE,
  CONSTRAINT automatizaciones_ejecuciones_contacto_fk FOREIGN KEY (contact_id)
    REFERENCES public.contacts (id) ON DELETE SET NULL,
  CONSTRAINT automatizaciones_ejecuciones_conversacion_fk FOREIGN KEY (conversation_id)
    REFERENCES public.conversations (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS automatizaciones_ejecuciones_unicas
  ON public.automatizaciones_ejecuciones (automatizacion_id, referencia)
  WHERE referencia IS NOT NULL AND estado <> 'error';
CREATE INDEX IF NOT EXISTS idx_automatizaciones_ejecuciones_cola
  ON public.automatizaciones_ejecuciones (ejecutar_en) WHERE estado = 'programada';
CREATE INDEX IF NOT EXISTS idx_automatizaciones_ejecuciones_historial
  ON public.automatizaciones_ejecuciones (branch_id, created_at DESC);

COMMENT ON TABLE public.automatizaciones_ejecuciones IS
  'Cola y registro del motor: una fila por cada vez que una automatización actúa sobre algo.';

-- ---------------------------------------------------------------------------
-- 6. Quién puede ver y tocar todo esto
-- ---------------------------------------------------------------------------
-- Mismo criterio que los canales de mensajería: solo gente de la misma
-- cuenta, de esa sucursal, y con permiso de escritura en Canales.
ALTER TABLE public.tiendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tienda_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automatizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automatizaciones_ejecuciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tiendas_ver ON public.tiendas;
CREATE POLICY tiendas_ver ON public.tiendas FOR SELECT USING (
  (SELECT is_super_admin())
  OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales()))
);

DROP POLICY IF EXISTS tiendas_cambiar ON public.tiendas;
CREATE POLICY tiendas_cambiar ON public.tiendas FOR ALL USING (
  (SELECT is_super_admin())
  OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())
      AND auth_puede(branch_id, 'canales', 'escritura'))
) WITH CHECK (
  (SELECT is_super_admin())
  OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())
      AND auth_puede(branch_id, 'canales', 'escritura'))
);

DROP POLICY IF EXISTS automatizaciones_ver ON public.automatizaciones;
CREATE POLICY automatizaciones_ver ON public.automatizaciones FOR SELECT USING (
  (SELECT is_super_admin())
  OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales()))
);

DROP POLICY IF EXISTS automatizaciones_cambiar ON public.automatizaciones;
CREATE POLICY automatizaciones_cambiar ON public.automatizaciones FOR ALL USING (
  (SELECT is_super_admin())
  OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())
      AND auth_puede(branch_id, 'canales', 'escritura'))
) WITH CHECK (
  (SELECT is_super_admin())
  OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())
      AND auth_puede(branch_id, 'canales', 'escritura'))
);

-- El registro y los avisos de la tienda se ven, pero no se tocan a mano:
-- los escribe el servidor de la app.
DROP POLICY IF EXISTS automatizaciones_ejecuciones_ver ON public.automatizaciones_ejecuciones;
CREATE POLICY automatizaciones_ejecuciones_ver ON public.automatizaciones_ejecuciones FOR SELECT USING (
  (SELECT is_super_admin())
  OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales()))
);

DROP POLICY IF EXISTS tienda_eventos_ver ON public.tienda_eventos;
CREATE POLICY tienda_eventos_ver ON public.tienda_eventos FOR SELECT USING (
  (SELECT is_super_admin())
  OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales()))
);

-- ---------------------------------------------------------------------------
-- 7. El latido del motor: una vez por minuto, y solo si hay algo que hacer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disparar_automatizaciones()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.automatizaciones_ejecuciones
    WHERE estado = 'programada' AND ejecutar_en <= now()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.tienda_eventos WHERE procesado_en IS NULL
  ) THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_webhook_secret' LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'El secreto cron_webhook_secret no está configurado en Vault';
  END IF;

  PERFORM net.http_post(
    url := 'https://respondi.vercel.app/api/cron/automatizaciones',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.disparar_automatizaciones() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('automatizaciones', '* * * * *', 'SELECT disparar_automatizaciones();');
