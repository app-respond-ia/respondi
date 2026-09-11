-- 1. Créditos de la prueba: 500 (decidido por Jorge el 12-09-2026). Se dan una
--    sola vez al abrir la cuenta, no cada día, pese al nombre de la columna.
--    Coste real medido: ~0,0002 $ por respuesta con gpt-4.1-nano, o sea unos
--    8 céntimos por cuenta de prueba que los gaste enteros.
UPDATE public.plans SET creditos_diarios_trial = 500 WHERE nombre = 'Trial';

COMMENT ON COLUMN public.plans.creditos_diarios_trial IS
  'Créditos que se dan UNA SOLA VEZ al abrir una cuenta de prueba (no es diario, pese al nombre). Editable en Superadmin → Planes.';

-- 2. Arreglo: una cuenta creada directamente en un plan de pago se quedaba con
--    100 créditos. La función leía siempre `creditos_diarios_trial`, que solo
--    tiene valor en el plan de prueba; en los de pago es NULL y caía al 100 de
--    por defecto. Ahora cada plan da los suyos: la prueba, los de la prueba;
--    los de pago, sus créditos mensuales.
CREATE OR REPLACE FUNCTION public.crear_cuenta_completa(p_user_id uuid, p_email text, p_nombre text, p_org_nombre text, p_plan_nombre text DEFAULT 'Trial'::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_id uuid;
  v_sucursal_id uuid;
  v_rol_propietario_id uuid;
  v_plan_id uuid;
  v_creditos_trial integer;
  v_creditos_plan integer;
  v_creditos_iniciales integer;
  v_dias_trial integer;
  v_es_trial boolean;
BEGIN
  SELECT id, creditos_diarios_trial, creditos_mensuales, COALESCE(dias_trial, 14)
    INTO v_plan_id, v_creditos_trial, v_creditos_plan, v_dias_trial
  FROM public.plans WHERE nombre = p_plan_nombre;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_nombre;
  END IF;

  v_es_trial := v_dias_trial > 0;
  v_creditos_iniciales := COALESCE(
    CASE WHEN v_es_trial THEN v_creditos_trial ELSE v_creditos_plan END,
    v_creditos_trial, v_creditos_plan, 100
  );

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
  VALUES (v_org_id, 'abono', v_creditos_iniciales, v_creditos_iniciales,
          CASE WHEN v_es_trial THEN 'Cuota inicial trial' ELSE 'Cuota inicial del plan' END, 'recarga_plan');

  RETURN v_org_id;
END;
$function$;
