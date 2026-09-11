-- Cada tienda (sucursal) ve solo lo suyo. Decidido con Jorge el 11-09-2026:
-- los datos de los clientes de una tienda no se comparten con las demás.
--
-- Hasta ahora la base de datos solo separaba por organización: cualquier
-- usuario de la organización podía leer por la API las conversaciones, los
-- mensajes, las notas y los contactos de TODAS las tiendas, y la separación
-- dependía de que cada pantalla filtrase bien (Conversaciones no lo hacía).
-- Además, la lista de tiendas asignadas a cada usuario (`user_branches`) la
-- podía modificar cualquiera, así que un agente podía asignarse otra tienda.
--
-- Quién puede trabajar en qué tienda:
--   · propietario o administrador de la organización → todas las suyas;
--   · el resto → las que tiene asignadas en `user_branches`.
-- Los permisos por sección (Chats, Casos, Contactos...) siguen igual.
--
-- La configuración de cada tienda (catálogo, horarios, políticas...) queda
-- para otro tramo: no guarda datos de clientes.

-- ---------------------------------------------------------------------------
-- 1. Quién puede ver qué tiendas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_es_admin_org()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT u.rol = 'admin' OR coalesce(rp.es_propietario, false)
    FROM public.users u
    LEFT JOIN public.roles_personalizados rp ON rp.id = u.rol_personalizado_id
    WHERE u.id = auth.uid()
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.auth_sucursales()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id
  FROM public.sucursales s
  WHERE s.tenant_id = public.auth_tenant_id()
    AND (
      public.auth_es_admin_org()
      OR EXISTS (
        SELECT 1 FROM public.user_branches ub
        WHERE ub.user_id = auth.uid() AND ub.branch_id = s.id
      )
    )
$$;

-- ---------------------------------------------------------------------------
-- 2. Ficha del contacto por tienda (trato, modo, respuesta automática, nota)
-- ---------------------------------------------------------------------------
-- El contacto sigue siendo la misma persona en toda la organización (mismo
-- número = mismo contacto, y su nombre es compartido), pero cómo la trata cada
-- tienda y lo que anota sobre ella es de esa tienda.
CREATE TABLE public.contactos_sucursal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  trato text NOT NULL DEFAULT 'normal' CHECK (trato IN ('normal', 'sin_ia', 'bloqueado')),
  modo text CHECK (modo IN ('ignorar', 'respuesta_automatica', 'derivar')),
  respuesta_auto text,
  nota text CHECK (nota IS NULL OR char_length(nota) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  fecha_actualizacion timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, branch_id)
);

CREATE INDEX idx_contactos_sucursal_branch ON public.contactos_sucursal (branch_id);
CREATE INDEX idx_contactos_sucursal_tenant ON public.contactos_sucursal (tenant_id);

ALTER TABLE public.contactos_sucursal ENABLE ROW LEVEL SECURITY;

CREATE POLICY contactos_sucursal_acceso ON public.contactos_sucursal
  FOR ALL
  USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())))
  WITH CHECK ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())));

-- Lo que hoy está puesto en el contacto se aplicaba a todas las tiendas: se
-- copia a cada una para que nada cambie al desplegar. A partir de aquí, cada
-- tienda lo cambia por su cuenta. (A fecha de hoy no hay ninguno.)
INSERT INTO public.contactos_sucursal (tenant_id, branch_id, contact_id, trato, modo, respuesta_auto, nota, fecha_actualizacion)
SELECT c.tenant_id, s.id, c.id, c.trato, c.modo, c.respuesta_auto, NULLIF(c.nota, ''), coalesce(c.fecha_actualizacion, now())
FROM public.contacts c
JOIN public.sucursales s ON s.tenant_id = c.tenant_id
WHERE c.trato <> 'normal' OR c.modo IS NOT NULL OR c.respuesta_auto IS NOT NULL OR coalesce(c.nota, '') <> ''
ON CONFLICT (contact_id, branch_id) DO NOTHING;

COMMENT ON COLUMN public.contacts.trato IS 'OBSOLETA desde 20260911120000: el trato es por tienda, en contactos_sucursal. No usar.';
COMMENT ON COLUMN public.contacts.modo IS 'OBSOLETA desde 20260911120000: va en contactos_sucursal. No usar.';
COMMENT ON COLUMN public.contacts.respuesta_auto IS 'OBSOLETA desde 20260911120000: va en contactos_sucursal. No usar.';
COMMENT ON COLUMN public.contacts.nota IS 'OBSOLETA desde 20260911120000: la nota es por tienda, en contactos_sucursal. No usar.';

-- ---------------------------------------------------------------------------
-- 3. Datos de clientes: solo desde las tiendas permitidas
-- ---------------------------------------------------------------------------
-- Conversaciones
DROP POLICY IF EXISTS conversations_tenant ON public.conversations;
CREATE POLICY conversations_sucursal ON public.conversations
  FOR ALL
  USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())))
  WITH CHECK ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())));

-- Mensajes (no tienen tienda propia: la de su conversación)
DROP POLICY IF EXISTS messages_tenant ON public.messages;
CREATE POLICY messages_sucursal ON public.messages
  FOR ALL
  USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND conversation_id IN (
    SELECT c.id FROM public.conversations c WHERE c.branch_id IN (SELECT auth_sucursales())
  )))
  WITH CHECK ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND conversation_id IN (
    SELECT c.id FROM public.conversations c WHERE c.branch_id IN (SELECT auth_sucursales())
  )));

-- Notas internas
DROP POLICY IF EXISTS "Ver notas internas del tenant" ON public.internal_notes;
DROP POLICY IF EXISTS "Insertar notas internas en el tenant" ON public.internal_notes;
DROP POLICY IF EXISTS "Actualizar notas internas del tenant" ON public.internal_notes;
DROP POLICY IF EXISTS "Eliminar notas internas del tenant" ON public.internal_notes;
CREATE POLICY internal_notes_sucursal ON public.internal_notes
  FOR ALL
  USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND conversation_id IN (
    SELECT c.id FROM public.conversations c WHERE c.branch_id IN (SELECT auth_sucursales())
  )))
  WITH CHECK ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND conversation_id IN (
    SELECT c.id FROM public.conversations c WHERE c.branch_id IN (SELECT auth_sucursales())
  )));

-- Etiquetas de cada conversación
DROP POLICY IF EXISTS convtags_tenant ON public.conversation_tags;
CREATE POLICY convtags_sucursal ON public.conversation_tags
  FOR ALL
  USING ((SELECT is_super_admin()) OR conversation_id IN (
    SELECT c.id FROM public.conversations c
    WHERE c.tenant_id = (SELECT auth_tenant_id()) AND c.branch_id IN (SELECT auth_sucursales())
  ))
  WITH CHECK ((SELECT is_super_admin()) OR conversation_id IN (
    SELECT c.id FROM public.conversations c
    WHERE c.tenant_id = (SELECT auth_tenant_id()) AND c.branch_id IN (SELECT auth_sucursales())
  ));

-- Notas de los casos: las de los casos que el usuario puede ver (la tabla de
-- casos ya filtra por tienda y por el permiso de Casos)
DROP POLICY IF EXISTS notes_select ON public.case_notes;
DROP POLICY IF EXISTS notes_insert ON public.case_notes;
CREATE POLICY case_notes_ver ON public.case_notes
  FOR SELECT
  USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND case_id IN (SELECT k.id FROM public.cases k)));
CREATE POLICY case_notes_crear ON public.case_notes
  FOR INSERT
  WITH CHECK ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND case_id IN (SELECT k.id FROM public.cases k)));

-- Contactos: cada uno ve los que han escrito a sus tiendas o tienen ficha en
-- ellas. El propietario o administrador los ve todos.
DROP POLICY IF EXISTS contacts_tenant ON public.contacts;
CREATE POLICY contacts_ver ON public.contacts
  FOR SELECT
  USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND (
    (SELECT auth_es_admin_org())
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.contact_id = contacts.id)
    OR EXISTS (SELECT 1 FROM public.contactos_sucursal cs WHERE cs.contact_id = contacts.id)
  )));
CREATE POLICY contacts_cambiar ON public.contacts
  FOR UPDATE
  USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND (
    (SELECT auth_es_admin_org())
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.contact_id = contacts.id)
    OR EXISTS (SELECT 1 FROM public.contactos_sucursal cs WHERE cs.contact_id = contacts.id)
  )))
  WITH CHECK ((SELECT is_super_admin()) OR tenant_id = (SELECT auth_tenant_id()));
CREATE POLICY contacts_crear ON public.contacts
  FOR INSERT
  WITH CHECK ((SELECT is_super_admin()) OR tenant_id = (SELECT auth_tenant_id()));
CREATE POLICY contacts_borrar ON public.contacts
  FOR DELETE
  USING ((SELECT is_super_admin()) OR (tenant_id = (SELECT auth_tenant_id()) AND (SELECT auth_es_admin_org())));

-- ---------------------------------------------------------------------------
-- 4. Tiendas asignadas: se pueden consultar, pero solo las cambia el
--    propietario o un administrador (antes cualquiera podía asignarse otra)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS user_branches_access ON public.user_branches;
CREATE POLICY user_branches_ver ON public.user_branches
  FOR SELECT
  USING ((SELECT is_super_admin()) OR user_id = (SELECT auth.uid()) OR branch_id IN (
    SELECT s.id FROM public.sucursales s WHERE s.tenant_id = (SELECT auth_tenant_id())
  ));
CREATE POLICY user_branches_crear ON public.user_branches
  FOR INSERT
  WITH CHECK ((SELECT is_super_admin()) OR ((SELECT auth_es_admin_org()) AND branch_id IN (
    SELECT s.id FROM public.sucursales s WHERE s.tenant_id = (SELECT auth_tenant_id())
  )));
CREATE POLICY user_branches_cambiar ON public.user_branches
  FOR UPDATE
  USING ((SELECT is_super_admin()) OR ((SELECT auth_es_admin_org()) AND branch_id IN (
    SELECT s.id FROM public.sucursales s WHERE s.tenant_id = (SELECT auth_tenant_id())
  )))
  WITH CHECK ((SELECT is_super_admin()) OR ((SELECT auth_es_admin_org()) AND branch_id IN (
    SELECT s.id FROM public.sucursales s WHERE s.tenant_id = (SELECT auth_tenant_id())
  )));
CREATE POLICY user_branches_quitar ON public.user_branches
  FOR DELETE
  USING ((SELECT is_super_admin()) OR ((SELECT auth_es_admin_org()) AND branch_id IN (
    SELECT s.id FROM public.sucursales s WHERE s.tenant_id = (SELECT auth_tenant_id())
  )));
