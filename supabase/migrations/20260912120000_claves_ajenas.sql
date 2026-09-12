-- AUDITORÍA DEL ESQUEMA (12-09-2026): la base de datos casi no tenía
-- relaciones declaradas. Las columnas *_id apuntaban a otras tablas solo "de
-- palabra": nada impedía que quedara un mensaje de una conversación borrada,
-- un caso de un contacto que ya no existe o una organización con un plan que
-- se borró. Comprobado antes: CERO filas huérfanas en todas las relaciones,
-- así que se pueden declarar sin tocar ningún dato.
--
-- Qué pasa al borrar (lo que ya hacía la app a mano, ahora garantizado):
--   CASCADE  → lo que pertenece al borrado se va con él (los mensajes de una
--              conversación, las notas de un caso, todo lo de una organización)
--   SET NULL → lo que debe sobrevivir pierde solo la referencia (el histórico
--              de auditoría o de coste de IA cuando se borra su usuario o su
--              mensaje)
--   RESTRICT → no se deja borrar lo que está en uso (un plan con
--              organizaciones dentro, un vendedor con comisiones)
--
-- Además, el índice que faltaba para la relación nueva de canales →
-- plantilla de reapertura (lo avisaba el linter de Supabase).

CREATE INDEX IF NOT EXISTS idx_channels_plantilla_reapertura_id
  ON public.channels (plantilla_reapertura_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_logs_tenant_id') THEN
    ALTER TABLE public.ai_logs ADD CONSTRAINT fk_ai_logs_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_log_tenant_id') THEN
    ALTER TABLE public.audit_log ADD CONSTRAINT fk_audit_log_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_billing_tenant_id') THEN
    ALTER TABLE public.billing ADD CONSTRAINT fk_billing_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_notes_tenant_id') THEN
    ALTER TABLE public.case_notes ADD CONSTRAINT fk_case_notes_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_rules_tenant_id') THEN
    ALTER TABLE public.case_rules ADD CONSTRAINT fk_case_rules_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cases_tenant_id') THEN
    ALTER TABLE public.cases ADD CONSTRAINT fk_cases_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_categorias_precios_tenant_id') THEN
    ALTER TABLE public.categorias_precios ADD CONSTRAINT fk_categorias_precios_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_channels_tenant_id') THEN
    ALTER TABLE public.channels ADD CONSTRAINT fk_channels_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_ticket_messages_tenant_id') THEN
    ALTER TABLE public.client_ticket_messages ADD CONSTRAINT fk_client_ticket_messages_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_ticket_notas_tenant_id') THEN
    ALTER TABLE public.client_ticket_notas ADD CONSTRAINT fk_client_ticket_notas_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_tickets_tenant_id') THEN
    ALTER TABLE public.client_tickets ADD CONSTRAINT fk_client_tickets_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contactos_sucursal_tenant_id') THEN
    ALTER TABLE public.contactos_sucursal ADD CONSTRAINT fk_contactos_sucursal_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contacts_tenant_id') THEN
    ALTER TABLE public.contacts ADD CONSTRAINT fk_contacts_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversations_tenant_id') THEN
    ALTER TABLE public.conversations ADD CONSTRAINT fk_conversations_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_daily_updates_tenant_id') THEN
    ALTER TABLE public.daily_updates ADD CONSTRAINT fk_daily_updates_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_error_logs_tenant_id') THEN
    ALTER TABLE public.error_logs ADD CONSTRAINT fk_error_logs_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_internal_notes_tenant_id') THEN
    ALTER TABLE public.internal_notes ADD CONSTRAINT fk_internal_notes_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_categories_tenant_id') THEN
    ALTER TABLE public.message_categories ADD CONSTRAINT fk_message_categories_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_quotas_tenant_id') THEN
    ALTER TABLE public.message_quotas ADD CONSTRAINT fk_message_quotas_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_tenant_id') THEN
    ALTER TABLE public.messages ADD CONSTRAINT fk_messages_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notifications_tenant_id') THEN
    ALTER TABLE public.notifications ADD CONSTRAINT fk_notifications_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_policy_fragments_tenant_id') THEN
    ALTER TABLE public.policy_fragments ADD CONSTRAINT fk_policy_fragments_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_policy_sources_tenant_id') THEN
    ALTER TABLE public.policy_sources ADD CONSTRAINT fk_policy_sources_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_price_list_tenant_id') THEN
    ALTER TABLE public.price_list ADD CONSTRAINT fk_price_list_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_roles_personalizados_tenant_id') THEN
    ALTER TABLE public.roles_personalizados ADD CONSTRAINT fk_roles_personalizados_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_skills_tenant_id') THEN
    ALTER TABLE public.skills ADD CONSTRAINT fk_skills_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sucursales_tenant_id') THEN
    ALTER TABLE public.sucursales ADD CONSTRAINT fk_sucursales_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tipos_novedad_tenant_id') THEN
    ALTER TABLE public.tipos_novedad ADD CONSTRAINT fk_tipos_novedad_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_tenant_id') THEN
    ALTER TABLE public.users ADD CONSTRAINT fk_users_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_templates_tenant_id') THEN
    ALTER TABLE public.whatsapp_templates ADD CONSTRAINT fk_whatsapp_templates_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_logs_branch_id') THEN
    ALTER TABLE public.ai_logs ADD CONSTRAINT fk_ai_logs_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_log_branch_id') THEN
    ALTER TABLE public.audit_log ADD CONSTRAINT fk_audit_log_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_business_hours_branch_id') THEN
    ALTER TABLE public.business_hours ADD CONSTRAINT fk_business_hours_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_business_profiles_branch_id') THEN
    ALTER TABLE public.business_profiles ADD CONSTRAINT fk_business_profiles_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_rules_branch_id') THEN
    ALTER TABLE public.case_rules ADD CONSTRAINT fk_case_rules_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cases_branch_id') THEN
    ALTER TABLE public.cases ADD CONSTRAINT fk_cases_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_categorias_precios_branch_id') THEN
    ALTER TABLE public.categorias_precios ADD CONSTRAINT fk_categorias_precios_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_channels_branch_id') THEN
    ALTER TABLE public.channels ADD CONSTRAINT fk_channels_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_tickets_branch_id') THEN
    ALTER TABLE public.client_tickets ADD CONSTRAINT fk_client_tickets_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contactos_sucursal_branch_id') THEN
    ALTER TABLE public.contactos_sucursal ADD CONSTRAINT fk_contactos_sucursal_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversations_branch_id') THEN
    ALTER TABLE public.conversations ADD CONSTRAINT fk_conversations_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_daily_updates_branch_id') THEN
    ALTER TABLE public.daily_updates ADD CONSTRAINT fk_daily_updates_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_categories_branch_id') THEN
    ALTER TABLE public.message_categories ADD CONSTRAINT fk_message_categories_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_quotas_branch_id') THEN
    ALTER TABLE public.message_quotas ADD CONSTRAINT fk_message_quotas_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_policy_fragments_branch_id') THEN
    ALTER TABLE public.policy_fragments ADD CONSTRAINT fk_policy_fragments_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_policy_sources_branch_id') THEN
    ALTER TABLE public.policy_sources ADD CONSTRAINT fk_policy_sources_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_price_list_branch_id') THEN
    ALTER TABLE public.price_list ADD CONSTRAINT fk_price_list_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_skills_branch_id') THEN
    ALTER TABLE public.skills ADD CONSTRAINT fk_skills_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tipos_novedad_branch_id') THEN
    ALTER TABLE public.tipos_novedad ADD CONSTRAINT fk_tipos_novedad_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_branches_branch_id') THEN
    ALTER TABLE public.user_branches ADD CONSTRAINT fk_user_branches_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_templates_branch_id') THEN
    ALTER TABLE public.whatsapp_templates ADD CONSTRAINT fk_whatsapp_templates_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_conversation_id') THEN
    ALTER TABLE public.messages ADD CONSTRAINT fk_messages_conversation_id
      FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_agente_id') THEN
    ALTER TABLE public.messages ADD CONSTRAINT fk_messages_agente_id
      FOREIGN KEY (agente_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversations_contact_id') THEN
    ALTER TABLE public.conversations ADD CONSTRAINT fk_conversations_contact_id
      FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversations_atendida_por') THEN
    ALTER TABLE public.conversations ADD CONSTRAINT fk_conversations_atendida_por
      FOREIGN KEY (atendida_por) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversation_tags_conversation_id') THEN
    ALTER TABLE public.conversation_tags ADD CONSTRAINT fk_conversation_tags_conversation_id
      FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversation_tags_category_id') THEN
    ALTER TABLE public.conversation_tags ADD CONSTRAINT fk_conversation_tags_category_id
      FOREIGN KEY (category_id) REFERENCES public.message_categories(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_internal_notes_conversation_id') THEN
    ALTER TABLE public.internal_notes ADD CONSTRAINT fk_internal_notes_conversation_id
      FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_internal_notes_user_id') THEN
    ALTER TABLE public.internal_notes ADD CONSTRAINT fk_internal_notes_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cases_conversation_id') THEN
    ALTER TABLE public.cases ADD CONSTRAINT fk_cases_conversation_id
      FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cases_contact_id') THEN
    ALTER TABLE public.cases ADD CONSTRAINT fk_cases_contact_id
      FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cases_agente_id') THEN
    ALTER TABLE public.cases ADD CONSTRAINT fk_cases_agente_id
      FOREIGN KEY (agente_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cases_producto_id') THEN
    ALTER TABLE public.cases ADD CONSTRAINT fk_cases_producto_id
      FOREIGN KEY (producto_id) REFERENCES public.price_list(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_notes_case_id') THEN
    ALTER TABLE public.case_notes ADD CONSTRAINT fk_case_notes_case_id
      FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_notes_user_id') THEN
    ALTER TABLE public.case_notes ADD CONSTRAINT fk_case_notes_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_logs_message_id') THEN
    ALTER TABLE public.ai_logs ADD CONSTRAINT fk_ai_logs_message_id
      FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contactos_sucursal_contact_id') THEN
    ALTER TABLE public.contactos_sucursal ADD CONSTRAINT fk_contactos_sucursal_contact_id
      FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_templates_channel_id') THEN
    ALTER TABLE public.whatsapp_templates ADD CONSTRAINT fk_whatsapp_templates_channel_id
      FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_branches_user_id') THEN
    ALTER TABLE public.user_branches ADD CONSTRAINT fk_user_branches_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_branch_id') THEN
    ALTER TABLE public.users ADD CONSTRAINT fk_users_branch_id
      FOREIGN KEY (branch_id) REFERENCES public.sucursales(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_prev_branch_id') THEN
    ALTER TABLE public.users ADD CONSTRAINT fk_users_prev_branch_id
      FOREIGN KEY (prev_branch_id) REFERENCES public.sucursales(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_prev_tenant_id') THEN
    ALTER TABLE public.users ADD CONSTRAINT fk_users_prev_tenant_id
      FOREIGN KEY (prev_tenant_id) REFERENCES public.organizaciones(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_rol_personalizado_id') THEN
    ALTER TABLE public.users ADD CONSTRAINT fk_users_rol_personalizado_id
      FOREIGN KEY (rol_personalizado_id) REFERENCES public.roles_personalizados(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_superadmin_rol_id') THEN
    ALTER TABLE public.users ADD CONSTRAINT fk_users_superadmin_rol_id
      FOREIGN KEY (superadmin_rol_id) REFERENCES public.superadmin_roles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_policy_fragments_source_id') THEN
    ALTER TABLE public.policy_fragments ADD CONSTRAINT fk_policy_fragments_source_id
      FOREIGN KEY (source_id) REFERENCES public.policy_sources(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_price_list_categoria_id') THEN
    ALTER TABLE public.price_list ADD CONSTRAINT fk_price_list_categoria_id
      FOREIGN KEY (categoria_id) REFERENCES public.categorias_precios(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_categorias_precios_parent_id') THEN
    ALTER TABLE public.categorias_precios ADD CONSTRAINT fk_categorias_precios_parent_id
      FOREIGN KEY (parent_id) REFERENCES public.categorias_precios(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_skills_skill_global_id') THEN
    ALTER TABLE public.skills ADD CONSTRAINT fk_skills_skill_global_id
      FOREIGN KEY (skill_global_id) REFERENCES public.skills_globales(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_daily_updates_tipo_id') THEN
    ALTER TABLE public.daily_updates ADD CONSTRAINT fk_daily_updates_tipo_id
      FOREIGN KEY (tipo_id) REFERENCES public.tipos_novedad(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_daily_updates_user_id') THEN
    ALTER TABLE public.daily_updates ADD CONSTRAINT fk_daily_updates_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_organizaciones_plan_id') THEN
    ALTER TABLE public.organizaciones ADD CONSTRAINT fk_organizaciones_plan_id
      FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_organizaciones_plan_pendiente_id') THEN
    ALTER TABLE public.organizaciones ADD CONSTRAINT fk_organizaciones_plan_pendiente_id
      FOREIGN KEY (plan_pendiente_id) REFERENCES public.plans(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_billing_plan_id') THEN
    ALTER TABLE public.billing ADD CONSTRAINT fk_billing_plan_id
      FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notifications_user_id') THEN
    ALTER TABLE public.notifications ADD CONSTRAINT fk_notifications_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notification_preferences_user_id') THEN
    ALTER TABLE public.notification_preferences ADD CONSTRAINT fk_notification_preferences_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_log_user_id') THEN
    ALTER TABLE public.audit_log ADD CONSTRAINT fk_audit_log_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_log_actuado_como_id') THEN
    ALTER TABLE public.audit_log ADD CONSTRAINT fk_audit_log_actuado_como_id
      FOREIGN KEY (actuado_como_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_tickets_user_id') THEN
    ALTER TABLE public.client_tickets ADD CONSTRAINT fk_client_tickets_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_ticket_messages_ticket_id') THEN
    ALTER TABLE public.client_ticket_messages ADD CONSTRAINT fk_client_ticket_messages_ticket_id
      FOREIGN KEY (ticket_id) REFERENCES public.client_tickets(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_ticket_messages_user_id') THEN
    ALTER TABLE public.client_ticket_messages ADD CONSTRAINT fk_client_ticket_messages_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_ticket_notas_ticket_id') THEN
    ALTER TABLE public.client_ticket_notas ADD CONSTRAINT fk_client_ticket_notas_ticket_id
      FOREIGN KEY (ticket_id) REFERENCES public.client_tickets(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_ticket_notas_user_id') THEN
    ALTER TABLE public.client_ticket_notas ADD CONSTRAINT fk_client_ticket_notas_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_support_ticket_messages_ticket_id') THEN
    ALTER TABLE public.support_ticket_messages ADD CONSTRAINT fk_support_ticket_messages_ticket_id
      FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_support_ticket_messages_user_id') THEN
    ALTER TABLE public.support_ticket_messages ADD CONSTRAINT fk_support_ticket_messages_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_support_tickets_vendedor_id') THEN
    ALTER TABLE public.support_tickets ADD CONSTRAINT fk_support_tickets_vendedor_id
      FOREIGN KEY (vendedor_id) REFERENCES public.vendedores(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_fijados_user_id') THEN
    ALTER TABLE public.tickets_fijados ADD CONSTRAINT fk_tickets_fijados_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_fijados_support_ticket_id') THEN
    ALTER TABLE public.tickets_fijados ADD CONSTRAINT fk_tickets_fijados_support_ticket_id
      FOREIGN KEY (support_ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_fijados_client_ticket_id') THEN
    ALTER TABLE public.tickets_fijados ADD CONSTRAINT fk_tickets_fijados_client_ticket_id
      FOREIGN KEY (client_ticket_id) REFERENCES public.client_tickets(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendedores_user_id') THEN
    ALTER TABLE public.vendedores ADD CONSTRAINT fk_vendedores_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendedor_clientes_vendedor_id') THEN
    ALTER TABLE public.vendedor_clientes ADD CONSTRAINT fk_vendedor_clientes_vendedor_id
      FOREIGN KEY (vendedor_id) REFERENCES public.vendedores(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendedor_clientes_organizacion_id') THEN
    ALTER TABLE public.vendedor_clientes ADD CONSTRAINT fk_vendedor_clientes_organizacion_id
      FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendedor_notas_vendedor_id') THEN
    ALTER TABLE public.vendedor_notas ADD CONSTRAINT fk_vendedor_notas_vendedor_id
      FOREIGN KEY (vendedor_id) REFERENCES public.vendedores(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendedor_notas_user_id') THEN
    ALTER TABLE public.vendedor_notas ADD CONSTRAINT fk_vendedor_notas_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_comisiones_vendedor_id') THEN
    ALTER TABLE public.comisiones ADD CONSTRAINT fk_comisiones_vendedor_id
      FOREIGN KEY (vendedor_id) REFERENCES public.vendedores(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_comisiones_organizacion_id') THEN
    ALTER TABLE public.comisiones ADD CONSTRAINT fk_comisiones_organizacion_id
      FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_comisiones_log_comision_id') THEN
    ALTER TABLE public.comisiones_log ADD CONSTRAINT fk_comisiones_log_comision_id
      FOREIGN KEY (comision_id) REFERENCES public.comisiones(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_comisiones_log_user_id') THEN
    ALTER TABLE public.comisiones_log ADD CONSTRAINT fk_comisiones_log_user_id
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;
