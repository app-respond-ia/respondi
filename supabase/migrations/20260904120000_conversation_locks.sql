ALTER TABLE conversations ADD COLUMN motivo_bloqueo text;
ALTER TABLE conversations ADD COLUMN bloqueada_desde timestamptz;

CREATE INDEX idx_conversations_bloqueadas ON conversations (motivo_bloqueo) WHERE motivo_bloqueo IS NOT NULL;

-- Actualizamos la función disparar_webhook_ia para excluir conversaciones bloqueadas
CREATE OR REPLACE FUNCTION disparar_webhook_ia()
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
  r record;
  req_id bigint;
  v_secret text;
BEGIN
  -- Lectura segura del Vault
  SELECT decrypted_secret INTO v_secret 
  FROM vault.decrypted_secrets 
  WHERE name = 'cron_webhook_secret' LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'El secreto cron_webhook_secret no está configurado en Vault';
  END IF;

  -- Selección de conversaciones candidatas
  FOR r IN
    SELECT 
      c.id as conversation_id,
      s.tiempo_agrupacion_seg
    FROM public.conversations c
    JOIN public.sucursales s ON s.id = c.branch_id
    WHERE c.estado = 'activa'
      AND c.ia_pausada = false
      AND c.motivo_bloqueo IS NULL
      AND (c.ia_procesando_desde IS NULL OR c.ia_procesando_desde < now() - interval '2 minutes')
      -- Condición 1: Ya pasó el tiempo de espera desde el último mensaje
      AND c.fecha_ultimo_mensaje < now() - (s.tiempo_agrupacion_seg || ' seconds')::interval
      -- Condición 2: El último mensaje absoluto de la conversación es del cliente
      AND (
        SELECT remitente 
        FROM public.messages m 
        WHERE m.conversation_id = c.id 
        ORDER BY m.timestamp DESC, m.id DESC 
        LIMIT 1
      ) = 'cliente'
  LOOP
    -- Bloqueo inmediato anti-condición de carrera
    UPDATE public.conversations 
    SET ia_procesando_desde = now() 
    WHERE id = r.conversation_id;

    -- Petición segura a Vercel con pg_net y URL de producción real
    SELECT net.http_post(
        url := 'https://respondi.vercel.app/api/ai/process',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_secret
        ),
        body := json_build_object('conversation_id', r.conversation_id)::jsonb
    ) INTO req_id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.disparar_webhook_ia() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disparar_webhook_ia() TO service_role, postgres;

-- Definimos el segundo cron (revisor de bloqueos)
CREATE OR REPLACE FUNCTION disparar_revision_bloqueos()
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
  req_id bigint;
  v_secret text;
BEGIN
  -- Usamos el mismo secreto
  SELECT decrypted_secret INTO v_secret 
  FROM vault.decrypted_secrets 
  WHERE name = 'cron_webhook_secret' LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'El secreto cron_webhook_secret no está configurado en Vault';
  END IF;

  SELECT net.http_post(
      url := 'https://respondi.vercel.app/api/cron/revisar-bloqueos',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      )
  ) INTO req_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.disparar_revision_bloqueos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disparar_revision_bloqueos() TO service_role, postgres;

-- Programar el cron para revisar bloqueos cada 5 minutos
SELECT cron.schedule('disparador-revision-bloqueos', '*/5 * * * *', 'SELECT disparar_revision_bloqueos();');
