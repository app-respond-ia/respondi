-- WhatsApp directo con Meta, sin n8n (decidido con Jorge el 11-09-2026).
--
-- Cada cliente conecta su propio número de WhatsApp de Meta pegando sus
-- claves en Respondi. La app recibe los mensajes en una dirección propia de
-- cada canal y envía las respuestas directamente a Meta.

-- ---------------------------------------------------------------------------
-- 1. Datos del canal
-- ---------------------------------------------------------------------------
-- Las claves (token de acceso y clave secreta de la app de Meta) NO se
-- guardan en esta tabla: van cifradas en la caja fuerte de Supabase (Vault) y
-- aquí solo queda la referencia. Así nunca viajan a la pantalla ni aparecen
-- en una consulta de la tabla.
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS secreto_id uuid;
-- Lo que Meta pide pegar al configurar el aviso de mensajes (webhook). No es
-- una clave: solo sirve para que Meta demuestre que la dirección es nuestra.
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS verify_token text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS meta_phone_number_id text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS numero_visible text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS nombre_verificado text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS ultimo_error text;

-- Un número de WhatsApp solo puede estar conectado a un canal
CREATE UNIQUE INDEX IF NOT EXISTS channels_meta_phone_number_id_unico
  ON public.channels (meta_phone_number_id) WHERE meta_phone_number_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Guardar y leer las claves de un canal (solo el servidor de la app)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guardar_credenciales_canal(p_channel_id uuid, p_credenciales text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secreto uuid;
BEGIN
  SELECT secreto_id INTO v_secreto FROM public.channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canal no encontrado';
  END IF;

  IF v_secreto IS NOT NULL AND EXISTS (SELECT 1 FROM vault.secrets WHERE id = v_secreto) THEN
    PERFORM vault.update_secret(v_secreto, p_credenciales);
  ELSE
    v_secreto := vault.create_secret(p_credenciales, 'canal_' || p_channel_id::text, 'Claves del canal de mensajería');
    UPDATE public.channels SET secreto_id = v_secreto WHERE id = p_channel_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.leer_credenciales_canal(p_channel_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ds.decrypted_secret
  FROM public.channels c
  JOIN vault.decrypted_secrets ds ON ds.id = c.secreto_id
  WHERE c.id = p_channel_id
$$;

CREATE OR REPLACE FUNCTION public.borrar_credenciales_canal(p_channel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secreto uuid;
BEGIN
  SELECT secreto_id INTO v_secreto FROM public.channels WHERE id = p_channel_id;
  IF v_secreto IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secreto;
  END IF;
  UPDATE public.channels SET secreto_id = NULL WHERE id = p_channel_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guardar_credenciales_canal(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.leer_credenciales_canal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.borrar_credenciales_canal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_credenciales_canal(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.leer_credenciales_canal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.borrar_credenciales_canal(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Estado de envío de cada mensaje que sale hacia el cliente
-- ---------------------------------------------------------------------------
-- pendiente → enviado → entregado → leido, o fallido. "reintentar" es un
-- fallo pasajero (Meta caído, sin conexión...) que el sistema vuelve a
-- intentar solo. Los mensajes del cliente no llevan estado.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS estado_envio text
  CHECK (estado_envio IN ('pendiente', 'enviado', 'entregado', 'leido', 'fallido', 'reintentar'));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS error_envio text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS intentos_envio integer NOT NULL DEFAULT 0;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ultimo_intento_envio timestamptz;

CREATE INDEX IF NOT EXISTS idx_messages_envio_pendiente
  ON public.messages (ultimo_intento_envio)
  WHERE estado_envio IN ('pendiente', 'reintentar');

-- ---------------------------------------------------------------------------
-- 4. Reintentos automáticos de los envíos que fallaron por algo pasajero
-- ---------------------------------------------------------------------------
-- Solo llama a la app si de verdad hay algo que reintentar, para no gastar
-- una llamada cada minuto en balde.
CREATE OR REPLACE FUNCTION public.disparar_reintentos_envio()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.messages
    WHERE (estado_envio = 'reintentar' AND ultimo_intento_envio < now() - interval '1 minute')
       OR (estado_envio = 'pendiente' AND ultimo_intento_envio < now() - interval '3 minutes')
  ) THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_webhook_secret' LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'El secreto cron_webhook_secret no está configurado en Vault';
  END IF;

  PERFORM net.http_post(
    url := 'https://respondi.vercel.app/api/cron/reintentar-envios',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.disparar_reintentos_envio() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('reintentar-envios-whatsapp', '* * * * *', 'SELECT disparar_reintentos_envio();');
