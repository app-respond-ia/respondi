-- Agenda (12-09-2026), tercera parte: la lista de espera. Solo añade.
--
-- Cuando alguien quiere un día en el que no hay hueco, se apunta aquí. Si se
-- cancela una cita de ese día (y de ese servicio, si lo dijo), la
-- automatización "Hueco liberado" avisa por orden de llegada.
CREATE TABLE IF NOT EXISTS public.agenda_espera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.sucursales (id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts (id) ON DELETE CASCADE,
  servicio_id uuid REFERENCES public.price_list (id) ON DELETE SET NULL,
  servicio_nombre text,
  -- Día que quería (en la zona horaria de la sucursal) y en qué parte del día
  fecha date NOT NULL,
  franja text NOT NULL DEFAULT 'cualquiera' CHECK (franja IN ('manana', 'tarde', 'cualquiera')),
  personas int NOT NULL DEFAULT 1 CHECK (personas >= 1),
  -- Cuándo se le avisó de un hueco (se avisa una vez y se da por atendido)
  avisado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, contact_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_agenda_espera_branch_fecha ON public.agenda_espera (branch_id, fecha) WHERE avisado_en IS NULL;

ALTER TABLE public.agenda_espera ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agenda_espera_ver ON public.agenda_espera;
CREATE POLICY agenda_espera_ver ON public.agenda_espera FOR SELECT USING (
  (SELECT is_super_admin())
  OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales()))
);
DROP POLICY IF EXISTS agenda_espera_cambiar ON public.agenda_espera;
CREATE POLICY agenda_espera_cambiar ON public.agenda_espera FOR ALL USING (
  (SELECT is_super_admin())
  OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())
      AND auth_puede(branch_id, 'agenda', 'escritura'))
) WITH CHECK (
  (SELECT is_super_admin())
  OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())
      AND auth_puede(branch_id, 'agenda', 'escritura'))
);
