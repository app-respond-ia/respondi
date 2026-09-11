-- Dos reglas del ciclo de vida de una conversación que chocaban entre sí.
--
-- 1. El cron de la IA solo recogía una conversación si el ÚLTIMO mensaje era
--    del cliente. Si el cliente mandaba un segundo mensaje mientras la IA
--    estaba contestando el primero, la respuesta de la IA quedaba guardada
--    DESPUÉS de ese segundo mensaje, el último pasaba a ser de la IA, y el
--    segundo mensaje no se contestaba nunca.
--
--    Ahora la regla es la misma que usa la propia IA para decidir qué
--    contestar: hay mensajes del cliente sin contestar (`agrupado` no puesto).
--    Se ignoran los que son anteriores al último mensaje de un agente, porque
--    esos ya los ha contestado una persona y la IA no debe volver sobre ellos.
--
-- 2. El cierre por 24 h de inactividad cerraba también las conversaciones que
--    estaban esperando a que abriera el negocio (bloqueadas por
--    'fuera_horario'). Un cliente que escribe el sábado recibe «estamos
--    cerrados, te contestamos al abrir»; el domingo la conversación se cerraba
--    sola y el lunes, al abrir, ya no había nada que contestar: la promesa se
--    perdía. Esas conversaciones ya no se cierran solas; cuando el negocio
--    abre, la IA contesta y a partir de ahí corre el plazo normal.
--
-- 3. Las conversaciones que creó la versión anterior de la entrada de
--    mensajes no tienen `fecha_ultimo_mensaje` (5 en "Mi organización", del
--    08-09-2026). Con la fecha vacía la comparación de las 24 h nunca se
--    cumple, así que no se cerraban nunca. Si falta, se cuenta desde que
--    empezó la conversación.

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
      -- Hay algo del cliente que nadie ha contestado todavía
      AND EXISTS (
        SELECT 1
        FROM public.messages m
        WHERE m.conversation_id = c.id
          AND m.remitente = 'cliente'
          AND m.agrupado IS NOT TRUE
          AND m.timestamp > COALESCE((
            SELECT max(a.timestamp)
            FROM public.messages a
            WHERE a.conversation_id = c.id
              AND a.remitente = 'agente'
          ), '-infinity'::timestamptz)
      )
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

CREATE OR REPLACE FUNCTION public.disparar_webhook_resumen_ia()
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
    SELECT id
    FROM public.conversations
    WHERE estado = 'activa'
      AND COALESCE(fecha_ultimo_mensaje, fecha_inicio) < now() - interval '24 hours'
      AND (fecha_ultimo_resumen IS NULL OR fecha_ultimo_resumen < COALESCE(fecha_ultimo_mensaje, fecha_inicio))
      AND (ia_procesando_desde IS NULL OR ia_procesando_desde < now() - interval '2 minutes')
      -- No se cierra lo que está esperando a que abra el negocio
      AND motivo_bloqueo IS DISTINCT FROM 'fuera_horario'
  LOOP
    UPDATE public.conversations
    SET ia_procesando_desde = now()
    WHERE id = r.id;
    SELECT net.http_post(
        url := 'https://respondi.vercel.app/api/ai/summarize',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_secret
        ),
        body := json_build_object('conversation_id', r.id)::jsonb
    ) INTO req_id;
  END LOOP;
END;
$$;

-- CREATE OR REPLACE conserva los permisos, pero se dejan explícitos: estas
-- funciones solo las ejecuta el cron.
REVOKE EXECUTE ON FUNCTION public.disparar_webhook_ia() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.disparar_webhook_resumen_ia() FROM PUBLIC;
