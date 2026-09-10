-- Los días de prueba estaban fijos en el código de `crear_cuenta_completa`
-- (`CURRENT_DATE + INTERVAL '14 days'`), así que cambiar la duración del
-- trial obligaba a tocar la base de datos a mano. Pasa a ser una columna más
-- del plan, editable desde /superadmin/planes como el resto de límites.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS dias_trial integer NOT NULL DEFAULT 14;

COMMENT ON COLUMN public.plans.dias_trial IS
  'Duración en días del periodo de prueba al dar de alta con este plan.';

-- La función pasa a leer la duración del plan. Se mantiene el 14 como último
-- recurso por si algún plan quedara sin valor.
CREATE OR REPLACE FUNCTION public.crear_cuenta_completa(
  p_user_id uuid,
  p_email text,
  p_nombre text,
  p_org_nombre text,
  p_plan_nombre text DEFAULT 'Trial'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_sucursal_id uuid;
  v_rol_propietario_id uuid;
  v_plan_id uuid;
  v_creditos_iniciales integer;
  v_dias_trial integer;
BEGIN
  -- 0. Buscar el plan por nombre (arregla el bug de plan_id ausente)
  SELECT id, creditos_diarios_trial, dias_trial
    INTO v_plan_id, v_creditos_iniciales, v_dias_trial
  FROM public.plans WHERE nombre = p_plan_nombre;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_nombre;
  END IF;

  -- 1. Crear organización (ahora SÍ con plan_id)
  INSERT INTO public.organizaciones (nombre, plan_id, estado, trial_activo, fecha_inicio, fecha_vencimiento)
  VALUES (p_org_nombre, v_plan_id, 'trial', true, CURRENT_DATE,
          CURRENT_DATE + (COALESCE(v_dias_trial, 14) || ' days')::interval)
  RETURNING id INTO v_org_id;

  -- 2. Crear sucursal base
  INSERT INTO public.sucursales (tenant_id, nombre, activa, onboarding_paso, onboarding_completado)
  VALUES (v_org_id, 'Principal', true, 0, false)
  RETURNING id INTO v_sucursal_id;

  -- 3. Crear rol Propietario
  INSERT INTO public.roles_personalizados (tenant_id, nombre, descripcion, nivel, permisos, es_propietario)
  VALUES (v_org_id, 'Propietario', 'Acceso total a la organización. No se puede editar ni eliminar.', 1, '[]'::jsonb, true)
  RETURNING id INTO v_rol_propietario_id;

  -- 4. Crear usuario
  INSERT INTO public.users (id, tenant_id, branch_id, email, nombre, rol, rol_personalizado_id, invitacion_aceptada)
  VALUES (p_user_id, v_org_id, v_sucursal_id, p_email, p_nombre, 'tenant_user', v_rol_propietario_id, true);

  -- 5. Vincular usuario a sucursal
  INSERT INTO public.user_branches (user_id, branch_id)
  VALUES (p_user_id, v_sucursal_id);

  -- 6. Sembrar créditos iniciales (usa el valor real del plan, no un número fijo)
  INSERT INTO public.message_quotas (tenant_id, tipo, cantidad, saldo, descripcion, origen)
  VALUES (v_org_id, 'abono', COALESCE(v_creditos_iniciales, 100), COALESCE(v_creditos_iniciales, 100), 'Cuota inicial trial', 'recarga_plan');

  RETURN v_org_id;
END;
$$;

-- CREATE OR REPLACE reinstala los permisos por defecto, así que hay que
-- volver a cerrar la función al público (ver migración 20260910190000).
REVOKE EXECUTE ON FUNCTION public.crear_cuenta_completa(uuid, text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crear_cuenta_completa(uuid, text, text, text, text) TO service_role;
