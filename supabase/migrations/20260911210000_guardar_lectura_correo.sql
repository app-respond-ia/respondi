-- Canal de correo: la revisión de cada minuto apunta hasta qué correo ha
-- leído SIN tocar el resto de ajustes del canal. Antes guardaba la
-- configuración entera tal como la leyó al empezar, y si el cliente cambiaba
-- su firma o sus servidores mientras tanto, se perdía el cambio. Solo añade
-- una función: no cambia datos.
CREATE OR REPLACE FUNCTION public.guardar_lectura_correo(p_channel_id uuid, p_direccion text, p_lectura jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.channels
  SET configuracion = jsonb_set(coalesce(configuracion, '{}'::jsonb), '{lectura}', p_lectura)
  WHERE id = p_channel_id
    -- Si mientras tanto se ha conectado otro buzón, lo leído no es suyo
    AND configuracion->>'direccion' = p_direccion;
$$;

REVOKE EXECUTE ON FUNCTION public.guardar_lectura_correo(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_lectura_correo(uuid, text, jsonb) TO service_role;
