-- Migration: optimizar políticas RLS que reevalúan auth.*() por cada fila
--
-- El analizador de rendimiento de Supabase detectó 52 políticas que llaman
-- a auth.uid() (u otras auth.*()) directamente en su condición. Postgres
-- las reevalúa UNA VEZ POR FILA examinada, en vez de una sola vez por
-- consulta. Envolverlas en (select ...) permite al planificador tratarlas
-- como InitPlan y evaluarlas una única vez.
--
-- Es la solución oficial documentada por Supabase:
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- IMPORTANTE: la lógica de cada política NO cambia. Lo único que se hace
-- es sustituir `auth.uid()` por `(select auth.uid())`; los permisos
-- concedidos y denegados son exactamente los mismos que ahora.
--
-- Estas sentencias se han GENERADO desde las definiciones reales que hay
-- hoy en producción (pg_policies), no escritas a mano, para que ninguna
-- condición se altere por accidente.

ALTER POLICY audit_tenant ON public.audit_log
  USING ((is_super_admin() OR ((tenant_id = auth_tenant_id()) AND ((auth_rol() = 'admin'::rol_usuario) OR (EXISTS ( SELECT 1
   FROM (users u
     JOIN roles_personalizados rp ON ((rp.id = u.rol_personalizado_id)))
  WHERE ((u.id = (select auth.uid())) AND (rp.es_propietario = true)))) OR auth_has_permission(( SELECT users.branch_id
   FROM users
  WHERE (users.id = (select auth.uid()))), 'audit_log'::seccion_permiso, 'lectura'::nivel_permiso)))));
ALTER POLICY cat_cliente_delete ON public.client_ticket_categorias
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY cat_cliente_insert ON public.client_ticket_categorias
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY cat_cliente_select ON public.client_ticket_categorias
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR ((select auth.uid()) IS NOT NULL)));
ALTER POLICY cat_cliente_update ON public.client_ticket_categorias
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY client_ticket_messages_insert ON public.client_ticket_messages
  WITH CHECK (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (ticket_id IN ( SELECT client_tickets.id
   FROM client_tickets
  WHERE ((client_tickets.tenant_id = auth_tenant_id()) AND auth_has_permission(client_tickets.branch_id, 'soporte'::seccion_permiso, 'escritura'::nivel_permiso))))));
ALTER POLICY client_ticket_messages_select ON public.client_ticket_messages
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (ticket_id IN ( SELECT client_tickets.id
   FROM client_tickets
  WHERE ((client_tickets.tenant_id = auth_tenant_id()) AND auth_has_permission(client_tickets.branch_id, 'soporte'::seccion_permiso, 'lectura'::nivel_permiso))))));
ALTER POLICY notas_cliente_delete ON public.client_ticket_notas
  USING (((tenant_id = auth_tenant_id()) AND (user_id = (select auth.uid()))));
ALTER POLICY notas_cliente_insert ON public.client_ticket_notas
  WITH CHECK (((tenant_id = auth_tenant_id()) AND (user_id = (select auth.uid()))));
ALTER POLICY notas_cliente_select ON public.client_ticket_notas
  USING (((tenant_id = auth_tenant_id()) AND ((visibilidad = 'compartida'::text) OR (user_id = (select auth.uid())))));
ALTER POLICY client_tickets_insert ON public.client_tickets
  WITH CHECK (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR ((tenant_id = auth_tenant_id()) AND auth_has_permission(branch_id, 'soporte'::seccion_permiso, 'escritura'::nivel_permiso))));
ALTER POLICY client_tickets_select ON public.client_tickets
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR ((tenant_id = auth_tenant_id()) AND auth_has_permission(branch_id, 'soporte'::seccion_permiso, 'lectura'::nivel_permiso))));
ALTER POLICY client_tickets_update ON public.client_tickets
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR ((tenant_id = auth_tenant_id()) AND auth_has_permission(branch_id, 'soporte'::seccion_permiso, 'escritura'::nivel_permiso))));
ALTER POLICY superadmin_comisiones ON public.comisiones
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY vendedor_ver_comisiones ON public.comisiones
  USING ((vendedor_id IN ( SELECT vendedores.id
   FROM vendedores
  WHERE (vendedores.user_id = (select auth.uid())))));
ALTER POLICY superadmin_comisiones_log ON public.comisiones_log
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY "Actualizar notas internas del tenant" ON public.internal_notes
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (tenant_id = auth_tenant_id())))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (tenant_id = auth_tenant_id())));
ALTER POLICY "Eliminar notas internas del tenant" ON public.internal_notes
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (tenant_id = auth_tenant_id())));
ALTER POLICY "Insertar notas internas en el tenant" ON public.internal_notes
  WITH CHECK (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (tenant_id = auth_tenant_id())));
ALTER POLICY "Ver notas internas del tenant" ON public.internal_notes
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (tenant_id = auth_tenant_id())));
ALTER POLICY notif_prefs_own ON public.notification_preferences
  USING ((is_super_admin() OR (user_id = (select auth.uid()))))
  WITH CHECK ((is_super_admin() OR (user_id = (select auth.uid()))));
ALTER POLICY notif_own ON public.notifications
  USING ((is_super_admin() OR (user_id = (select auth.uid()))))
  WITH CHECK ((is_super_admin() OR (user_id = (select auth.uid()))));
ALTER POLICY plans_read ON public.plans
  USING (((select auth.uid()) IS NOT NULL));
ALTER POLICY admin_roles_personalizados ON public.roles_personalizados
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.tenant_id = roles_personalizados.tenant_id) AND (users.rol = 'admin'::rol_usuario)))));
ALTER POLICY usuario_ver_roles ON public.roles_personalizados
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.tenant_id = roles_personalizados.tenant_id)))));
ALTER POLICY superadmin_skills_globales ON public.skills_globales
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY superadmin_roles_select ON public.superadmin_roles
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY superadmin_roles_write ON public.superadmin_roles
  USING ((EXISTS ( SELECT 1
   FROM (users u
     JOIN superadmin_roles r ON ((r.id = u.superadmin_rol_id)))
  WHERE ((u.id = (select auth.uid())) AND ((r.es_propietario = true) OR (r.nivel <= 2))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (users u
     JOIN superadmin_roles r ON ((r.id = u.superadmin_rol_id)))
  WHERE ((u.id = (select auth.uid())) AND ((r.es_propietario = true) OR (r.nivel <= 2))))));
ALTER POLICY ticket_messages_insert ON public.support_ticket_messages
  WITH CHECK ((is_super_admin() OR (ticket_id IN ( SELECT support_tickets.id
   FROM support_tickets
  WHERE (support_tickets.vendedor_id = ( SELECT vendedores.id
           FROM vendedores
          WHERE (vendedores.user_id = (select auth.uid()))))))));
ALTER POLICY ticket_messages_select ON public.support_ticket_messages
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (ticket_id IN ( SELECT support_tickets.id
   FROM support_tickets
  WHERE (support_tickets.vendedor_id = ( SELECT vendedores.id
           FROM vendedores
          WHERE (vendedores.user_id = (select auth.uid()))))))));
ALTER POLICY tickets_insert ON public.support_tickets
  WITH CHECK ((is_super_admin() OR (vendedor_id = ( SELECT vendedores.id
   FROM vendedores
  WHERE (vendedores.user_id = (select auth.uid()))))));
ALTER POLICY tickets_select ON public.support_tickets
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (vendedor_id = ( SELECT vendedores.id
   FROM vendedores
  WHERE (vendedores.user_id = (select auth.uid()))))));
ALTER POLICY tickets_update ON public.support_tickets
  USING ((is_super_admin() OR (vendedor_id = ( SELECT vendedores.id
   FROM vendedores
  WHERE (vendedores.user_id = (select auth.uid()))))));
ALTER POLICY categorias_delete ON public.ticket_categorias
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY categorias_insert ON public.ticket_categorias
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY categorias_select ON public.ticket_categorias
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY categorias_update ON public.ticket_categorias
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY "Usuarios pueden borrar sus pines" ON public.tickets_fijados
  USING (((select auth.uid()) = user_id));
ALTER POLICY "Usuarios pueden crear sus pines" ON public.tickets_fijados
  WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "Usuarios pueden ver sus propios pines" ON public.tickets_fijados
  USING (((select auth.uid()) = user_id));
ALTER POLICY "Actualizar tipos_novedad del tenant" ON public.tipos_novedad
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (tenant_id = auth_tenant_id())))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (tenant_id = auth_tenant_id())));
ALTER POLICY "Eliminar tipos_novedad del tenant" ON public.tipos_novedad
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (tenant_id = auth_tenant_id())));
ALTER POLICY "Insertar tipos_novedad en el tenant" ON public.tipos_novedad
  WITH CHECK (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (tenant_id = auth_tenant_id())));
ALTER POLICY "Ver tipos_novedad del tenant" ON public.tipos_novedad
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))) OR (tenant_id = auth_tenant_id())));
ALTER POLICY user_branches_access ON public.user_branches
  USING ((is_super_admin() OR (user_id = (select auth.uid())) OR (branch_id IN ( SELECT sucursales.id
   FROM sucursales
  WHERE (sucursales.tenant_id = auth_tenant_id())))))
  WITH CHECK ((is_super_admin() OR (user_id = (select auth.uid())) OR (branch_id IN ( SELECT sucursales.id
   FROM sucursales
  WHERE (sucursales.tenant_id = auth_tenant_id())))));
ALTER POLICY users_tenant ON public.users
  USING ((is_super_admin() OR (tenant_id = auth_tenant_id()) OR (id = (select auth.uid()))));
ALTER POLICY superadmin_vendedor_clientes ON public.vendedor_clientes
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY vendedor_ver_sus_clientes ON public.vendedor_clientes
  USING ((vendedor_id IN ( SELECT vendedores.id
   FROM vendedores
  WHERE (vendedores.user_id = (select auth.uid())))));
ALTER POLICY notas_insert ON public.vendedor_notas
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY notas_select ON public.vendedor_notas
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY superadmin_vendedores ON public.vendedores
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.rol = 'super_admin'::rol_usuario)))));
ALTER POLICY vendedor_ver_propio ON public.vendedores
  USING ((user_id = (select auth.uid())));
