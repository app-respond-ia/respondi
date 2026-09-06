-- Migration: Corregir asimetría en policy cases_write

ALTER POLICY "cases_write" ON "public"."cases"
WITH CHECK (
  is_super_admin() 
  OR (
    tenant_id = auth_tenant_id() 
    AND (
      auth_rol() = 'admin'::rol_usuario 
      OR auth_has_permission(branch_id, 'casos'::seccion_permiso, 'escritura'::nivel_permiso)
    )
  )
);
