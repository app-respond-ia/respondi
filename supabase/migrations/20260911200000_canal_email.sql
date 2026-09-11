-- Canal de correo electrónico (11-09-2026). Decidido con Jorge: opción A, el
-- negocio conecta su propio buzón con sus datos (IMAP para leer, SMTP para
-- enviar) y la IA contesta desde su propia dirección. Todo lo de aquí añade:
-- no cambia ni borra datos.

-- 1. El tipo de canal y la forma de conectarlo
ALTER TYPE public.tipo_canal ADD VALUE IF NOT EXISTS 'email';
ALTER TYPE public.metodo_canal ADD VALUE IF NOT EXISTS 'imap_smtp';

-- 2. Ajustes no secretos del canal: servidores de correo, nombre con el que
--    se firma, firma, y hasta qué correo se ha leído. La contraseña va a la
--    caja fuerte (Vault), como las claves de Meta.
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS configuracion jsonb;

COMMENT ON COLUMN public.channels.configuracion IS
  'Ajustes no secretos del canal. Correo: {imap:{host,puerto,seguro}, smtp:{host,puerto,seguro}, usuario, nombre_remitente, firma, lectura:{uidvalidity, ultimo_uid}}.';

-- 3. Para contestar dentro del mismo hilo de correo: el asunto y los
--    identificadores de los correos anteriores del hilo (cabecera References)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS asunto text,
  ADD COLUMN IF NOT EXISTS email_referencias text;

-- 4. Revisar los buzones conectados cada minuto
CREATE OR REPLACE FUNCTION public.disparar_revision_correos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.channels
    WHERE tipo = 'email' AND metodo = 'imap_smtp' AND estado = 'activo'
  ) THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_webhook_secret' LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'El secreto cron_webhook_secret no está configurado en Vault';
  END IF;

  PERFORM net.http_post(
    url := 'https://respondi.vercel.app/api/cron/revisar-correos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.disparar_revision_correos() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('revisar-correos', '* * * * *', 'SELECT disparar_revision_correos();');
