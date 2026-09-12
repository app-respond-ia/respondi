-- El cron `revisar-bloqueos` (cada 5 minutos) llamaba a la app con el tiempo
-- de espera por defecto de pg_net (5 segundos). Cuando Vercel tarda en
-- arrancar la función, la llamada se daba por perdida ("Timeout of 5000 ms
-- reached" en net._http_response) aunque la app la terminara igual. Los
-- otros crones (correo, reintentos, automatizaciones) ya esperan 60 s: este
-- se iguala. Visto el 12-09-2026 al verificar el cron de automatizaciones.
CREATE OR REPLACE FUNCTION public.disparar_revision_bloqueos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_webhook_secret' LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'El secreto cron_webhook_secret no está configurado en Vault';
  END IF;

  PERFORM net.http_post(
    url := 'https://respondi.vercel.app/api/cron/revisar-bloqueos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.disparar_revision_bloqueos() FROM PUBLIC, anon, authenticated;
