-- Solo el plan Trial tiene periodo de prueba. Quien entra con un plan de pago
-- no debe empezar con 14 días gratis.

UPDATE public.plans SET dias_trial = 0 WHERE nombre <> 'Trial';

-- Y que `dias_trial = 0` signifique de verdad "sin prueba", no "prueba que
-- caduca hoy mismo". Sin esto, un alta con plan de pago nacería con
-- `estado = 'trial'` y `fecha_vencimiento` = hoy, es decir, vencida al
-- instante. Con 0 días el alta nace activa y con un mes de vigencia.
--
-- Hoy no cambia nada en la práctica: todas las altas llaman a esta función
-- sin indicar plan, así que entran como 'Trial'. Es para que el día que se
-- venda un plan directamente no quede una cuenta muerta al nacer.
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
  v_es_trial boolean;
BEGIN
  SELECT id, creditos_diarios_trial, COALESCE(dias_trial, 14)
    INTO v_plan_id, v_creditos_iniciales, v_dias_trial
  FROM public.plans WHERE nombre = p_plan_nombre;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_nombre;
  END IF;

  v_es_trial := v_dias_trial > 0;

  INSERT INTO public.organizaciones (nombre, plan_id, estado, trial_activo, fecha_inicio, fecha_vencimiento)
  VALUES (
    p_org_nombre,
    v_plan_id,
    CASE WHEN v_es_trial THEN 'trial' ELSE 'activo' END,
    v_es_trial,
    CURRENT_DATE,
    CASE WHEN v_es_trial
         THEN CURRENT_DATE + (v_dias_trial || ' days')::interval
         ELSE CURRENT_DATE + INTERVAL '1 month'
    END
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.sucursales (tenant_id, nombre, activa, onboarding_paso, onboarding_completado)
  VALUES (v_org_id, 'Principal', true, 0, false)
  RETURNING id INTO v_sucursal_id;

  INSERT INTO public.roles_personalizados (tenant_id, nombre, descripcion, nivel, permisos, es_propietario)
  VALUES (v_org_id, 'Propietario', 'Acceso total a la organización. No se puede editar ni eliminar.', 1, '[]'::jsonb, true)
  RETURNING id INTO v_rol_propietario_id;

  INSERT INTO public.users (id, tenant_id, branch_id, email, nombre, rol, rol_personalizado_id, invitacion_aceptada)
  VALUES (p_user_id, v_org_id, v_sucursal_id, p_email, p_nombre, 'tenant_user', v_rol_propietario_id, true);

  INSERT INTO public.user_branches (user_id, branch_id)
  VALUES (p_user_id, v_sucursal_id);

  INSERT INTO public.message_quotas (tenant_id, tipo, cantidad, saldo, descripcion, origen)
  VALUES (v_org_id, 'abono', COALESCE(v_creditos_iniciales, 100), COALESCE(v_creditos_iniciales, 100),
          CASE WHEN v_es_trial THEN 'Cuota inicial trial' ELSE 'Cuota inicial del plan' END, 'recarga_plan');

  RETURN v_org_id;
END;
$$;

-- CREATE OR REPLACE reinstala los permisos por defecto: hay que volver a
-- cerrar la función (ver 20260910190000).
REVOKE EXECUTE ON FUNCTION public.crear_cuenta_completa(uuid, text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crear_cuenta_completa(uuid, text, text, text, text) TO service_role;
