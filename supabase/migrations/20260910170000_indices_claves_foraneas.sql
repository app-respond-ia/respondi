-- Migration: crear índices para las claves foráneas que no los tienen
--
-- El analizador detectó 81 claves foráneas sin índice de cobertura. Sin
-- él, los joins por esa columna y los borrados en cascada del padre
-- obligan a recorrer la tabla hija entera.
--
-- AVISO DE EXPECTATIVAS: hoy estas tablas son diminutas (la mayor tiene
-- 55 filas), así que Postgres las recorre secuencialmente de todos modos
-- y estos índices NO van a acelerar nada de forma perceptible ahora
-- mismo. Es una medida preventiva para cuando haya datos reales, no el
-- arreglo de la lentitud actual.
--
-- Se usa CREATE INDEX (no CONCURRENTLY) porque las migraciones se
-- ejecutan dentro de una transacción y, con este volumen de datos, cada
-- índice se crea de forma prácticamente instantánea.

CREATE INDEX IF NOT EXISTS idx_ai_logs_branch_id ON public.ai_logs (branch_id);
CREATE INDEX IF NOT EXISTS idx_ai_logs_message_id ON public.ai_logs (message_id);
CREATE INDEX IF NOT EXISTS idx_ai_logs_tenant_id ON public.ai_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actuado_como_id ON public.audit_log (actuado_como_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_billing_plan_id ON public.billing (plan_id);
CREATE INDEX IF NOT EXISTS idx_billing_tenant_id ON public.billing (tenant_id);
CREATE INDEX IF NOT EXISTS idx_business_hours_branch_id ON public.business_hours (branch_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_branch_id ON public.business_profiles (branch_id);
CREATE INDEX IF NOT EXISTS idx_case_notes_case_id ON public.case_notes (case_id);
CREATE INDEX IF NOT EXISTS idx_case_notes_tenant_id ON public.case_notes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_case_notes_user_id ON public.case_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_case_rules_tenant_id ON public.case_rules (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cases_branch_id ON public.cases (branch_id);
CREATE INDEX IF NOT EXISTS idx_cases_contact_id ON public.cases (contact_id);
CREATE INDEX IF NOT EXISTS idx_cases_conversation_id ON public.cases (conversation_id);
CREATE INDEX IF NOT EXISTS idx_cases_producto_id ON public.cases (producto_id);
CREATE INDEX IF NOT EXISTS idx_categorias_precios_parent_id ON public.categorias_precios (parent_id);
CREATE INDEX IF NOT EXISTS idx_categorias_precios_tenant_id ON public.categorias_precios (tenant_id);
CREATE INDEX IF NOT EXISTS idx_channels_branch_id ON public.channels (branch_id);
CREATE INDEX IF NOT EXISTS idx_client_ticket_messages_tenant_id ON public.client_ticket_messages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_ticket_messages_ticket_id ON public.client_ticket_messages (ticket_id);
CREATE INDEX IF NOT EXISTS idx_client_ticket_messages_user_id ON public.client_ticket_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_client_ticket_notas_tenant_id ON public.client_ticket_notas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_ticket_notas_ticket_id ON public.client_ticket_notas (ticket_id);
CREATE INDEX IF NOT EXISTS idx_client_ticket_notas_user_id ON public.client_ticket_notas (user_id);
CREATE INDEX IF NOT EXISTS idx_client_tickets_asignado_a ON public.client_tickets (asignado_a);
CREATE INDEX IF NOT EXISTS idx_client_tickets_branch_id ON public.client_tickets (branch_id);
CREATE INDEX IF NOT EXISTS idx_client_tickets_categoria_id ON public.client_tickets (categoria_id);
CREATE INDEX IF NOT EXISTS idx_client_tickets_tenant_id ON public.client_tickets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_tickets_user_id ON public.client_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_aprobado_por ON public.comisiones (aprobado_por);
CREATE INDEX IF NOT EXISTS idx_comisiones_log_comision_id ON public.comisiones_log (comision_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_log_user_id ON public.comisiones_log (user_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_organizacion_id ON public.comisiones (organizacion_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_vendedor_id ON public.comisiones (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_category_id ON public.conversation_tags (category_id);
CREATE INDEX IF NOT EXISTS idx_conversations_atendida_por ON public.conversations (atendida_por);
CREATE INDEX IF NOT EXISTS idx_conversations_branch_id ON public.conversations (branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_updates_tenant_id ON public.daily_updates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_daily_updates_tipo_id ON public.daily_updates (tipo_id);
CREATE INDEX IF NOT EXISTS idx_daily_updates_user_id ON public.daily_updates (user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_tenant_id ON public.error_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_conversation_id ON public.internal_notes (conversation_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_tenant_id ON public.internal_notes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_user_id ON public.internal_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_message_categories_tenant_id ON public.message_categories (tenant_id);
CREATE INDEX IF NOT EXISTS idx_message_quotas_branch_id ON public.message_quotas (branch_id);
CREATE INDEX IF NOT EXISTS idx_messages_agente_id ON public.messages (agente_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON public.messages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON public.notifications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_organizaciones_id_vendedor ON public.organizaciones (id_vendedor);
CREATE INDEX IF NOT EXISTS idx_organizaciones_plan_id ON public.organizaciones (plan_id);
CREATE INDEX IF NOT EXISTS idx_organizaciones_plan_pendiente_id ON public.organizaciones (plan_pendiente_id);
CREATE INDEX IF NOT EXISTS idx_policy_fragments_tenant_id ON public.policy_fragments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_policy_sources_tenant_id ON public.policy_sources (tenant_id);
CREATE INDEX IF NOT EXISTS idx_price_list_categoria_id ON public.price_list (categoria_id);
CREATE INDEX IF NOT EXISTS idx_price_list_tenant_id ON public.price_list (tenant_id);
CREATE INDEX IF NOT EXISTS idx_skills_skill_global_id ON public.skills (skill_global_id);
CREATE INDEX IF NOT EXISTS idx_skills_tenant_id ON public.skills (tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_id ON public.support_ticket_messages (ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_user_id ON public.support_ticket_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_asignado_a ON public.support_tickets (asignado_a);
CREATE INDEX IF NOT EXISTS idx_support_tickets_categoria_id ON public.support_tickets (categoria_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_vendedor_id ON public.support_tickets (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_tickets_fijados_client_ticket_id ON public.tickets_fijados (client_ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_fijados_support_ticket_id ON public.tickets_fijados (support_ticket_id);
CREATE INDEX IF NOT EXISTS idx_tipos_novedad_branch_id ON public.tipos_novedad (branch_id);
CREATE INDEX IF NOT EXISTS idx_tipos_novedad_tenant_id ON public.tipos_novedad (tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON public.users (branch_id);
CREATE INDEX IF NOT EXISTS idx_users_prev_branch_id ON public.users (prev_branch_id);
CREATE INDEX IF NOT EXISTS idx_users_prev_tenant_id ON public.users (prev_tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_rol_personalizado_id ON public.users (rol_personalizado_id);
CREATE INDEX IF NOT EXISTS idx_users_superadmin_rol_id ON public.users (superadmin_rol_id);
CREATE INDEX IF NOT EXISTS idx_vendedor_clientes_vendedor_id ON public.vendedor_clientes (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_vendedor_notas_user_id ON public.vendedor_notas (user_id);
CREATE INDEX IF NOT EXISTS idx_vendedor_notas_vendedor_id ON public.vendedor_notas (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_vendedores_user_id ON public.vendedores (user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_branch_id ON public.whatsapp_templates (branch_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_tenant_id ON public.whatsapp_templates (tenant_id);
