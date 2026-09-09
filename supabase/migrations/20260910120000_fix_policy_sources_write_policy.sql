-- Migration: Corregir política de escritura de policy_sources
--
-- La política "Escritura policy_sources admin" exigía auth_is_admin(),
-- que en realidad comprueba rol = 'super_admin' (nombre engañoso), no
-- rol = 'admin' de tenant. Esto bloqueaba a CUALQUIER usuario de
-- organización (incluidos propietarios reales) para crear/editar/borrar
-- políticas del RAG — solo un super_admin de plataforma podía escribir.
--
-- Se sustituye por auth_has_permission(), que ya contempla
-- rol IN ('super_admin','admin'), es_propietario=true, y el permiso
-- explícito de sección — mismo criterio que ya usa el código de la app
-- (src/app/actions/politicas.ts) para la sección 'perfil'.

ALTER POLICY "Escritura policy_sources admin" ON "public"."policy_sources"
USING (
  is_super_admin()
  OR (
    branch_id IN (SELECT sucursales.id FROM sucursales WHERE sucursales.tenant_id = auth_tenant_id())
    AND auth_has_permission(branch_id, 'perfil'::seccion_permiso, 'escritura'::nivel_permiso)
  )
)
WITH CHECK (
  is_super_admin()
  OR (
    branch_id IN (SELECT sucursales.id FROM sucursales WHERE sucursales.tenant_id = auth_tenant_id())
    AND auth_has_permission(branch_id, 'perfil'::seccion_permiso, 'escritura'::nivel_permiso)
  )
);
