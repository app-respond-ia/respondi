-- La vista `saldos_actuales_ia` se creó sin `security_invoker`, así que se
-- consultaba con los permisos de su dueño (postgres) y se saltaba la RLS de
-- `message_quotas`: cualquiera que la consultara veía el saldo de créditos de
-- TODAS las organizaciones, no solo la suya. Es el único aviso de nivel ERROR
-- del linter de Supabase.
--
-- Con `security_invoker = true` la vista pasa a respetar la RLS de quien
-- consulta. No rompe nada: ninguna parte de la aplicación la usa (verificado
-- por búsqueda en todo `src/`), y el servidor, que sí podría necesitarla,
-- entra con service_role, que se salta la RLS igualmente.

ALTER VIEW public.saldos_actuales_ia SET (security_invoker = true);
