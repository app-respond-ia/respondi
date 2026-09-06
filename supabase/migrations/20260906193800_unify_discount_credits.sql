-- 1. Eliminar las firmas antiguas para evitar ambigüedades por sobrecarga
DROP FUNCTION IF EXISTS public.descontar_cuota_ia(uuid, integer, text);
DROP FUNCTION IF EXISTS public.descontar_credito_ia(uuid, uuid);

-- 2. Crear la función unificada y segura
CREATE OR REPLACE FUNCTION public.descontar_cuota_ia(
  p_tenant_id uuid, 
  p_cantidad integer, 
  p_descripcion text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_origen public.origen_movimiento DEFAULT NULL
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ultimo_saldo integer;
  v_nuevo_saldo integer;
BEGIN
  -- BLOQUEO CRÍTICO: Bloqueamos la fila de la organización para serializar
  -- todas las transacciones de descuentos para este cliente.
  PERFORM 1 FROM public.organizaciones WHERE id = p_tenant_id FOR UPDATE;

  SELECT saldo INTO v_ultimo_saldo
  FROM public.message_quotas
  WHERE tenant_id = p_tenant_id
  ORDER BY timestamp DESC
  LIMIT 1;

  IF v_ultimo_saldo IS NULL THEN
    v_ultimo_saldo := 0;
  END IF;

  v_nuevo_saldo := v_ultimo_saldo - p_cantidad;

  INSERT INTO public.message_quotas (
    tenant_id, tipo, cantidad, saldo, descripcion, branch_id, origen
  ) VALUES (
    p_tenant_id, 'debito', p_cantidad, v_nuevo_saldo, p_descripcion, p_branch_id, p_origen
  );

  RETURN v_nuevo_saldo;
END;
$function$;

-- 3. Blindar la función (Defensa en Profundidad)
REVOKE ALL ON FUNCTION public.descontar_cuota_ia(uuid, integer, text, uuid, public.origen_movimiento) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.descontar_cuota_ia(uuid, integer, text, uuid, public.origen_movimiento) TO service_role;
