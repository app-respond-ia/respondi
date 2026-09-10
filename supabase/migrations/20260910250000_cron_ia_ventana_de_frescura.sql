-- Acota el cron de la IA a los mensajes recientes.
--
-- Hasta ahora el filtro solo tenía suelo ("que hayan pasado al menos N
-- segundos desde el último mensaje") pero no techo. Una conversación cuyo
-- último mensaje fuera del cliente y que por lo que sea no se llegara a
-- contestar seguía siendo candidata para siempre: se revisaba cada 20
-- segundos, indefinidamente, gastando recursos por un mensaje de hace días.
--
-- Y aunque no gastara nada, contestar cuatro días después a un "hola" es
-- peor que no contestar: el cliente ya no está ahí y la respuesta llega
-- descolocada.
--
-- Se añade un techo de 6 horas. Pasado ese tiempo la conversación deja de
-- ser candidata automática; sigue visible en el panel para que la atienda
-- una persona, que es lo que corresponde a esas alturas.

CREATE OR REPLACE FUNCTION public.disparar_webhook_ia()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  req_id bigint;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_webhook_secret' LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'El secreto cron_webhook_secret no está configurado en Vault';
  END IF;

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
      -- Suelo: ha pasado la ventana de agrupación (el cliente dejó de escribir)
      AND c.fecha_ultimo_mensaje < now() - (s.tiempo_agrupacion_seg || ' seconds')::interval
      -- Techo: el mensaje sigue siendo reciente
      AND c.fecha_ultimo_mensaje > now() - interval '6 hours'
      AND (
        SELECT remitente
        FROM public.messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.timestamp DESC, m.id DESC
        LIMIT 1
      ) = 'cliente'
  LOOP
    UPDATE public.conversations
    SET ia_procesando_desde = now()
    WHERE id = r.conversation_id;

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

REVOKE EXECUTE ON FUNCTION public.disparar_webhook_ia() FROM PUBLIC;
