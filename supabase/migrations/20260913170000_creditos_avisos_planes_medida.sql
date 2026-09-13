-- Créditos y planes (13-09-2026, tramo 2 del bloque acordado con Jorge)
--
-- 1. Avisos de créditos: la app avisa al llegar al 20 % y al agotarse
--    (campana + correo). `aviso_creditos` recuerda qué aviso se ha dado ya
--    ('bajo' o 'agotado') para no repetirlo; se limpia sola cuando el saldo
--    vuelve a subir (recarga o renovación).
-- 2. Solicitud de cambio de plan: hasta que Stripe esté conectado, el
--    cliente pide un plan y el superadmin lo aprueba o lo rechaza.
-- 3. Planes a medida: solo los ven (y pueden pedir) las organizaciones de
--    su lista.
-- 4. El aviso diario de créditos bajos de pg_cron estaba roto (usaba
--    `organizaciones.umbral_alerta_creditos` y `message_quotas.created_at`,
--    que no existen): la función queda solo con el aviso de vencimiento.

ALTER TABLE public.organizaciones
  ADD COLUMN IF NOT EXISTS aviso_creditos text,
  ADD COLUMN IF NOT EXISTS plan_solicitado_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_solicitado_en timestamptz;

ALTER TABLE public.organizaciones DROP CONSTRAINT IF EXISTS organizaciones_aviso_creditos_check;
ALTER TABLE public.organizaciones ADD CONSTRAINT organizaciones_aviso_creditos_check
  CHECK (aviso_creditos IS NULL OR aviso_creditos IN ('bajo', 'agotado'));

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS personalizado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS organizaciones_ids uuid[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.check_clientes_por_vencer_y_creditos()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r_org record;
  r_admin record;
  v_pref boolean;
begin
  -- Cuentas que vencen en los próximos 3 días. (El aviso de créditos bajos
  -- ya no va aquí: lo da la app en el momento, al 20 % y al agotarse.)
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
end;
$function$;
