-- Cierra al público funciones que solo debe llamar el servidor.
--
-- Supabase publica automáticamente cada función del esquema `public` como
-- una URL (`/rest/v1/rpc/<nombre>`), y por defecto los roles `anon` (visita
-- sin identificar) y `authenticated` (cualquiera con cuenta) pueden
-- ejecutarlas. Para estas cuatro eso no tiene sentido:
--
--  * crear_cuenta_completa: crea organización + sucursal + rol de
--    propietario + usuario + plan trial con sus créditos. Cualquiera con
--    una cuenta gratuita podía llamarla en bucle y generar organizaciones
--    con créditos de IA (que se pagan) sin pasar por el registro, o pasarle
--    el id de otra persona. La app la llama desde el servidor con
--    `supabaseAdmin` (service role), que se salta los GRANT, así que
--    revocarla no afecta a ningún flujo real: verificadas las 3 llamadas
--    (src/app/actions/auth.ts y src/lib/auth-redirect.ts x2).
--
--  * check_*: las disparan los cron jobs de pg_cron, que corren como
--    superusuario. Nadie más tiene por qué invocarlas.
--
-- NO se tocan auth_rol / auth_is_admin / auth_tenant_id /
-- auth_has_permission / is_super_admin: 56 políticas de RLS las llaman, y
-- una política se evalúa con el rol de quien consulta, así que
-- `authenticated` necesita conservar el EXECUTE o se cae el acceso a media
-- aplicación.

REVOKE EXECUTE ON FUNCTION public.crear_cuenta_completa(uuid, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_casos_estancados() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_clientes_por_vencer_y_creditos() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_organizaciones_por_vencer() FROM anon, authenticated;
