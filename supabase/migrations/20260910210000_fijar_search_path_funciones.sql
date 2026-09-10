-- Fija el `search_path` de las funciones que no lo tenían.
--
-- El linter de Supabase lo marca como riesgo de seguridad: sin `search_path`
-- fijo, la función resuelve los nombres de tabla según el search_path de quien
-- la llama. Alguien que pueda crear objetos en un esquema propio podría
-- colocar ahí una tabla con el mismo nombre y hacer que la función trabaje
-- sobre la suya. Es especialmente grave en las `SECURITY DEFINER`, que se
-- ejecutan con los permisos de su dueño.
--
-- Solo cambia cómo se resuelven los nombres, no el cuerpo de las funciones.
-- Se incluye `public` (donde vive todo, incluida la extensión `vector` que usa
-- match_fragmentos_politicas) y `pg_temp` al final, que es lo recomendado.

ALTER FUNCTION public.auth_rol() SET search_path = public, pg_temp;
ALTER FUNCTION public.auth_is_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.auth_tenant_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.auth_has_permission(uuid, seccion_permiso, nivel_permiso) SET search_path = public, pg_temp;

ALTER FUNCTION public.check_casos_estancados() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_clientes_por_vencer_y_creditos() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_organizaciones_por_vencer() SET search_path = public, pg_temp;

ALTER FUNCTION public.abonar_credito_ia(uuid, integer, origen_movimiento, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_organizaciones_con_stats() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_resumen_creditos() SET search_path = public, pg_temp;
ALTER FUNCTION public.match_fragmentos_politicas(vector, uuid, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
