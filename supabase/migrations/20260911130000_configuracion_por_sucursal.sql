-- La configuración de cada tienda (sucursal) también es solo de esa tienda.
--
-- Hasta ahora las tablas de configuración estaban separadas solo por
-- organización: cualquier usuario podía leer y CAMBIAR por la API el
-- catálogo, las etiquetas, las reglas, los horarios... de cualquier tienda.
-- Y casi ninguna acción del servidor comprobaba el permiso de la sección
-- (Precios, Etiquetas, Reglas...): solo lo escondía la pantalla, así que
-- alguien con "solo lectura" podía cambiar datos llamando a la acción.
--
-- Regla para cada tabla de configuración:
--   · leer: estar en esa tienda (`auth_sucursales()`);
--   · cambiar: además, tener permiso de escritura en su sección para esa
--     tienda (`auth_puede()`).
-- El propietario o un administrador puede todo en las tiendas de su
-- organización. Los procesos del sistema (IA, cron, alta de cuenta) usan la
-- clave de servicio y no les afecta.

-- ---------------------------------------------------------------------------
-- 1. ¿Puede este usuario hacer esto en esta tienda?
-- ---------------------------------------------------------------------------
-- Recibe la sección como texto, no como el enum `seccion_permiso`: el enum de
-- la base de datos y las secciones que guarda la app no coinciden (la app usa
-- 'contactos' y 'facturacion', que el enum no tiene), y `auth_has_permission`
-- no puede preguntar por ellas.
CREATE OR REPLACE FUNCTION public.auth_puede(p_branch_id uuid, p_seccion text, p_nivel text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nivel text;
BEGIN
  IF public.is_super_admin() OR public.auth_es_admin_org() THEN
    RETURN true;
  END IF;

  -- Tiene que trabajar en esa tienda
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.user_branches ub
    JOIN public.sucursales s ON s.id = ub.branch_id
    WHERE ub.user_id = auth.uid()
      AND ub.branch_id = p_branch_id
      AND s.tenant_id = public.auth_tenant_id()
  ) THEN
    RETURN false;
  END IF;

  SELECT p->>'nivel' INTO v_nivel
  FROM public.users u
  JOIN public.roles_personalizados rp ON rp.id = u.rol_personalizado_id,
       jsonb_array_elements(rp.permisos) AS p
  WHERE u.id = auth.uid()
    AND p->>'seccion' = p_seccion
  LIMIT 1;

  IF p_nivel = 'lectura' THEN
    RETURN v_nivel IN ('lectura', 'escritura');
  ELSIF p_nivel = 'escritura' THEN
    RETURN v_nivel = 'escritura';
  END IF;
  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Tablas de configuración con tenant_id y branch_id
-- ---------------------------------------------------------------------------
-- (tabla, sección que da permiso para cambiarla)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('price_list', 'precios'),
    ('categorias_precios', 'precios'),
    ('message_categories', 'etiquetas'),
    ('case_rules', 'reglas'),
    ('skills', 'skills'),
    ('channels', 'canales'),
    ('whatsapp_templates', 'canales'),
    ('daily_updates', 'novedades'),
    ('tipos_novedad', 'novedades')
  ) AS t(tabla, seccion)
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())))',
      r.tabla || '_ver', r.tabla);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales()) AND auth_puede(branch_id, %L, ''escritura''))) WITH CHECK ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales()) AND auth_puede(branch_id, %L, ''escritura'')))',
      r.tabla || '_cambiar', r.tabla, r.seccion, r.seccion);
  END LOOP;
END $$;

DROP POLICY IF EXISTS price_tenant ON public.price_list;
DROP POLICY IF EXISTS categorias_precios_tenant ON public.categorias_precios;
DROP POLICY IF EXISTS categories_tenant ON public.message_categories;
DROP POLICY IF EXISTS rules_tenant ON public.case_rules;
DROP POLICY IF EXISTS skills_tenant ON public.skills;
DROP POLICY IF EXISTS channels_tenant ON public.channels;
DROP POLICY IF EXISTS whatsapp_templates_tenant ON public.whatsapp_templates;
DROP POLICY IF EXISTS updates_select ON public.daily_updates;
DROP POLICY IF EXISTS updates_write ON public.daily_updates;
DROP POLICY IF EXISTS "Ver tipos_novedad del tenant" ON public.tipos_novedad;
DROP POLICY IF EXISTS "Insertar tipos_novedad en el tenant" ON public.tipos_novedad;
DROP POLICY IF EXISTS "Actualizar tipos_novedad del tenant" ON public.tipos_novedad;
DROP POLICY IF EXISTS "Eliminar tipos_novedad del tenant" ON public.tipos_novedad;

-- ---------------------------------------------------------------------------
-- 3. Tablas de configuración que solo tienen branch_id (perfil y políticas)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS bhours_tenant ON public.business_hours;
CREATE POLICY business_hours_ver ON public.business_hours
  FOR SELECT USING ((SELECT is_super_admin()) OR branch_id IN (SELECT auth_sucursales()));
CREATE POLICY business_hours_cambiar ON public.business_hours
  FOR ALL
  USING ((SELECT is_super_admin()) OR (branch_id IN (SELECT auth_sucursales()) AND auth_puede(branch_id, 'perfil', 'escritura')))
  WITH CHECK ((SELECT is_super_admin()) OR (branch_id IN (SELECT auth_sucursales()) AND auth_puede(branch_id, 'perfil', 'escritura')));

DROP POLICY IF EXISTS bprofiles_tenant ON public.business_profiles;
CREATE POLICY business_profiles_ver ON public.business_profiles
  FOR SELECT USING ((SELECT is_super_admin()) OR branch_id IN (SELECT auth_sucursales()));
CREATE POLICY business_profiles_cambiar ON public.business_profiles
  FOR ALL
  USING ((SELECT is_super_admin()) OR (branch_id IN (SELECT auth_sucursales()) AND auth_puede(branch_id, 'perfil', 'escritura')))
  WITH CHECK ((SELECT is_super_admin()) OR (branch_id IN (SELECT auth_sucursales()) AND auth_puede(branch_id, 'perfil', 'escritura')));

DROP POLICY IF EXISTS "Lectura policy_sources" ON public.policy_sources;
DROP POLICY IF EXISTS "Escritura policy_sources admin" ON public.policy_sources;
CREATE POLICY policy_sources_ver ON public.policy_sources
  FOR SELECT USING ((SELECT is_super_admin()) OR branch_id IN (SELECT auth_sucursales()));
CREATE POLICY policy_sources_cambiar ON public.policy_sources
  FOR ALL
  USING ((SELECT is_super_admin()) OR (branch_id IN (SELECT auth_sucursales()) AND auth_puede(branch_id, 'perfil', 'escritura')))
  WITH CHECK ((SELECT is_super_admin()) OR (branch_id IN (SELECT auth_sucursales()) AND auth_puede(branch_id, 'perfil', 'escritura')));

-- Los fragmentos de las políticas solo los escribe el sistema al procesarlas
DROP POLICY IF EXISTS "Lectura policy_fragments" ON public.policy_fragments;
CREATE POLICY policy_fragments_ver ON public.policy_fragments
  FOR SELECT USING ((SELECT is_super_admin()) OR branch_id IN (SELECT auth_sucursales()));

-- ---------------------------------------------------------------------------
-- 4. La ficha de la propia tienda
-- ---------------------------------------------------------------------------
-- Ver: las tiendas en las que trabaja. Editar: con permiso de Perfil o de
-- Sucursales en esa tienda. Crear o borrar tiendas: propietario o
-- administrador (quien tiene permiso de Sucursales crea tiendas a través de
-- la acción de la app, que lo comprueba y hace el alta completa).
DROP POLICY IF EXISTS sucursales_tenant ON public.sucursales;
CREATE POLICY sucursales_ver ON public.sucursales
  FOR SELECT USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND id IN (SELECT auth_sucursales())));
CREATE POLICY sucursales_editar ON public.sucursales
  FOR UPDATE
  USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND id IN (SELECT auth_sucursales()) AND (auth_puede(id, 'perfil', 'escritura') OR auth_puede(id, 'sucursales', 'escritura'))))
  WITH CHECK ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND id IN (SELECT auth_sucursales()) AND (auth_puede(id, 'perfil', 'escritura') OR auth_puede(id, 'sucursales', 'escritura'))));
CREATE POLICY sucursales_crear ON public.sucursales
  FOR INSERT WITH CHECK ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND (SELECT auth_es_admin_org())));
CREATE POLICY sucursales_borrar ON public.sucursales
  FOR DELETE USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND (SELECT auth_es_admin_org())));

-- ---------------------------------------------------------------------------
-- 5. Registros de la IA: los de las tiendas del usuario
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ailogs_tenant ON public.ai_logs;
CREATE POLICY ai_logs_ver ON public.ai_logs
  FOR SELECT USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())));

-- ---------------------------------------------------------------------------
-- 6. Registro de cambios: ahora sabe de qué tienda es cada cambio
-- ---------------------------------------------------------------------------
-- Los cambios de una tienda los ve quien tenga permiso de verlo en esa tienda.
-- Los de toda la organización (usuarios, plan, facturación...) y los antiguos,
-- que no tienen tienda, solo el propietario o un administrador.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_branch ON public.audit_log (branch_id);

DROP POLICY IF EXISTS audit_tenant ON public.audit_log;
CREATE POLICY audit_log_ver ON public.audit_log
  FOR SELECT USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND (
    (SELECT auth_es_admin_org())
    OR (branch_id IN (SELECT auth_sucursales()) AND auth_puede(branch_id, 'audit_log', 'lectura'))
  )));
