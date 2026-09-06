--
-- PostgreSQL database dump
--

\restrict eT6HIutgPD4mMxeGeGDBuVp6Y38xpElGZl0aqhzal1cwjlTYJFBg9dLYG5ERqRa

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: alcance_permiso; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alcance_permiso AS ENUM (
    'todos',
    'propios'
);


--
-- Name: blacklist_modo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.blacklist_modo AS ENUM (
    'ignorar',
    'respuesta_automatica',
    'derivar'
);


--
-- Name: estado_canal; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_canal AS ENUM (
    'activo',
    'pendiente',
    'desconectado',
    'error'
);


--
-- Name: estado_comision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_comision AS ENUM (
    'pendiente',
    'aprobada',
    'pagada'
);


--
-- Name: estado_conv; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_conv AS ENUM (
    'activa',
    'cerrada'
);


--
-- Name: estado_organizacion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_organizacion AS ENUM (
    'trial',
    'activo',
    'vencido',
    'suspendido'
);


--
-- Name: estado_pago; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_pago AS ENUM (
    'pendiente',
    'confirmado',
    'fallido'
);


--
-- Name: estado_seguimiento; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_seguimiento AS ENUM (
    'trial',
    'negociacion',
    'activo',
    'en_riesgo',
    'perdido'
);


--
-- Name: estatus_caso; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estatus_caso AS ENUM (
    'pendiente',
    'atendiendo',
    'resuelto',
    'cerrado'
);


--
-- Name: forma_pago_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.forma_pago_enum AS ENUM (
    'transferencia',
    'efectivo',
    'bizum',
    'tdc'
);


--
-- Name: metodo_canal; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.metodo_canal AS ENUM (
    'whaticket',
    'meta_oficial'
);


--
-- Name: modo_pausa; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.modo_pausa AS ENUM (
    'apagada',
    'automatica',
    'ninguna'
);


--
-- Name: nivel_permiso; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.nivel_permiso AS ENUM (
    'ninguno',
    'lectura',
    'escritura'
);


--
-- Name: origen_error; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.origen_error AS ENUM (
    'n8n',
    'api_meta',
    'llm',
    'db',
    'cron',
    'app'
);


--
-- Name: origen_movimiento; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.origen_movimiento AS ENUM (
    'consumo_ia',
    'recarga_manual',
    'recarga_plan'
);


--
-- Name: remitente_msg; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.remitente_msg AS ENUM (
    'cliente',
    'ia',
    'agente'
);


--
-- Name: resultado_ia; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.resultado_ia AS ENUM (
    'respondio',
    'abrio_caso',
    'fuera_horario',
    'blacklist',
    'pausa',
    'sin_cuota',
    'fallo',
    'resumen',
    'pausa_sucursal'
);


--
-- Name: rol_usuario; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rol_usuario AS ENUM (
    'super_admin',
    'admin',
    'usuario',
    'vendedor',
    'tenant_user'
);


--
-- Name: seccion_permiso; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.seccion_permiso AS ENUM (
    'casos',
    'conversaciones',
    'chats',
    'novedades',
    'blacklist',
    'skills',
    'precios',
    'reglas',
    'etiquetas',
    'canales',
    'usuarios',
    'sucursales',
    'perfil',
    'audit_log',
    'roles',
    'soporte'
);


--
-- Name: tipo_canal; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_canal AS ENUM (
    'instagram',
    'whatsapp',
    'facebook'
);


--
-- Name: tipo_caso; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_caso AS ENUM (
    'normal',
    'fallo_llm',
    'fallo_entrega',
    'blacklist_sugerida'
);


--
-- Name: tipo_comision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_comision AS ENUM (
    'conversion',
    'mrr_mensual'
);


--
-- Name: tipo_movimiento; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_movimiento AS ENUM (
    'abono',
    'debito'
);


--
-- Name: tipo_novedad; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_novedad AS ENUM (
    'horario',
    'stock',
    'promo',
    'evento',
    'otro'
);


--
-- Name: abonar_credito_ia(uuid, integer, public.origen_movimiento, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.abonar_credito_ia(p_tenant_id uuid, p_cantidad integer, p_origen public.origen_movimiento, p_descripcion text DEFAULT NULL::text, p_modo text DEFAULT 'sumar'::text) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_saldo_actual integer;
  v_nuevo_saldo integer;
  v_tipo tipo_movimiento;
BEGIN
  SELECT saldo INTO v_saldo_actual
  FROM message_quotas
  WHERE tenant_id = p_tenant_id
  ORDER BY timestamp DESC
  LIMIT 1
  FOR UPDATE;

  v_saldo_actual := COALESCE(v_saldo_actual, 0);

  IF p_modo = 'reset' THEN
    v_nuevo_saldo := p_cantidad;
  ELSE
    v_nuevo_saldo := v_saldo_actual + p_cantidad;
  END IF;

  v_tipo := CASE WHEN p_cantidad >= 0 THEN 'abono' ELSE 'debito' END::tipo_movimiento;

  INSERT INTO message_quotas (tenant_id, tipo, cantidad, saldo, descripcion, origen)
  VALUES (p_tenant_id, v_tipo, p_cantidad, v_nuevo_saldo, p_descripcion, p_origen);

  RETURN v_nuevo_saldo;
END;
$$;


--
-- Name: auth_has_permission(uuid, public.seccion_permiso, public.nivel_permiso); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_has_permission(p_branch_id uuid, p_seccion public.seccion_permiso, p_nivel public.nivel_permiso) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_rol rol_usuario;
  v_es_propietario boolean;
  v_nivel_encontrado text;
  v_rol_personalizado_id uuid;
  v_pertenece_sucursal boolean;
BEGIN
  -- 1. Obtener datos básicos del usuario
  SELECT rol, rol_personalizado_id INTO v_rol, v_rol_personalizado_id 
  FROM public.users WHERE id = auth.uid();
  
  -- Si es admin general, siempre true
  IF v_rol IN ('super_admin', 'admin') THEN 
    RETURN true; 
  END IF;

  -- Si no es admin y no tiene rol asignado, no hay permisos
  IF v_rol_personalizado_id IS NULL THEN
    RETURN false;
  END IF;

  -- 2. Verificar si el rol personalizado es "propietario"
  SELECT es_propietario INTO v_es_propietario 
  FROM public.roles_personalizados 
  WHERE id = v_rol_personalizado_id;

  -- Si el rol es el Propietario del tenant, siempre true
  IF v_es_propietario = true THEN
    RETURN true;
  END IF;

  -- 3. Verificar que el usuario esté asignado a la sucursal específica
  SELECT EXISTS (
    SELECT 1 FROM public.user_branches 
    WHERE user_id = auth.uid() AND branch_id = p_branch_id
  ) INTO v_pertenece_sucursal;

  IF NOT v_pertenece_sucursal THEN
    RETURN false;
  END IF;

  -- 4. Extraer el nivel de permiso buscando la sección dentro del array JSONB 'permisos'
  SELECT p->>'nivel' INTO v_nivel_encontrado
  FROM public.roles_personalizados rp,
       jsonb_array_elements(rp.permisos) as p
  WHERE rp.id = v_rol_personalizado_id
    AND p->>'seccion' = p_seccion::text;

  -- 5. Validar el nivel encontrado contra el solicitado
  IF v_nivel_encontrado IS NULL OR v_nivel_encontrado = 'ninguno' THEN
    RETURN p_nivel = 'ninguno';
  END IF;

  IF p_nivel = 'ninguno' THEN 
    RETURN true;
  ELSIF p_nivel = 'lectura' THEN 
    RETURN v_nivel_encontrado IN ('lectura', 'escritura');
  ELSIF p_nivel = 'escritura' THEN 
    RETURN v_nivel_encontrado = 'escritura';
  END IF;

  RETURN false;
END;
$$;


--
-- Name: auth_is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT coalesce(
    (SELECT rol = 'super_admin' FROM public.users WHERE id = auth.uid()),
    false
  )
$$;


--
-- Name: auth_rol(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_rol() RETURNS public.rol_usuario
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select rol from public.users where id = auth.uid()
$$;


--
-- Name: auth_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select tenant_id from public.users where id = auth.uid()
$$;


--
-- Name: check_casos_estancados(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_casos_estancados() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  r_caso record;
  r_admin record;
  v_pref boolean;
  v_ultima_actividad timestamptz;
begin
  for r_caso in
    select c.id, c.tenant_id, o.nombre as org_nombre
    from public.cases c
    join public.organizaciones o on o.id = c.tenant_id
    where c.estatus not in ('resuelto', 'cerrado')
      and c.fecha_apertura < now() - interval '24 hours'
  loop
    select max(timestamp) into v_ultima_actividad from public.case_notes where case_id = r_caso.id;
    if v_ultima_actividad is null or v_ultima_actividad < now() - interval '24 hours' then
      for r_admin in select id from public.users where rol = 'super_admin' and activo = true loop
        select activado into v_pref from public.notification_preferences where user_id = r_admin.id and tipo = 'caso_estancado';
        if coalesce(v_pref, true) then
          if not exists (
            select 1 from public.notifications
            where user_id = r_admin.id and tipo = 'caso_estancado' and entidad_id = r_caso.id
              and timestamp > now() - interval '24 hours'
          ) then
            insert into public.notifications (user_id, tenant_id, tipo, titulo, cuerpo, url, entidad_id)
            values (r_admin.id, r_caso.tenant_id, 'caso_estancado', 'Caso sin resolver hace tiempo',
              'Un caso de "' || r_caso.org_nombre || '" lleva más de 24h sin actividad.',
              '/superadmin/organizaciones', r_caso.id);
          end if;
        end if;
      end loop;
    end if;
  end loop;
end;
$$;


--
-- Name: check_clientes_por_vencer_y_creditos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_clientes_por_vencer_y_creditos() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  r_org record;
  r_admin record;
  v_pref boolean;
  v_saldo numeric;
  v_creditos_plan integer;
begin
  for r_org in
    select id, nombre, fecha_vencimiento, estado
    from public.organizaciones
    where estado in ('activo', 'trial')
      and fecha_vencimiento >= current_date
      and fecha_vencimiento <= current_date + 3
  loop
    for r_admin in
      select u.id 
      from public.users u
      join public.roles_personalizados rp on rp.id = u.rol_personalizado_id
      where u.tenant_id = r_org.id and rp.es_propietario = true and u.activo = true
    loop
      select activado into v_pref from public.notification_preferences
      where user_id = r_admin.id and tipo = 'trial_por_vencer';
      if coalesce(v_pref, true) then
        insert into public.notifications (user_id, tenant_id, tipo, titulo, cuerpo, url, entidad_id)
        values (r_admin.id, r_org.id, 'trial_por_vencer', 'Tu plan está por vencer',
          'Tu cuenta vence el ' || to_char(r_org.fecha_vencimiento, 'DD/MM/YYYY') || '. Contacta con soporte para renovar.',
          '/dashboard', r_org.id);
      end if;
    end loop;
  end loop;

  for r_org in
    select o.id, o.nombre, o.plan_id, p.creditos_mensuales, o.umbral_alerta_creditos
    from public.organizaciones o
    join public.plans p on p.id = o.plan_id
    where o.estado in ('activo', 'trial')
  loop
    select saldo into v_saldo from public.message_quotas
    where tenant_id = r_org.id order by created_at desc limit 1;

    if v_saldo is not null and r_org.creditos_mensuales > 0 and v_saldo < r_org.umbral_alerta_creditos then
      for r_admin in 
        select u.id 
        from public.users u
        join public.roles_personalizados rp on rp.id = u.rol_personalizado_id
        where u.tenant_id = r_org.id and rp.es_propietario = true and u.activo = true 
      loop
        select activado into v_pref from public.notification_preferences where user_id = r_admin.id and tipo = 'creditos_bajos';
        if coalesce(v_pref, true) then
          insert into public.notifications (user_id, tenant_id, tipo, titulo, cuerpo, url, entidad_id)
          values (r_admin.id, r_org.id, 'creditos_bajos', 'Créditos de IA casi agotados',
            'Te quedan pocos créditos de IA (' || v_saldo || '). Considera ampliar tu plan.',
            '/dashboard', r_org.id);
        end if;
      end loop;

      for r_admin in select id from public.users where rol = 'super_admin' and activo = true loop
        select activado into v_pref from public.notification_preferences where user_id = r_admin.id and tipo = 'creditos_cliente_bajos';
        if coalesce(v_pref, true) then
          insert into public.notifications (user_id, tenant_id, tipo, titulo, cuerpo, url, entidad_id)
          values (r_admin.id, r_org.id, 'creditos_cliente_bajos', 'Cliente con créditos bajos',
            'La organización "' || r_org.nombre || '" tiene pocos créditos de IA (' || v_saldo || ').',
            '/superadmin/organizaciones', r_org.id);
        end if;
      end loop;
    end if;
  end loop;
end;
$$;


--
-- Name: check_organizaciones_por_vencer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_organizaciones_por_vencer() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  r_org record;
  r_admin record;
  v_pref boolean;
begin
  for r_org in
    select id, nombre, fecha_vencimiento, estado
    from public.organizaciones
    where estado in ('activo', 'trial')
      and fecha_vencimiento >= current_date
      and fecha_vencimiento <= current_date + 3
  loop
    for r_admin in
      select id from public.users where rol = 'super_admin' and activo = true
    loop
      select activado into v_pref
      from public.notification_preferences
      where user_id = r_admin.id and tipo = 'organizacion_por_vencer';

      if coalesce(v_pref, true) then
        insert into public.notifications (
          user_id,
          tipo,
          titulo,
          cuerpo,
          url
        ) values (
          r_admin.id,
          'organizacion_por_vencer',
          'Organización próxima a vencer',
          'La organización "' || r_org.nombre || '" (' || r_org.estado || ') vence el ' || to_char(r_org.fecha_vencimiento, 'DD/MM/YYYY') || '.',
          '/superadmin/organizaciones'
        );
      end if;
    end loop;
  end loop;
end;
$$;


--
-- Name: crear_cuenta_completa(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_cuenta_completa(p_user_id uuid, p_email text, p_nombre text, p_org_nombre text, p_plan_nombre text DEFAULT 'Trial'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_org_id uuid;
  v_sucursal_id uuid;
  v_rol_propietario_id uuid;
  v_plan_id uuid;
  v_creditos_iniciales integer;
BEGIN
  -- 0. Buscar el plan por nombre (arregla el bug de plan_id ausente)
  SELECT id, creditos_diarios_trial INTO v_plan_id, v_creditos_iniciales
  FROM public.plans WHERE nombre = p_plan_nombre;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_nombre;
  END IF;

  -- 1. Crear organización (ahora SÍ con plan_id)
  INSERT INTO public.organizaciones (nombre, plan_id, estado, trial_activo, fecha_inicio, fecha_vencimiento)
  VALUES (p_org_nombre, v_plan_id, 'trial', true, CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days')
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


--
-- Name: create_trial_account(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_trial_account(p_user_id uuid, p_email text, p_nombre text, p_org_nombre text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_org_id uuid;
  v_sucursal_id uuid;
  v_rol_propietario_id uuid;
begin
  -- 1. Crear organización
  insert into public.organizaciones (nombre, estado, trial_activo, fecha_inicio, fecha_vencimiento)
  values (p_org_nombre, 'trial', true, current_date, current_date + interval '14 days')
  returning id into v_org_id;
  -- 2. Crear sucursal con datos base del onboarding
  insert into public.sucursales (tenant_id, nombre, activa, onboarding_paso, onboarding_completado)
  values (v_org_id, 'Principal', true, 0, false)
  returning id into v_sucursal_id;
  -- 3. Crear rol Propietario (Nivel 1, es_propietario = true)
  insert into public.roles_personalizados (tenant_id, nombre, descripcion, nivel, permisos, es_propietario)
  values (v_org_id, 'Propietario', 'Acceso total a la organización. No se puede editar ni eliminar.', 1, '[]'::jsonb, true)
  returning id into v_rol_propietario_id;
  -- 4. Crear usuario (tenant_user) y asignarle el rol Propietario recién creado
  insert into public.users (id, tenant_id, branch_id, email, nombre, rol, rol_personalizado_id, invitacion_aceptada)
  values (p_user_id, v_org_id, v_sucursal_id, p_email, p_nombre, 'tenant_user', v_rol_propietario_id, true);
  -- 5. Asignar sucursal al usuario en user_branches
  insert into public.user_branches (user_id, branch_id)
  values (p_user_id, v_sucursal_id);
  -- 6. Crear cuota inicial (100 créditos)
  insert into public.message_quotas (tenant_id, tipo, cantidad, saldo, descripcion)
  values (v_org_id, 'abono', 100, 100, 'Cuota inicial trial');
end;
$$;


--
-- Name: cron_procesar_politicas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cron_procesar_politicas() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  policy_row record;
  response record;
  secreto text;
begin
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'cron_webhook_secret';
  
  for policy_row in 
    select id 
    from policy_sources 
    where estado = 'procesando' 
      and (procesando_desde is null or procesando_desde < now() - interval '5 minutes')
      and intentos_fallidos < 3
  loop
    update policy_sources 
    set procesando_desde = now() 
    where id = policy_row.id;

    select * into response from net.http_post(
      url := 'https://respondi.vercel.app/api/ai/process-policy',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secreto
      ),
      body := jsonb_build_object('sourceId', policy_row.id)
    );
  end loop;
end;
$$;


--
-- Name: descontar_credito_ia(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.descontar_credito_ia(p_tenant_id uuid, p_branch_id uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_saldo_actual integer;
  v_nuevo_saldo integer;
BEGIN
  SELECT saldo INTO v_saldo_actual
  FROM message_quotas
  WHERE tenant_id = p_tenant_id
  ORDER BY timestamp DESC
  LIMIT 1
  FOR UPDATE;

  v_saldo_actual := COALESCE(v_saldo_actual, 0);
  v_nuevo_saldo := v_saldo_actual - 1;

  INSERT INTO message_quotas (tenant_id, branch_id, tipo, cantidad, saldo, descripcion, origen)
  VALUES (p_tenant_id, p_branch_id, 'debito', -1, v_nuevo_saldo, 'Mensaje respondido por IA', 'consumo_ia');

  RETURN v_nuevo_saldo;
END;
$$;


--
-- Name: descontar_cuota_ia(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.descontar_cuota_ia(p_tenant_id uuid, p_cantidad integer, p_descripcion text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ultimo_saldo integer;
  v_nuevo_saldo integer;
BEGIN
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
    tenant_id, tipo, cantidad, saldo, descripcion
  ) VALUES (
    p_tenant_id, 'debito', p_cantidad, v_nuevo_saldo, p_descripcion
  );

  RETURN v_nuevo_saldo;
END;
$$;


--
-- Name: disparar_revision_bloqueos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.disparar_revision_bloqueos() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  req_id bigint;
  v_secret text;
BEGIN
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


--
-- Name: disparar_webhook_ia(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.disparar_webhook_ia() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
      AND c.fecha_ultimo_mensaje < now() - (s.tiempo_agrupacion_seg || ' seconds')::interval
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


--
-- Name: disparar_webhook_resumen_ia(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.disparar_webhook_resumen_ia() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
      AND fecha_ultimo_mensaje < now() - interval '24 hours'
      AND (fecha_ultimo_resumen IS NULL OR fecha_ultimo_resumen < fecha_ultimo_mensaje)
      AND (ia_procesando_desde IS NULL OR ia_procesando_desde < now() - interval '2 minutes')
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


--
-- Name: get_organizaciones_con_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_organizaciones_con_stats() RETURNS TABLE(tenant_id uuid, sucursales_activas bigint, sucursales_total bigint, usuarios_activos bigint, usuarios_total bigint)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    o.id AS tenant_id,
    COUNT(DISTINCT s.id) FILTER (WHERE s.activa = true) AS sucursales_activas,
    COUNT(DISTINCT s.id) AS sucursales_total,
    COUNT(DISTINCT u.id) FILTER (WHERE u.activo = true) AS usuarios_activos,
    COUNT(DISTINCT u.id) AS usuarios_total
  FROM organizaciones o
  LEFT JOIN sucursales s ON s.tenant_id = o.id
  LEFT JOIN users u ON u.tenant_id = o.id
  GROUP BY o.id;
$$;


--
-- Name: get_resumen_creditos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_resumen_creditos() RETURNS TABLE(total_consumido bigint, total_recarga_plan bigint, total_recarga_manual bigint, saldo_total_plataforma bigint)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    COALESCE((SELECT SUM(ABS(cantidad)) FROM message_quotas WHERE origen = 'consumo_ia'), 0),
    COALESCE((SELECT SUM(cantidad) FROM message_quotas WHERE origen = 'recarga_plan'), 0),
    COALESCE((SELECT SUM(cantidad) FROM message_quotas WHERE origen = 'recarga_manual'), 0),
    COALESCE((SELECT SUM(saldo) FROM saldos_actuales_ia), 0);
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select rol = 'super_admin' from public.users where id = auth.uid()), false)
$$;


--
-- Name: match_fragmentos_politicas(public.vector, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_fragmentos_politicas(query_embedding public.vector, match_branch_id uuid, match_limit integer DEFAULT 5) RETURNS TABLE(id uuid, contenido text, similitud double precision)
    LANGUAGE plpgsql
    AS $$
begin
  return query
  select
    policy_fragments.id,
    policy_fragments.contenido,
    1 - (policy_fragments.embedding <=> query_embedding) as similitud
  from policy_fragments
  where policy_fragments.branch_id = match_branch_id
  order by policy_fragments.embedding <=> query_embedding
  limit match_limit;
end;
$$;


--
-- Name: resolve_incoming_message_context(uuid, uuid, public.tipo_canal, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_incoming_message_context(p_tenant_id uuid, p_branch_id uuid, p_canal public.tipo_canal, p_identificador_canal text, p_nombre_contacto text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_contact_id uuid;
  v_conversation_id uuid;
  v_case_id uuid;
  v_ia_pausada boolean;
BEGIN
  INSERT INTO contacts (tenant_id, canal, identificador_canal, nombre)
  VALUES (p_tenant_id, p_canal, p_identificador_canal, p_nombre_contacto)
  ON CONFLICT (tenant_id, canal, identificador_canal) 
  DO UPDATE SET 
    nombre = COALESCE(contacts.nombre, EXCLUDED.nombre)
  RETURNING id INTO v_contact_id;

  INSERT INTO conversations (tenant_id, branch_id, contact_id, canal, estado, ia_pausada)
  VALUES (p_tenant_id, p_branch_id, v_contact_id, p_canal, 'activa', false)
  ON CONFLICT (tenant_id, branch_id, contact_id, canal) WHERE estado = 'activa'
  DO UPDATE SET 
    fecha_ultimo_mensaje = now()
  RETURNING id, ia_pausada INTO v_conversation_id, v_ia_pausada;

  INSERT INTO cases (tenant_id, branch_id, contact_id, conversation_id, tipo, estatus)
  VALUES (p_tenant_id, p_branch_id, v_contact_id, v_conversation_id, 'normal', 'pendiente')
  ON CONFLICT (tenant_id, conversation_id) WHERE estatus != 'cerrado'
  DO UPDATE SET 
    estatus = cases.estatus
  RETURNING id INTO v_case_id;

  RETURN json_build_object(
    'contact_id', v_contact_id,
    'conversation_id', v_conversation_id,
    'case_id', v_case_id,
    'ia_pausada', v_ia_pausada
  );
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    branch_id uuid,
    message_id uuid,
    modelo_ia text,
    tokens_input integer,
    tokens_output integer,
    costo_estimado_usd numeric(12,6),
    contexto_snapshot jsonb,
    resultado public.resultado_ia,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    user_id uuid,
    accion text NOT NULL,
    tabla_afectada text,
    registro_id uuid,
    valor_anterior jsonb,
    valor_nuevo jsonb,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    actuado_como_id uuid
);


--
-- Name: billing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    plan_id uuid,
    importe_usd numeric(10,2) NOT NULL,
    forma_pago public.forma_pago_enum,
    estado public.estado_pago DEFAULT 'pendiente'::public.estado_pago NOT NULL,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    notas text,
    id_vendedor uuid,
    moneda text DEFAULT 'USD'::text NOT NULL
);


--
-- Name: business_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    dia_semana smallint NOT NULL,
    apertura time without time zone,
    cierre time without time zone,
    cerrado boolean DEFAULT false NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    tipo text DEFAULT 'negocio'::text NOT NULL,
    CONSTRAINT business_hours_dia_semana_check CHECK (((dia_semana >= 0) AND (dia_semana <= 6))),
    CONSTRAINT chk_tipo_business_hours CHECK ((tipo = ANY (ARRAY['negocio'::text, 'ia'::text])))
);


--
-- Name: business_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    descripcion text,
    politicas jsonb DEFAULT '[]'::jsonb,
    servicios text,
    idioma_base text DEFAULT 'es'::text,
    tono text,
    disclaimer_texto text,
    msg_fuera_horario text,
    msg_cuota_agotada text,
    msg_pausa_automatica text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    caso_fuera_horario boolean DEFAULT false NOT NULL,
    abrir_caso_fuera_horario boolean DEFAULT false NOT NULL,
    modo_horario_ia text DEFAULT 'mismo_negocio'::text NOT NULL,
    CONSTRAINT chk_modo_horario_ia CHECK ((modo_horario_ia = ANY (ARRAY['mismo_negocio'::text, 'personalizado'::text, 'siempre_activa'::text])))
);


--
-- Name: case_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid NOT NULL,
    user_id uuid,
    nota text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: case_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion_intencion text,
    tipo_caso text,
    activa boolean DEFAULT true NOT NULL,
    es_plantilla boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    prioridad_default text DEFAULT 'normal'::text,
    orden integer DEFAULT 0 NOT NULL,
    es_protegida boolean DEFAULT false NOT NULL
);


--
-- Name: cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    contact_id uuid,
    conversation_id uuid,
    agente_id uuid,
    tipo public.tipo_caso DEFAULT 'normal'::public.tipo_caso NOT NULL,
    descripcion text,
    producto_id uuid,
    prioridad text DEFAULT 'normal'::text,
    estatus public.estatus_caso DEFAULT 'pendiente'::public.estatus_caso NOT NULL,
    fecha_apertura timestamp with time zone DEFAULT now() NOT NULL,
    fecha_cierre timestamp with time zone,
    sla_horas integer,
    fecha_sla_asignado timestamp with time zone
);


--
-- Name: categorias_precios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias_precios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    nombre text NOT NULL,
    parent_id uuid,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    tipo public.tipo_canal NOT NULL,
    metodo public.metodo_canal DEFAULT 'whaticket'::public.metodo_canal NOT NULL,
    estado public.estado_canal DEFAULT 'pendiente'::public.estado_canal NOT NULL,
    identificador_externo text,
    fecha_conexion timestamp with time zone,
    ultima_actividad timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    calidad_mensajeria text,
    calidad_actualizada_en timestamp with time zone,
    meta_user_id text,
    CONSTRAINT channels_calidad_mensajeria_check CHECK ((calidad_mensajeria = ANY (ARRAY['GREEN'::text, 'YELLOW'::text, 'RED'::text, 'UNKNOWN'::text])))
);


--
-- Name: client_ticket_categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_ticket_categorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_ticket_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_ticket_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    ticket_id uuid NOT NULL,
    user_id uuid,
    mensaje text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_ticket_notas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_ticket_notas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    nota text NOT NULL,
    visibilidad text DEFAULT 'privada'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT client_ticket_notas_visibilidad_check CHECK ((visibilidad = ANY (ARRAY['privada'::text, 'compartida'::text])))
);


--
-- Name: client_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    user_id uuid NOT NULL,
    asunto text NOT NULL,
    categoria_id uuid,
    prioridad text DEFAULT 'normal'::text,
    estatus text DEFAULT 'abierto'::text NOT NULL,
    asignado_a uuid,
    fecha_apertura timestamp with time zone DEFAULT now() NOT NULL,
    fecha_cierre timestamp with time zone,
    calificacion integer,
    comentario_calificacion text,
    fecha_calificacion timestamp with time zone
);


--
-- Name: comisiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comisiones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendedor_id uuid NOT NULL,
    organizacion_id uuid NOT NULL,
    tipo public.tipo_comision NOT NULL,
    importe numeric(10,2) NOT NULL,
    moneda text DEFAULT 'EUR'::text NOT NULL,
    mes_referencia date,
    estado public.estado_comision DEFAULT 'pendiente'::public.estado_comision NOT NULL,
    fecha_generacion timestamp with time zone DEFAULT now() NOT NULL,
    fecha_aprobacion timestamp with time zone,
    fecha_pago timestamp with time zone,
    aprobado_por uuid,
    notas_pago text
);


--
-- Name: comisiones_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comisiones_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comision_id uuid NOT NULL,
    accion text NOT NULL,
    user_id uuid,
    valor_anterior jsonb,
    valor_nuevo jsonb,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    canal public.tipo_canal NOT NULL,
    identificador_canal text NOT NULL,
    nombre text,
    nota text,
    fecha_actualizacion timestamp with time zone,
    fecha_primer_contacto timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    trato text DEFAULT 'normal'::text NOT NULL,
    modo text,
    respuesta_auto text,
    CONSTRAINT contacts_modo_check CHECK ((modo = ANY (ARRAY['ignorar'::text, 'respuesta_automatica'::text, 'derivar'::text]))),
    CONSTRAINT contacts_trato_check CHECK ((trato = ANY (ARRAY['normal'::text, 'sin_ia'::text, 'bloqueado'::text])))
);


--
-- Name: conversation_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_tags (
    conversation_id uuid NOT NULL,
    category_id uuid NOT NULL,
    aplicada_por text DEFAULT 'ia'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    contact_id uuid NOT NULL,
    canal public.tipo_canal NOT NULL,
    estado public.estado_conv DEFAULT 'activa'::public.estado_conv NOT NULL,
    ia_pausada boolean DEFAULT false NOT NULL,
    atendida_por uuid,
    fecha_inicio timestamp with time zone DEFAULT now() NOT NULL,
    fecha_ultimo_mensaje timestamp with time zone,
    fecha_cierre timestamp with time zone,
    resumen text,
    ia_procesando_desde timestamp with time zone,
    ia_intentos_fallidos integer DEFAULT 0 NOT NULL,
    fecha_ultimo_resumen timestamp with time zone,
    motivo_bloqueo text,
    bloqueada_desde timestamp with time zone
);


--
-- Name: daily_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    user_id uuid,
    descripcion text NOT NULL,
    fecha_vigencia_inicio timestamp with time zone DEFAULT now() NOT NULL,
    fecha_vigencia_fin timestamp with time zone,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tipo_id uuid
);


--
-- Name: error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    origen public.origen_error NOT NULL,
    descripcion text,
    stacktrace text,
    resuelto boolean DEFAULT false NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: internal_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internal_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    contenido text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: invitaciones_pendientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitaciones_pendientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    tipo text NOT NULL,
    datos jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_por uuid,
    aceptada boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion_intencion text,
    color text DEFAULT 'slate'::text,
    activa boolean DEFAULT true NOT NULL,
    es_plantilla boolean DEFAULT false NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    es_fallback boolean DEFAULT false NOT NULL,
    es_protegida boolean DEFAULT false NOT NULL
);


--
-- Name: message_quotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_quotas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    tipo public.tipo_movimiento NOT NULL,
    cantidad integer NOT NULL,
    saldo integer NOT NULL,
    descripcion text,
    referencia_pago_id uuid,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    origen public.origen_movimiento,
    branch_id uuid
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    remitente public.remitente_msg NOT NULL,
    contenido text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    tokens_input integer,
    tokens_output integer,
    modelo_ia text,
    entregado boolean DEFAULT true,
    agrupado boolean DEFAULT false,
    es_ultimo_agrupado boolean DEFAULT false,
    agente_id uuid,
    identificador_externo text,
    media_url text,
    media_tipo text
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    tipo text NOT NULL,
    activado boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    user_id uuid,
    tipo text,
    titulo text,
    cuerpo text,
    leida boolean DEFAULT false NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    url text,
    entidad_id uuid
);


--
-- Name: organizaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    plan_id uuid,
    estado public.estado_organizacion DEFAULT 'trial'::public.estado_organizacion NOT NULL,
    fecha_inicio date DEFAULT CURRENT_DATE NOT NULL,
    fecha_vencimiento date,
    trial_activo boolean DEFAULT true NOT NULL,
    id_vendedor uuid,
    forma_pago public.forma_pago_enum,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    direccion_fiscal text,
    plan_pendiente_id uuid,
    stripe_customer_id text,
    stripe_subscription_id text
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    precio_usd numeric(10,2) DEFAULT 0 NOT NULL,
    creditos_diarios_trial integer,
    creditos_mensuales integer,
    canales_max integer DEFAULT 1 NOT NULL,
    sucursales_max integer DEFAULT 1 NOT NULL,
    usuarios_max integer,
    modelo_ia text DEFAULT 'gpt-4o-mini'::text NOT NULL,
    dias_retencion_mensajes integer DEFAULT 30 NOT NULL,
    precio_credito_adicional numeric(10,4) DEFAULT 0 NOT NULL,
    precio_sucursal_extra numeric(10,2) DEFAULT 0,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    umbral_alerta_creditos integer DEFAULT 100 NOT NULL,
    acumula_creditos boolean DEFAULT false NOT NULL,
    stripe_price_id text
);


--
-- Name: policy_fragments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_fragments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    source_id uuid NOT NULL,
    contenido text NOT NULL,
    embedding public.vector(1536) NOT NULL,
    posicion_orden integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: policy_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    nombre text NOT NULL,
    tipo_origen text NOT NULL,
    ruta_archivo text,
    texto_manual text,
    estado text DEFAULT 'procesando'::text NOT NULL,
    error_msg text,
    intentos_fallidos integer DEFAULT 0,
    procesando_desde timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT policy_sources_estado_check CHECK ((estado = ANY (ARRAY['procesando'::text, 'completado'::text, 'error'::text]))),
    CONSTRAINT policy_sources_tipo_origen_check CHECK ((tipo_origen = ANY (ARRAY['archivo'::text, 'texto_manual'::text])))
);


--
-- Name: price_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    nombre text NOT NULL,
    tipo text DEFAULT 'producto'::text NOT NULL,
    precio numeric(12,2),
    precio_tipo text DEFAULT 'exacto'::text NOT NULL,
    moneda text DEFAULT 'USD'::text NOT NULL,
    descripcion text,
    disponible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    categoria_id uuid,
    etiquetas text[] DEFAULT '{}'::text[],
    visible_ia boolean DEFAULT true NOT NULL,
    CONSTRAINT price_list_tipo_check CHECK ((tipo = ANY (ARRAY['producto'::text, 'servicio'::text])))
);


--
-- Name: roles_personalizados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles_personalizados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    permisos jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    nivel integer DEFAULT 5 NOT NULL,
    es_propietario boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_nivel CHECK (((nivel >= 1) AND (nivel <= 5)))
);


--
-- Name: saldos_actuales_ia; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.saldos_actuales_ia AS
 SELECT DISTINCT ON (tenant_id) tenant_id,
    saldo,
    "timestamp" AS ultimo_movimiento
   FROM public.message_quotas
  ORDER BY tenant_id, "timestamp" DESC;


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    configuracion jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    skill_global_id uuid NOT NULL
);


--
-- Name: skills_globales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills_globales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    cliente_puede_toggle boolean DEFAULT true NOT NULL,
    activa_por_defecto boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text
);


--
-- Name: sucursales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sucursales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    nombre text NOT NULL,
    direccion text,
    activa boolean DEFAULT true NOT NULL,
    modo_pausa public.modo_pausa DEFAULT 'ninguna'::public.modo_pausa NOT NULL,
    timezone text DEFAULT 'America/Caracas'::text NOT NULL,
    tiempo_agrupacion_seg integer DEFAULT 30 NOT NULL,
    trato_contactos_modo public.blacklist_modo DEFAULT 'ignorar'::public.blacklist_modo NOT NULL,
    trato_contactos_respuesta_auto text,
    onboarding_paso integer DEFAULT 0 NOT NULL,
    onboarding_completado boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    moneda text DEFAULT 'USD'::text NOT NULL,
    pais text
);


--
-- Name: superadmin_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.superadmin_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    nivel integer NOT NULL,
    es_propietario boolean DEFAULT false NOT NULL,
    permisos jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_ticket_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    user_id uuid,
    mensaje text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendedor_id uuid NOT NULL,
    asunto text NOT NULL,
    categoria text,
    prioridad text DEFAULT 'normal'::text,
    estatus text DEFAULT 'abierto'::text NOT NULL,
    fecha_apertura timestamp with time zone DEFAULT now() NOT NULL,
    fecha_cierre timestamp with time zone,
    categoria_id uuid,
    asignado_a uuid,
    calificacion integer,
    comentario_calificacion text,
    fecha_calificacion timestamp with time zone
);


--
-- Name: ticket_categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_categorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tickets_fijados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets_fijados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    support_ticket_id uuid,
    client_ticket_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_ticket_tipo CHECK ((((support_ticket_id IS NOT NULL) AND (client_ticket_id IS NULL)) OR ((support_ticket_id IS NULL) AND (client_ticket_id IS NOT NULL))))
);


--
-- Name: tipos_novedad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_novedad (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    nombre text NOT NULL,
    icono text NOT NULL,
    color text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_branches (
    user_id uuid NOT NULL,
    branch_id uuid NOT NULL
);


--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    seccion public.seccion_permiso NOT NULL,
    nivel public.nivel_permiso DEFAULT 'ninguno'::public.nivel_permiso NOT NULL,
    alcance public.alcance_permiso,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    tenant_id uuid,
    branch_id uuid,
    email text NOT NULL,
    nombre text,
    rol public.rol_usuario NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    invitacion_aceptada boolean DEFAULT false NOT NULL,
    fecha_creacion timestamp with time zone DEFAULT now() NOT NULL,
    rol_personalizado_id uuid,
    telefono text,
    avatar_url text,
    apodo text,
    superadmin_rol_id uuid,
    color text
);


--
-- Name: vendedor_clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendedor_clientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendedor_id uuid NOT NULL,
    organizacion_id uuid NOT NULL,
    fecha_vinculacion timestamp with time zone DEFAULT now() NOT NULL,
    estado_seguimiento public.estado_seguimiento DEFAULT 'trial'::public.estado_seguimiento NOT NULL,
    notas text
);


--
-- Name: vendedor_notas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendedor_notas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendedor_id uuid NOT NULL,
    user_id uuid,
    nota text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vendedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendedores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    nombre text NOT NULL,
    email text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    comision_conversion_pct numeric(5,2) DEFAULT 10.00 NOT NULL,
    comision_mrr_pct numeric(5,2) DEFAULT 5.00 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    telefono text,
    dni_nif text,
    direccion jsonb DEFAULT '{}'::jsonb
);


--
-- Name: whatsapp_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    nombre text NOT NULL,
    contenido text NOT NULL,
    idioma text DEFAULT 'es_ES'::text NOT NULL,
    categoria text NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    motivo_rechazo text,
    meta_template_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_templates_categoria_check CHECK ((categoria = ANY (ARRAY['marketing'::text, 'utilidad'::text, 'autenticacion'::text]))),
    CONSTRAINT whatsapp_templates_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text]))),
    CONSTRAINT whatsapp_templates_nombre_check CHECK ((nombre ~ '^[a-z0-9_]+$'::text))
);


--
-- Name: ai_logs ai_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_logs
    ADD CONSTRAINT ai_logs_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: billing billing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing
    ADD CONSTRAINT billing_pkey PRIMARY KEY (id);


--
-- Name: business_hours business_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_pkey PRIMARY KEY (id);


--
-- Name: business_profiles business_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_profiles
    ADD CONSTRAINT business_profiles_pkey PRIMARY KEY (id);


--
-- Name: case_notes case_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_notes
    ADD CONSTRAINT case_notes_pkey PRIMARY KEY (id);


--
-- Name: case_rules case_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_rules
    ADD CONSTRAINT case_rules_pkey PRIMARY KEY (id);


--
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (id);


--
-- Name: categorias_precios categorias_precios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_precios
    ADD CONSTRAINT categorias_precios_pkey PRIMARY KEY (id);


--
-- Name: channels channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_pkey PRIMARY KEY (id);


--
-- Name: channels channels_tenant_branch_tipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_tenant_branch_tipo_key UNIQUE (tenant_id, branch_id, tipo);


--
-- Name: client_ticket_categorias client_ticket_categorias_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_ticket_categorias
    ADD CONSTRAINT client_ticket_categorias_nombre_key UNIQUE (nombre);


--
-- Name: client_ticket_categorias client_ticket_categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_ticket_categorias
    ADD CONSTRAINT client_ticket_categorias_pkey PRIMARY KEY (id);


--
-- Name: client_ticket_messages client_ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_ticket_messages
    ADD CONSTRAINT client_ticket_messages_pkey PRIMARY KEY (id);


--
-- Name: client_ticket_notas client_ticket_notas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_ticket_notas
    ADD CONSTRAINT client_ticket_notas_pkey PRIMARY KEY (id);


--
-- Name: client_tickets client_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_tickets
    ADD CONSTRAINT client_tickets_pkey PRIMARY KEY (id);


--
-- Name: comisiones_log comisiones_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comisiones_log
    ADD CONSTRAINT comisiones_log_pkey PRIMARY KEY (id);


--
-- Name: comisiones comisiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_tenant_canal_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_tenant_canal_id_key UNIQUE (tenant_id, canal, identificador_canal);


--
-- Name: conversation_tags conversation_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_tags
    ADD CONSTRAINT conversation_tags_pkey PRIMARY KEY (conversation_id, category_id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: daily_updates daily_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_updates
    ADD CONSTRAINT daily_updates_pkey PRIMARY KEY (id);


--
-- Name: error_logs error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_pkey PRIMARY KEY (id);


--
-- Name: internal_notes internal_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_notes
    ADD CONSTRAINT internal_notes_pkey PRIMARY KEY (id);


--
-- Name: invitaciones_pendientes invitaciones_pendientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitaciones_pendientes
    ADD CONSTRAINT invitaciones_pendientes_pkey PRIMARY KEY (id);


--
-- Name: message_categories message_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_categories
    ADD CONSTRAINT message_categories_pkey PRIMARY KEY (id);


--
-- Name: message_quotas message_quotas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_quotas
    ADD CONSTRAINT message_quotas_pkey PRIMARY KEY (id);


--
-- Name: messages messages_identificador_externo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_identificador_externo_key UNIQUE (identificador_externo);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_user_id_tipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_tipo_key UNIQUE (user_id, tipo);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: organizaciones organizaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizaciones
    ADD CONSTRAINT organizaciones_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: policy_fragments policy_fragments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_fragments
    ADD CONSTRAINT policy_fragments_pkey PRIMARY KEY (id);


--
-- Name: policy_sources policy_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_sources
    ADD CONSTRAINT policy_sources_pkey PRIMARY KEY (id);


--
-- Name: price_list price_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list
    ADD CONSTRAINT price_list_pkey PRIMARY KEY (id);


--
-- Name: roles_personalizados roles_personalizados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_personalizados
    ADD CONSTRAINT roles_personalizados_pkey PRIMARY KEY (id);


--
-- Name: roles_personalizados roles_personalizados_tenant_id_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_personalizados
    ADD CONSTRAINT roles_personalizados_tenant_id_nombre_key UNIQUE (tenant_id, nombre);


--
-- Name: skills skills_branch_id_skill_global_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_branch_id_skill_global_id_key UNIQUE (branch_id, skill_global_id);


--
-- Name: skills_globales skills_globales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills_globales
    ADD CONSTRAINT skills_globales_pkey PRIMARY KEY (id);


--
-- Name: skills_globales skills_globales_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills_globales
    ADD CONSTRAINT skills_globales_slug_key UNIQUE (slug);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: sucursales sucursales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sucursales
    ADD CONSTRAINT sucursales_pkey PRIMARY KEY (id);


--
-- Name: superadmin_roles superadmin_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superadmin_roles
    ADD CONSTRAINT superadmin_roles_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_messages support_ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: ticket_categorias ticket_categorias_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_categorias
    ADD CONSTRAINT ticket_categorias_nombre_key UNIQUE (nombre);


--
-- Name: ticket_categorias ticket_categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_categorias
    ADD CONSTRAINT ticket_categorias_pkey PRIMARY KEY (id);


--
-- Name: tickets_fijados tickets_fijados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets_fijados
    ADD CONSTRAINT tickets_fijados_pkey PRIMARY KEY (id);


--
-- Name: tickets_fijados tickets_fijados_user_id_client_ticket_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets_fijados
    ADD CONSTRAINT tickets_fijados_user_id_client_ticket_id_key UNIQUE (user_id, client_ticket_id);


--
-- Name: tickets_fijados tickets_fijados_user_id_support_ticket_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets_fijados
    ADD CONSTRAINT tickets_fijados_user_id_support_ticket_id_key UNIQUE (user_id, support_ticket_id);


--
-- Name: tipos_novedad tipos_novedad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_novedad
    ADD CONSTRAINT tipos_novedad_pkey PRIMARY KEY (id);


--
-- Name: user_branches user_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branches
    ADD CONSTRAINT user_branches_pkey PRIMARY KEY (user_id, branch_id);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (id);


--
-- Name: user_permissions user_permissions_user_id_branch_id_seccion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_branch_id_seccion_key UNIQUE (user_id, branch_id, seccion);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vendedor_clientes vendedor_clientes_organizacion_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedor_clientes
    ADD CONSTRAINT vendedor_clientes_organizacion_id_key UNIQUE (organizacion_id);


--
-- Name: vendedor_clientes vendedor_clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedor_clientes
    ADD CONSTRAINT vendedor_clientes_pkey PRIMARY KEY (id);


--
-- Name: vendedor_notas vendedor_notas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedor_notas
    ADD CONSTRAINT vendedor_notas_pkey PRIMARY KEY (id);


--
-- Name: vendedores vendedores_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedores
    ADD CONSTRAINT vendedores_email_key UNIQUE (email);


--
-- Name: vendedores vendedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedores
    ADD CONSTRAINT vendedores_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_templates whatsapp_templates_channel_nombre_idioma_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_channel_nombre_idioma_key UNIQUE (channel_id, nombre, idioma);


--
-- Name: whatsapp_templates whatsapp_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_tenant_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_tenant_ts ON public.audit_log USING btree (tenant_id, "timestamp" DESC);


--
-- Name: idx_cases_agente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cases_agente ON public.cases USING btree (agente_id);


--
-- Name: idx_cases_tenant_estatus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cases_tenant_estatus ON public.cases USING btree (tenant_id, estatus);


--
-- Name: idx_categoria_fallback_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_categoria_fallback_unica ON public.message_categories USING btree (branch_id) WHERE (es_fallback = true);


--
-- Name: idx_categorias_raiz_unicas; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_categorias_raiz_unicas ON public.categorias_precios USING btree (branch_id, lower(nombre)) WHERE (parent_id IS NULL);


--
-- Name: idx_categories_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_branch ON public.message_categories USING btree (branch_id);


--
-- Name: idx_channels_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channels_tenant ON public.channels USING btree (tenant_id);


--
-- Name: idx_contacts_tenant_canal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_tenant_canal ON public.contacts USING btree (tenant_id, canal, identificador_canal);


--
-- Name: idx_conv_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conv_contact ON public.conversations USING btree (contact_id);


--
-- Name: idx_conv_tenant_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conv_tenant_estado ON public.conversations USING btree (tenant_id, estado);


--
-- Name: idx_conversations_bloqueadas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_bloqueadas ON public.conversations USING btree (motivo_bloqueo) WHERE (motivo_bloqueo IS NOT NULL);


--
-- Name: idx_errors_resuelto_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_errors_resuelto_ts ON public.error_logs USING btree (resuelto, "timestamp" DESC);


--
-- Name: idx_messages_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conv ON public.messages USING btree (conversation_id, "timestamp");


--
-- Name: idx_price_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_branch ON public.price_list USING btree (branch_id);


--
-- Name: idx_quotas_tenant_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotas_tenant_ts ON public.message_quotas USING btree (tenant_id, "timestamp" DESC);


--
-- Name: idx_regla_derivacion_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_regla_derivacion_unica ON public.case_rules USING btree (branch_id) WHERE (tipo_caso = 'derivacion_solicitada'::text);


--
-- Name: idx_regla_documento_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_regla_documento_unica ON public.case_rules USING btree (branch_id) WHERE (tipo_caso = 'documento_no_procesable'::text);


--
-- Name: idx_rules_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rules_branch ON public.case_rules USING btree (branch_id);


--
-- Name: idx_skills_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skills_branch ON public.skills USING btree (branch_id);


--
-- Name: idx_subcategorias_unicas; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_subcategorias_unicas ON public.categorias_precios USING btree (branch_id, parent_id, lower(nombre)) WHERE (parent_id IS NOT NULL);


--
-- Name: idx_sucursales_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sucursales_tenant ON public.sucursales USING btree (tenant_id);


--
-- Name: idx_unico_propietario_por_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unico_propietario_por_tenant ON public.roles_personalizados USING btree (tenant_id) WHERE (es_propietario = true);


--
-- Name: idx_updates_branch_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_updates_branch_activo ON public.daily_updates USING btree (branch_id, activo);


--
-- Name: idx_user_branches_bid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_branches_bid ON public.user_branches USING btree (branch_id);


--
-- Name: idx_user_branches_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_branches_uid ON public.user_branches USING btree (user_id);


--
-- Name: idx_user_permissions_branch_seccion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_permissions_branch_seccion ON public.user_permissions USING btree (branch_id, seccion);


--
-- Name: idx_user_permissions_user_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_permissions_user_branch ON public.user_permissions USING btree (user_id, branch_id);


--
-- Name: idx_users_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_tenant ON public.users USING btree (tenant_id);


--
-- Name: policy_fragments_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX policy_fragments_branch_id_idx ON public.policy_fragments USING btree (branch_id);


--
-- Name: policy_fragments_source_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX policy_fragments_source_id_idx ON public.policy_fragments USING btree (source_id);


--
-- Name: policy_sources_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX policy_sources_branch_id_idx ON public.policy_sources USING btree (branch_id);


--
-- Name: skills_branch_nombre_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX skills_branch_nombre_unique ON public.skills USING btree (branch_id, nombre);


--
-- Name: unique_active_case; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_active_case ON public.cases USING btree (tenant_id, conversation_id) WHERE (estatus <> 'cerrado'::public.estatus_caso);


--
-- Name: unique_active_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_active_conversation ON public.conversations USING btree (tenant_id, branch_id, contact_id, canal) WHERE (estado = 'activa'::public.estado_conv);


--
-- Name: whatsapp_templates update_whatsapp_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_templates_updated_at BEFORE UPDATE ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_logs ai_logs_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_logs
    ADD CONSTRAINT ai_logs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id);


--
-- Name: ai_logs ai_logs_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_logs
    ADD CONSTRAINT ai_logs_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);


--
-- Name: ai_logs ai_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_logs
    ADD CONSTRAINT ai_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_actuado_como_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actuado_como_id_fkey FOREIGN KEY (actuado_como_id) REFERENCES public.users(id);


--
-- Name: audit_log audit_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: billing billing_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing
    ADD CONSTRAINT billing_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: billing billing_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing
    ADD CONSTRAINT billing_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: business_hours business_hours_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: business_profiles business_profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_profiles
    ADD CONSTRAINT business_profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: case_notes case_notes_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_notes
    ADD CONSTRAINT case_notes_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- Name: case_notes case_notes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_notes
    ADD CONSTRAINT case_notes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: case_notes case_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_notes
    ADD CONSTRAINT case_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: case_rules case_rules_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_rules
    ADD CONSTRAINT case_rules_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: case_rules case_rules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_rules
    ADD CONSTRAINT case_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: cases cases_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.users(id);


--
-- Name: cases cases_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id);


--
-- Name: cases cases_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: cases cases_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: cases cases_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.price_list(id);


--
-- Name: cases cases_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: categorias_precios categorias_precios_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_precios
    ADD CONSTRAINT categorias_precios_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: categorias_precios categorias_precios_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_precios
    ADD CONSTRAINT categorias_precios_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categorias_precios(id) ON DELETE CASCADE;


--
-- Name: categorias_precios categorias_precios_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_precios
    ADD CONSTRAINT categorias_precios_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: channels channels_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: channels channels_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: client_ticket_messages client_ticket_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_ticket_messages
    ADD CONSTRAINT client_ticket_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: client_ticket_messages client_ticket_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_ticket_messages
    ADD CONSTRAINT client_ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.client_tickets(id) ON DELETE CASCADE;


--
-- Name: client_ticket_messages client_ticket_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_ticket_messages
    ADD CONSTRAINT client_ticket_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: client_ticket_notas client_ticket_notas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_ticket_notas
    ADD CONSTRAINT client_ticket_notas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: client_ticket_notas client_ticket_notas_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_ticket_notas
    ADD CONSTRAINT client_ticket_notas_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.client_tickets(id) ON DELETE CASCADE;


--
-- Name: client_ticket_notas client_ticket_notas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_ticket_notas
    ADD CONSTRAINT client_ticket_notas_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: client_tickets client_tickets_asignado_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_tickets
    ADD CONSTRAINT client_tickets_asignado_a_fkey FOREIGN KEY (asignado_a) REFERENCES public.users(id);


--
-- Name: client_tickets client_tickets_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_tickets
    ADD CONSTRAINT client_tickets_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id);


--
-- Name: client_tickets client_tickets_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_tickets
    ADD CONSTRAINT client_tickets_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.client_ticket_categorias(id);


--
-- Name: client_tickets client_tickets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_tickets
    ADD CONSTRAINT client_tickets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: client_tickets client_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_tickets
    ADD CONSTRAINT client_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: comisiones comisiones_aprobado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_aprobado_por_fkey FOREIGN KEY (aprobado_por) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: comisiones_log comisiones_log_comision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comisiones_log
    ADD CONSTRAINT comisiones_log_comision_id_fkey FOREIGN KEY (comision_id) REFERENCES public.comisiones(id) ON DELETE CASCADE;


--
-- Name: comisiones_log comisiones_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comisiones_log
    ADD CONSTRAINT comisiones_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: comisiones comisiones_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: comisiones comisiones_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.vendedores(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: conversation_tags conversation_tags_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_tags
    ADD CONSTRAINT conversation_tags_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.message_categories(id) ON DELETE CASCADE;


--
-- Name: conversation_tags conversation_tags_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_tags
    ADD CONSTRAINT conversation_tags_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_atendida_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_atendida_por_fkey FOREIGN KEY (atendida_por) REFERENCES public.users(id);


--
-- Name: conversations conversations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id);


--
-- Name: conversations conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: daily_updates daily_updates_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_updates
    ADD CONSTRAINT daily_updates_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: daily_updates daily_updates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_updates
    ADD CONSTRAINT daily_updates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: daily_updates daily_updates_tipo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_updates
    ADD CONSTRAINT daily_updates_tipo_id_fkey FOREIGN KEY (tipo_id) REFERENCES public.tipos_novedad(id) ON DELETE CASCADE;


--
-- Name: daily_updates daily_updates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_updates
    ADD CONSTRAINT daily_updates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: error_logs error_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE SET NULL;


--
-- Name: internal_notes internal_notes_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_notes
    ADD CONSTRAINT internal_notes_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: internal_notes internal_notes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_notes
    ADD CONSTRAINT internal_notes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: internal_notes internal_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_notes
    ADD CONSTRAINT internal_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: message_categories message_categories_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_categories
    ADD CONSTRAINT message_categories_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: message_categories message_categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_categories
    ADD CONSTRAINT message_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: message_quotas message_quotas_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_quotas
    ADD CONSTRAINT message_quotas_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id);


--
-- Name: message_quotas message_quotas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_quotas
    ADD CONSTRAINT message_quotas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: messages messages_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: organizaciones organizaciones_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizaciones
    ADD CONSTRAINT organizaciones_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: organizaciones organizaciones_plan_pendiente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizaciones
    ADD CONSTRAINT organizaciones_plan_pendiente_id_fkey FOREIGN KEY (plan_pendiente_id) REFERENCES public.plans(id);


--
-- Name: policy_fragments policy_fragments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_fragments
    ADD CONSTRAINT policy_fragments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: policy_fragments policy_fragments_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_fragments
    ADD CONSTRAINT policy_fragments_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.policy_sources(id) ON DELETE CASCADE;


--
-- Name: policy_fragments policy_fragments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_fragments
    ADD CONSTRAINT policy_fragments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: policy_sources policy_sources_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_sources
    ADD CONSTRAINT policy_sources_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: policy_sources policy_sources_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_sources
    ADD CONSTRAINT policy_sources_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: price_list price_list_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list
    ADD CONSTRAINT price_list_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: price_list price_list_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list
    ADD CONSTRAINT price_list_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias_precios(id) ON DELETE SET NULL;


--
-- Name: price_list price_list_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list
    ADD CONSTRAINT price_list_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: roles_personalizados roles_personalizados_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_personalizados
    ADD CONSTRAINT roles_personalizados_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: skills skills_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: skills skills_skill_global_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_skill_global_id_fkey FOREIGN KEY (skill_global_id) REFERENCES public.skills_globales(id) ON DELETE RESTRICT;


--
-- Name: skills skills_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: sucursales sucursales_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sucursales
    ADD CONSTRAINT sucursales_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: support_ticket_messages support_ticket_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_ticket_messages support_ticket_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: support_tickets support_tickets_asignado_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_asignado_a_fkey FOREIGN KEY (asignado_a) REFERENCES public.users(id);


--
-- Name: support_tickets support_tickets_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.ticket_categorias(id);


--
-- Name: support_tickets support_tickets_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.vendedores(id) ON DELETE CASCADE;


--
-- Name: tickets_fijados tickets_fijados_client_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets_fijados
    ADD CONSTRAINT tickets_fijados_client_ticket_id_fkey FOREIGN KEY (client_ticket_id) REFERENCES public.client_tickets(id) ON DELETE CASCADE;


--
-- Name: tickets_fijados tickets_fijados_support_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets_fijados
    ADD CONSTRAINT tickets_fijados_support_ticket_id_fkey FOREIGN KEY (support_ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: tickets_fijados tickets_fijados_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets_fijados
    ADD CONSTRAINT tickets_fijados_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tipos_novedad tipos_novedad_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_novedad
    ADD CONSTRAINT tipos_novedad_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: tipos_novedad tipos_novedad_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_novedad
    ADD CONSTRAINT tipos_novedad_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: user_branches user_branches_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branches
    ADD CONSTRAINT user_branches_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: user_branches user_branches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branches
    ADD CONSTRAINT user_branches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id);


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: users users_rol_personalizado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_rol_personalizado_id_fkey FOREIGN KEY (rol_personalizado_id) REFERENCES public.roles_personalizados(id) ON DELETE SET NULL;


--
-- Name: users users_superadmin_rol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_superadmin_rol_id_fkey FOREIGN KEY (superadmin_rol_id) REFERENCES public.superadmin_roles(id);


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: vendedor_clientes vendedor_clientes_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedor_clientes
    ADD CONSTRAINT vendedor_clientes_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: vendedor_clientes vendedor_clientes_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedor_clientes
    ADD CONSTRAINT vendedor_clientes_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.vendedores(id) ON DELETE CASCADE;


--
-- Name: vendedor_notas vendedor_notas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedor_notas
    ADD CONSTRAINT vendedor_notas_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: vendedor_notas vendedor_notas_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedor_notas
    ADD CONSTRAINT vendedor_notas_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.vendedores(id) ON DELETE CASCADE;


--
-- Name: vendedores vendedores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedores
    ADD CONSTRAINT vendedores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: whatsapp_templates whatsapp_templates_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;


--
-- Name: whatsapp_templates whatsapp_templates_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: whatsapp_templates whatsapp_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: internal_notes Actualizar notas internas del tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Actualizar notas internas del tenant" ON public.internal_notes FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (tenant_id = public.auth_tenant_id()))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (tenant_id = public.auth_tenant_id())));


--
-- Name: tipos_novedad Actualizar tipos_novedad del tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Actualizar tipos_novedad del tenant" ON public.tipos_novedad FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (tenant_id = public.auth_tenant_id()))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (tenant_id = public.auth_tenant_id())));


--
-- Name: internal_notes Eliminar notas internas del tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Eliminar notas internas del tenant" ON public.internal_notes FOR DELETE USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (tenant_id = public.auth_tenant_id())));


--
-- Name: tipos_novedad Eliminar tipos_novedad del tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Eliminar tipos_novedad del tenant" ON public.tipos_novedad FOR DELETE USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (tenant_id = public.auth_tenant_id())));


--
-- Name: policy_sources Escritura policy_sources admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escritura policy_sources admin" ON public.policy_sources USING ((public.is_super_admin() OR ((branch_id IN ( SELECT sucursales.id
   FROM public.sucursales
  WHERE (sucursales.tenant_id = public.auth_tenant_id()))) AND public.auth_is_admin()))) WITH CHECK ((public.is_super_admin() OR ((branch_id IN ( SELECT sucursales.id
   FROM public.sucursales
  WHERE (sucursales.tenant_id = public.auth_tenant_id()))) AND public.auth_is_admin())));


--
-- Name: internal_notes Insertar notas internas en el tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insertar notas internas en el tenant" ON public.internal_notes FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (tenant_id = public.auth_tenant_id())));


--
-- Name: tipos_novedad Insertar tipos_novedad en el tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insertar tipos_novedad en el tenant" ON public.tipos_novedad FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (tenant_id = public.auth_tenant_id())));


--
-- Name: policy_fragments Lectura policy_fragments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura policy_fragments" ON public.policy_fragments FOR SELECT USING ((public.is_super_admin() OR (branch_id IN ( SELECT sucursales.id
   FROM public.sucursales
  WHERE (sucursales.tenant_id = public.auth_tenant_id())))));


--
-- Name: policy_sources Lectura policy_sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura policy_sources" ON public.policy_sources FOR SELECT USING ((public.is_super_admin() OR (branch_id IN ( SELECT sucursales.id
   FROM public.sucursales
  WHERE (sucursales.tenant_id = public.auth_tenant_id())))));


--
-- Name: tickets_fijados Usuarios pueden borrar sus pines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden borrar sus pines" ON public.tickets_fijados FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: tickets_fijados Usuarios pueden crear sus pines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden crear sus pines" ON public.tickets_fijados FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: tickets_fijados Usuarios pueden ver sus propios pines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden ver sus propios pines" ON public.tickets_fijados FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: internal_notes Ver notas internas del tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Ver notas internas del tenant" ON public.internal_notes FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (tenant_id = public.auth_tenant_id())));


--
-- Name: tipos_novedad Ver tipos_novedad del tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Ver tipos_novedad del tenant" ON public.tipos_novedad FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (tenant_id = public.auth_tenant_id())));


--
-- Name: roles_personalizados admin_roles_personalizados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_roles_personalizados ON public.roles_personalizados TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.tenant_id = roles_personalizados.tenant_id) AND (users.rol = 'admin'::public.rol_usuario)))));


--
-- Name: ai_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_logs ailogs_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ailogs_tenant ON public.ai_logs FOR SELECT USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_tenant ON public.audit_log FOR SELECT USING ((public.is_super_admin() OR ((tenant_id = public.auth_tenant_id()) AND ((public.auth_rol() = 'admin'::public.rol_usuario) OR (EXISTS ( SELECT 1
   FROM (public.users u
     JOIN public.roles_personalizados rp ON ((rp.id = u.rol_personalizado_id)))
  WHERE ((u.id = auth.uid()) AND (rp.es_propietario = true)))) OR public.auth_has_permission(( SELECT users.branch_id
   FROM public.users
  WHERE (users.id = auth.uid())), 'audit_log'::public.seccion_permiso, 'lectura'::public.nivel_permiso)))));


--
-- Name: business_hours bhours_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bhours_tenant ON public.business_hours USING ((public.is_super_admin() OR (branch_id IN ( SELECT sucursales.id
   FROM public.sucursales
  WHERE (sucursales.tenant_id = public.auth_tenant_id()))))) WITH CHECK ((public.is_super_admin() OR (branch_id IN ( SELECT sucursales.id
   FROM public.sucursales
  WHERE (sucursales.tenant_id = public.auth_tenant_id())))));


--
-- Name: billing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing ENABLE ROW LEVEL SECURITY;

--
-- Name: billing billing_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_tenant ON public.billing FOR SELECT USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: business_profiles bprofiles_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bprofiles_tenant ON public.business_profiles USING ((public.is_super_admin() OR (branch_id IN ( SELECT sucursales.id
   FROM public.sucursales
  WHERE (sucursales.tenant_id = public.auth_tenant_id()))))) WITH CHECK ((public.is_super_admin() OR (branch_id IN ( SELECT sucursales.id
   FROM public.sucursales
  WHERE (sucursales.tenant_id = public.auth_tenant_id())))));


--
-- Name: business_hours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

--
-- Name: business_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: case_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: case_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.case_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

--
-- Name: cases cases_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cases_select ON public.cases FOR SELECT USING ((public.is_super_admin() OR ((tenant_id = public.auth_tenant_id()) AND ((public.auth_rol() = 'admin'::public.rol_usuario) OR public.auth_has_permission(branch_id, 'casos'::public.seccion_permiso, 'lectura'::public.nivel_permiso)))));


--
-- Name: cases cases_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cases_write ON public.cases USING ((public.is_super_admin() OR ((tenant_id = public.auth_tenant_id()) AND ((public.auth_rol() = 'admin'::public.rol_usuario) OR public.auth_has_permission(branch_id, 'casos'::public.seccion_permiso, 'escritura'::public.nivel_permiso))))) WITH CHECK ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: client_ticket_categorias cat_cliente_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cat_cliente_delete ON public.client_ticket_categorias FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: client_ticket_categorias cat_cliente_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cat_cliente_insert ON public.client_ticket_categorias FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: client_ticket_categorias cat_cliente_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cat_cliente_select ON public.client_ticket_categorias FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (auth.uid() IS NOT NULL)));


--
-- Name: client_ticket_categorias cat_cliente_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cat_cliente_update ON public.client_ticket_categorias FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: ticket_categorias categorias_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categorias_delete ON public.ticket_categorias FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: ticket_categorias categorias_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categorias_insert ON public.ticket_categorias FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: categorias_precios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categorias_precios ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias_precios categorias_precios_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categorias_precios_tenant ON public.categorias_precios USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id()))) WITH CHECK ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: ticket_categorias categorias_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categorias_select ON public.ticket_categorias FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: ticket_categorias categorias_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categorias_update ON public.ticket_categorias FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: message_categories categories_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_tenant ON public.message_categories USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id()))) WITH CHECK ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

--
-- Name: channels channels_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY channels_tenant ON public.channels USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id()))) WITH CHECK ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: client_ticket_categorias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_ticket_categorias ENABLE ROW LEVEL SECURITY;

--
-- Name: client_ticket_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_ticket_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: client_ticket_messages client_ticket_messages_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_ticket_messages_insert ON public.client_ticket_messages FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (ticket_id IN ( SELECT client_tickets.id
   FROM public.client_tickets
  WHERE ((client_tickets.tenant_id = public.auth_tenant_id()) AND public.auth_has_permission(client_tickets.branch_id, 'soporte'::public.seccion_permiso, 'escritura'::public.nivel_permiso))))));


--
-- Name: client_ticket_messages client_ticket_messages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_ticket_messages_select ON public.client_ticket_messages FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (ticket_id IN ( SELECT client_tickets.id
   FROM public.client_tickets
  WHERE ((client_tickets.tenant_id = public.auth_tenant_id()) AND public.auth_has_permission(client_tickets.branch_id, 'soporte'::public.seccion_permiso, 'lectura'::public.nivel_permiso))))));


--
-- Name: client_ticket_notas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_ticket_notas ENABLE ROW LEVEL SECURITY;

--
-- Name: client_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: client_tickets client_tickets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_tickets_insert ON public.client_tickets FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR ((tenant_id = public.auth_tenant_id()) AND public.auth_has_permission(branch_id, 'soporte'::public.seccion_permiso, 'escritura'::public.nivel_permiso))));


--
-- Name: client_tickets client_tickets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_tickets_select ON public.client_tickets FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR ((tenant_id = public.auth_tenant_id()) AND public.auth_has_permission(branch_id, 'soporte'::public.seccion_permiso, 'lectura'::public.nivel_permiso))));


--
-- Name: client_tickets client_tickets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_tickets_update ON public.client_tickets FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR ((tenant_id = public.auth_tenant_id()) AND public.auth_has_permission(branch_id, 'soporte'::public.seccion_permiso, 'escritura'::public.nivel_permiso))));


--
-- Name: comisiones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comisiones ENABLE ROW LEVEL SECURITY;

--
-- Name: comisiones_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comisiones_log ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts contacts_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_tenant ON public.contacts USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id()))) WITH CHECK ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: conversation_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations conversations_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversations_tenant ON public.conversations USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id()))) WITH CHECK ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: conversation_tags convtags_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY convtags_tenant ON public.conversation_tags USING ((public.is_super_admin() OR (conversation_id IN ( SELECT conversations.id
   FROM public.conversations
  WHERE (conversations.tenant_id = public.auth_tenant_id()))))) WITH CHECK ((public.is_super_admin() OR (conversation_id IN ( SELECT conversations.id
   FROM public.conversations
  WHERE (conversations.tenant_id = public.auth_tenant_id())))));


--
-- Name: daily_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: error_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: error_logs errors_super; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY errors_super ON public.error_logs USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: internal_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: invitaciones_pendientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitaciones_pendientes ENABLE ROW LEVEL SECURITY;

--
-- Name: invitaciones_pendientes invitaciones_pendientes_super_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitaciones_pendientes_super_admin ON public.invitaciones_pendientes USING (public.is_super_admin());


--
-- Name: message_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: message_quotas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_quotas ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_tenant ON public.messages USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id()))) WITH CHECK ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: client_ticket_notas notas_cliente_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notas_cliente_delete ON public.client_ticket_notas FOR DELETE USING (((tenant_id = public.auth_tenant_id()) AND (user_id = auth.uid())));


--
-- Name: client_ticket_notas notas_cliente_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notas_cliente_insert ON public.client_ticket_notas FOR INSERT WITH CHECK (((tenant_id = public.auth_tenant_id()) AND (user_id = auth.uid())));


--
-- Name: client_ticket_notas notas_cliente_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notas_cliente_select ON public.client_ticket_notas FOR SELECT USING (((tenant_id = public.auth_tenant_id()) AND ((visibilidad = 'compartida'::text) OR (user_id = auth.uid()))));


--
-- Name: vendedor_notas notas_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notas_insert ON public.vendedor_notas FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: vendedor_notas notas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notas_select ON public.vendedor_notas FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: case_notes notes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notes_insert ON public.case_notes FOR INSERT WITH CHECK ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: case_notes notes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notes_select ON public.case_notes FOR SELECT USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: notifications notif_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_own ON public.notifications USING ((public.is_super_admin() OR (user_id = auth.uid()))) WITH CHECK ((public.is_super_admin() OR (user_id = auth.uid())));


--
-- Name: notification_preferences notif_prefs_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_prefs_own ON public.notification_preferences USING ((public.is_super_admin() OR (user_id = auth.uid()))) WITH CHECK ((public.is_super_admin() OR (user_id = auth.uid())));


--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: organizaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: organizaciones organizaciones_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizaciones_select ON public.organizaciones FOR SELECT USING ((public.is_super_admin() OR (id = public.auth_tenant_id())));


--
-- Name: organizaciones organizaciones_super_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizaciones_super_all ON public.organizaciones USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: user_permissions permisos_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permisos_admin ON public.user_permissions USING ((public.is_super_admin() OR ((branch_id IN ( SELECT sucursales.id
   FROM public.sucursales
  WHERE (sucursales.tenant_id = public.auth_tenant_id()))) AND (public.auth_rol() = 'admin'::public.rol_usuario)) OR (user_id = auth.uid()))) WITH CHECK ((public.is_super_admin() OR ((branch_id IN ( SELECT sucursales.id
   FROM public.sucursales
  WHERE (sucursales.tenant_id = public.auth_tenant_id()))) AND (public.auth_rol() = 'admin'::public.rol_usuario))));


--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: plans plans_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plans_read ON public.plans FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: plans plans_super; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plans_super ON public.plans USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: policy_fragments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.policy_fragments ENABLE ROW LEVEL SECURITY;

--
-- Name: policy_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.policy_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: price_list; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.price_list ENABLE ROW LEVEL SECURITY;

--
-- Name: price_list price_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_tenant ON public.price_list USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id()))) WITH CHECK ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: message_quotas quotas_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotas_tenant ON public.message_quotas FOR SELECT USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: roles_personalizados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles_personalizados ENABLE ROW LEVEL SECURITY;

--
-- Name: case_rules rules_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rules_tenant ON public.case_rules USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id()))) WITH CHECK ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

--
-- Name: skills_globales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skills_globales ENABLE ROW LEVEL SECURITY;

--
-- Name: skills skills_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_tenant ON public.skills USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id()))) WITH CHECK ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: sucursales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;

--
-- Name: sucursales sucursales_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sucursales_tenant ON public.sucursales USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id()))) WITH CHECK ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: comisiones superadmin_comisiones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY superadmin_comisiones ON public.comisiones TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: comisiones_log superadmin_comisiones_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY superadmin_comisiones_log ON public.comisiones_log TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: superadmin_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.superadmin_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: superadmin_roles superadmin_roles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY superadmin_roles_select ON public.superadmin_roles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: superadmin_roles superadmin_roles_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY superadmin_roles_write ON public.superadmin_roles USING ((EXISTS ( SELECT 1
   FROM (public.users u
     JOIN public.superadmin_roles r ON ((r.id = u.superadmin_rol_id)))
  WHERE ((u.id = auth.uid()) AND ((r.es_propietario = true) OR (r.nivel <= 2)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.users u
     JOIN public.superadmin_roles r ON ((r.id = u.superadmin_rol_id)))
  WHERE ((u.id = auth.uid()) AND ((r.es_propietario = true) OR (r.nivel <= 2))))));


--
-- Name: skills_globales superadmin_skills_globales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY superadmin_skills_globales ON public.skills_globales TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: vendedor_clientes superadmin_vendedor_clientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY superadmin_vendedor_clientes ON public.vendedor_clientes TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: vendedores superadmin_vendedores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY superadmin_vendedores ON public.vendedores TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))));


--
-- Name: support_ticket_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_categorias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_categorias ENABLE ROW LEVEL SECURITY;

--
-- Name: support_ticket_messages ticket_messages_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_messages_insert ON public.support_ticket_messages FOR INSERT WITH CHECK ((public.is_super_admin() OR (ticket_id IN ( SELECT support_tickets.id
   FROM public.support_tickets
  WHERE (support_tickets.vendedor_id = ( SELECT vendedores.id
           FROM public.vendedores
          WHERE (vendedores.user_id = auth.uid())))))));


--
-- Name: support_ticket_messages ticket_messages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_messages_select ON public.support_ticket_messages FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (ticket_id IN ( SELECT support_tickets.id
   FROM public.support_tickets
  WHERE (support_tickets.vendedor_id = ( SELECT vendedores.id
           FROM public.vendedores
          WHERE (vendedores.user_id = auth.uid())))))));


--
-- Name: tickets_fijados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tickets_fijados ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets tickets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_insert ON public.support_tickets FOR INSERT WITH CHECK ((public.is_super_admin() OR (vendedor_id = ( SELECT vendedores.id
   FROM public.vendedores
  WHERE (vendedores.user_id = auth.uid())))));


--
-- Name: support_tickets tickets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_select ON public.support_tickets FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.rol = 'super_admin'::public.rol_usuario)))) OR (vendedor_id = ( SELECT vendedores.id
   FROM public.vendedores
  WHERE (vendedores.user_id = auth.uid())))));


--
-- Name: support_tickets tickets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_update ON public.support_tickets FOR UPDATE USING ((public.is_super_admin() OR (vendedor_id = ( SELECT vendedores.id
   FROM public.vendedores
  WHERE (vendedores.user_id = auth.uid())))));


--
-- Name: tipos_novedad; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipos_novedad ENABLE ROW LEVEL SECURITY;

--
-- Name: skills_globales todos_leen_skills_globales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY todos_leen_skills_globales ON public.skills_globales FOR SELECT TO authenticated USING (true);


--
-- Name: daily_updates updates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY updates_select ON public.daily_updates FOR SELECT USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- Name: daily_updates updates_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY updates_write ON public.daily_updates USING ((public.is_super_admin() OR ((tenant_id = public.auth_tenant_id()) AND ((public.auth_rol() = 'admin'::public.rol_usuario) OR public.auth_has_permission(branch_id, 'novedades'::public.seccion_permiso, 'escritura'::public.nivel_permiso))))) WITH CHECK ((public.is_super_admin() OR ((tenant_id = public.auth_tenant_id()) AND ((public.auth_rol() = 'admin'::public.rol_usuario) OR public.auth_has_permission(branch_id, 'novedades'::public.seccion_permiso, 'escritura'::public.nivel_permiso)))));


--
-- Name: user_branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_branches ENABLE ROW LEVEL SECURITY;

--
-- Name: user_branches user_branches_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_branches_access ON public.user_branches USING ((public.is_super_admin() OR (user_id = auth.uid()) OR (branch_id IN ( SELECT sucursales.id
   FROM public.sucursales
  WHERE (sucursales.tenant_id = public.auth_tenant_id()))))) WITH CHECK ((public.is_super_admin() OR (user_id = auth.uid()) OR (branch_id IN ( SELECT sucursales.id
   FROM public.sucursales
  WHERE (sucursales.tenant_id = public.auth_tenant_id())))));


--
-- Name: user_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_admin_manage ON public.users USING ((public.is_super_admin() OR ((tenant_id = public.auth_tenant_id()) AND (public.auth_rol() = 'admin'::public.rol_usuario)))) WITH CHECK ((public.is_super_admin() OR ((tenant_id = public.auth_tenant_id()) AND (public.auth_rol() = 'admin'::public.rol_usuario))));


--
-- Name: users users_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_tenant ON public.users FOR SELECT USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id()) OR (id = auth.uid())));


--
-- Name: roles_personalizados usuario_ver_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuario_ver_roles ON public.roles_personalizados FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.tenant_id = roles_personalizados.tenant_id)))));


--
-- Name: vendedor_clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendedor_clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: vendedor_notas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendedor_notas ENABLE ROW LEVEL SECURITY;

--
-- Name: comisiones vendedor_ver_comisiones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendedor_ver_comisiones ON public.comisiones FOR SELECT TO authenticated USING ((vendedor_id IN ( SELECT vendedores.id
   FROM public.vendedores
  WHERE (vendedores.user_id = auth.uid()))));


--
-- Name: vendedores vendedor_ver_propio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendedor_ver_propio ON public.vendedores FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: vendedor_clientes vendedor_ver_sus_clientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendedor_ver_sus_clientes ON public.vendedor_clientes FOR SELECT TO authenticated USING ((vendedor_id IN ( SELECT vendedores.id
   FROM public.vendedores
  WHERE (vendedores.user_id = auth.uid()))));


--
-- Name: vendedores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_templates whatsapp_templates_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY whatsapp_templates_tenant ON public.whatsapp_templates USING ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id()))) WITH CHECK ((public.is_super_admin() OR (tenant_id = public.auth_tenant_id())));


--
-- PostgreSQL database dump complete
--

\unrestrict eT6HIutgPD4mMxeGeGDBuVp6Y38xpElGZl0aqhzal1cwjlTYJFBg9dLYG5ERqRa

