-- Corrige la migración 20260910180000, que no surtió efecto.
--
-- Aquella hacía `REVOKE ... FROM anon, authenticated`, pero esos roles nunca
-- habían recibido un permiso directo: lo heredaban de `PUBLIC`. Postgres
-- concede EXECUTE a PUBLIC en toda función nueva por defecto, así que el
-- ACL quedaba en `=X/postgres` (el `=` a la izquierda significa "PUBLIC") y
-- la llamada anónima seguía entrando. Verificado con una llamada real al
-- endpoint antes y después: idéntica respuesta.
--
-- Aquí se revoca donde de verdad está el permiso. Ojo con el efecto
-- colateral: `service_role` (la clave con la que el servidor de la app llama
-- a la función) TAMBIÉN lo heredaba de PUBLIC, así que hay que concedérselo
-- de forma explícita o se rompe el alta de cuentas.
--
-- Las `check_*` no necesitan GRANT: las dispara pg_cron como `postgres`,
-- que es la dueña de las funciones y siempre puede ejecutarlas (verificado
-- en `cron.job.username`).

REVOKE EXECUTE ON FUNCTION public.crear_cuenta_completa(uuid, text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crear_cuenta_completa(uuid, text, text, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_casos_estancados() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_clientes_por_vencer_y_creditos() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_organizaciones_por_vencer() FROM PUBLIC;
