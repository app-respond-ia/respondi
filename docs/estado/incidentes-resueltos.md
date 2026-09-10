# Incidentes resueltos — Respondi

Bugs reales que ya ocurrieron en producción, con su causa raíz.
Antes de tocar algo parecido, lee esto — muchos son "familia de bug
repetible" si no se tiene cuidado.

## Permisos / rol legacy desincronizado
Causa raíz repetida varias veces: la columna legacy `rol` en `users`
se queda desincronizada de `roles_personalizados.es_propietario`.
Cualquier función que compruebe permisos con `eq('rol', 'admin')` en
vez de `es_propietario` es candidata a bug, no un patrón válido a
copiar. `auth_has_permission()` ya se reconstruyó desde cero usando
`roles_personalizados` en vez de la tabla obsoleta `user_permissions`
— no revertir a esa tabla vieja.

## `resolveBranchId` — sucursal activa ignorada
Server Actions con alcance de sucursal leían la sucursal inicial del
admin en vez de la cookie del selector de sucursal activa. Afectaba a
9 archivos. Arreglado refactorizando para leer siempre la cookie en
rol admin. Cualquier Server Action nueva con alcance de sucursal debe
usar este mismo patrón desde el principio.

## Bug de impersonación — selector de sucursal
Cuando un super_admin impersonaba una organización, el selector de
sucursal del header mostraba "Sin sucursal" pese a que la
organización sí tenía sucursales. Causa: `dashboard/layout.tsx`
consultaba `user_branches` por el `user.id` real (el super_admin, sin
sucursales propias) en vez de las sucursales de la organización
impersonada — el backend (`getAuthContext`) ya lo resolvía bien, pero
el layout del frontend no. Lección: al impersonar, cualquier consulta
de datos del frontend debe usar el `tenant_id` impersonado, no dar
por hecho que el backend ya lo filtra todo.

## Funciones RPC duplicadas por cambio de firma
`CREATE OR REPLACE FUNCTION` con una firma de parámetros distinta
crea una función NUEVA en Postgres, no reemplaza la vieja — quedaron
dos versiones de `descontar_credito_ia` y `abonar_credito_ia`
conviviendo en producción (la vieja sin `branch_id`/`origen`, la
nueva con ellos). Si cambias los parámetros de un RPC existente, hay
que hacer `DROP FUNCTION` con la firma exacta antes de recrearlo, no
asumir que `CREATE OR REPLACE` sustituye sola.

## Columna desaparecida sin explicación
`message_quotas.branch_id` desapareció de producción pese a haberse
confirmado su creación con éxito antes en la misma sesión (causa
desconocida, posible script de limpieza de organizaciones de
prueba). Lección: no dar por sentado que una columna sigue existiendo
solo porque se creó antes en la sesión — verificar contra el esquema
real antes de depender de ella, sobre todo tras operaciones de
limpieza/borrado.

## Inserts sin capturar → fallos silenciosos
Varias funciones (`crearSucursalConDatos`, `resolverAltaUsuario` en
sus 3 variantes) no capturaban errores de sus propios `.insert()`. Un
fallo real (ej. email ya existente) se colaba en silencio y el
proceso se marcaba como exitoso igualmente, dejando registros a
medias — caso real: un vendedor de prueba quedó con `rol: 'vendedor'`
en `users` pero sin fila en `vendedores`. Todo insert debe ir
envuelto para capturar el error y pasarlo por `registrarError()`,
nunca asumir que si no lanza excepción es que fue bien.

## Caché de Vercel Edge — no todo bug es del código
`respondi.vercel.app` sirvió contenido cacheado (incluyendo 404 para
rutas nunca visitadas) durante horas, con el deployment correcto
activo según la API de GitHub. Ni recompilar, ni commits vacíos, ni
redeploy manual sin build cache lo arreglaron durante la sesión.
Lección: si algo se comporta de forma imposible de explicar por el
código (páginas viejas con `age` creciente, 404 en rutas nuevas),
comprobar cabeceras `x-vercel-cache`/`age`/`x-matched-path` antes de
seguir depurando código que ya está bien.

## Diseño de invitación por enlace mágico — abandonado
Tanto el `inviteUserByEmail`/`generateLink` nativo de Supabase como
una ruta propia con `verifyOtp()` se abandonaron por completo (en
parte por el problema de caché de arriba) a favor de un sistema sin
enlaces especiales: tabla `invitaciones_pendientes` + función
`resolverAltaUsuario()` que busca una invitación pendiente por email
en el momento del login/registro, sin importar por qué puerta entre
la persona. No reintroducir el patrón de enlace con token — ya se
probó y se descartó con motivo.

## Cuenta trial — dos caminos inconsistentes (resuelto)
Existían dos funciones distintas para crear cuenta trial
(`crearCuentaTrial` sin sembrar créditos/plan, `create_trial_account`
con créditos fijos pero sin plan_id). Unificadas en un único RPC
atómico `crear_cuenta_completa()`. Si aparece necesidad de alta de
cuenta en un flujo nuevo, usar siempre este RPC, no crear un tercer
camino paralelo.

## Sin super_admin en producción (resuelto)
Tras una limpieza de datos, no quedó ningún `super_admin` —
`/superadmin` entraba en bucle infinito de redirección al comprobar
permisos contra un array vacío. Lección: cualquier limpieza de datos
de prueba debe verificar explícitamente que sigue existiendo al menos
una cuenta con `es_propietario: true` en `superadmin_roles` antes de
darse por terminada.

## Bug de permisos — propietario con `rol` legacy desincronizado (resuelto)
Un admin/dueño de organización real (`roles_personalizados.es_propietario
= true`) con la columna legacy `users.rol` desincronizada (`'tenant_user'`
en vez de `'admin'`) no podía completar ciertas acciones de gestión en su
propio panel. Reproducido y verificado con datos reales vía Supabase MCP.
Resultó ser **tres bugs independientes**, no uno solo — la sospecha
inicial (RLS de `roles_personalizados` sin fallback a `es_propietario`)
no era la causa real: esa tabla ya tenía una segunda política
(`usuario_ver_roles`) que cubre la lectura para cualquier usuario del
tenant.

Causas reales encontradas:
- `src/app/actions/usuarios.ts` (`desactivarUsuario`/`reactivarUsuario`,
  ya eliminadas): usaban el cliente de sesión sin comprobación de
  permisos propia, dependiendo de la política RLS `users_admin_manage`
  (`auth_rol() = 'admin'`, sin fallback a `es_propietario`). Sustituidas
  por `actualizarUsuario(id, {activo})`, que ya usa `supabaseAdmin` +
  `canManageRole` correctamente.
- `src/app/actions/politicas.ts` (gestión de políticas del RAG): escribía
  en `policy_sources` con el cliente de sesión. La política RLS de esa
  tabla exigía `auth_is_admin()` — función cuyo nombre es engañoso: en
  realidad comprueba `rol = 'super_admin'`, no `'admin'` de tenant. Esto
  bloqueaba a **cualquier** usuario de organización, no solo a
  propietarios desincronizados. Corregido pasando esas Server Actions a
  `supabaseAdmin` + comprobación explícita de permisos, y con una
  migración (`20260910120000_fix_policy_sources_write_policy.sql`) que
  sustituye `auth_is_admin()` por `auth_has_permission()` en la política.
- `src/app/actions/skills-globales.ts` (`toggleSkillCliente`): el
  `upsert` a `skills` no incluía `tenant_id` ni `nombre` (ambas `NOT
  NULL` sin default). Para cualquier combinación branch/skill sin fila
  previa, esto producía una violación de RLS real ("new row violates
  row-level security policy for table skills"), confirmada en los logs
  de Postgres de producción — no el error de `NOT NULL` que cabría
  esperar a priori. Como el interceptor central de `Toast.tsx` pasa
  todo error por `traducirError()`, ese error de política se mostraba
  literalmente como "No tienes permiso para realizar esta acción.",
  aunque la causa no tenía nada que ver con el rol del usuario.

Lección: cuando un error de "permisos" no cuadra con la lógica de
permisos revisada, comprobar los logs reales de Postgres
(`postgres_logs` vía MCP) antes de seguir asumiendo la causa por el
texto del mensaje — el interceptor de Toast puede traducir errores
técnicos no relacionados con RLS a un texto que parece de permisos.

Se hizo auditoría completa de las 23 tablas con `tenant_id NOT NULL`
en el esquema y de los 3 `.upsert()` de todo el repo — el bug de
`skills` era un caso aislado, no un patrón repetido.

## Perfil de sucursal en 500 — `export type` dentro de un `'use server'` (resuelto)
`/dashboard/perfil-sucursal` devolvía 500 en producción con el mensaje
genérico "An error occurred in the Server Components render". No aparecía
nada en `error_logs` pese a tener la Server Action instrumentada de punta
a punta, y las 6 consultas que hace la pantalla daban 200 una a una con
una sesión real. Es decir: el fallo ocurría **antes** de que corriera
ninguna línea del código propio.

Causa: `src/app/actions/horarios.ts` tenía `export type { Franja,
HorarioDia }` en un archivo marcado `'use server'`. Next.js convierte
**todos** los exports de un módulo `'use server'` en referencias de
servidor, y una reexportación de tipos genera código que en tiempo de
ejecución busca un valor `Franja` que no existe (los tipos se borran al
compilar). El módulo entero petaba al evaluarse —`ReferenceError: Franja
is not defined`— y se llevaba por delante a `perfil-sucursal`, que
importa `saveHorarios` de ahí.

Solo se reproduce en build de producción: en `next dev` con Turbopack la
pantalla funciona con normalidad. Regla a respetar: **un archivo
`'use server'` solo puede exportar funciones `async`**. `export interface`
y `export type X = ...` (declaraciones) sí se borran y son seguros; lo
que rompe es la reexportación `export type { ... }`.

Cómo se encontró, por si hace falta repetirlo: se levantó un build de
producción en local, se generó una cookie de sesión real del cliente
(`/auth/v1/admin/generate_link` → `/auth/v1/verify` → cookie en formato
`@supabase/ssr`), se sacó el id de la Server Action del manifiesto de
`.next` y se invocó con `curl` igual que lo hace el navegador. Ahí sí
aparece el stacktrace completo en la consola del servidor. Lección: ante
un 500 de Server Action sin rastro en `error_logs`, reproducir con
`npm run build && npm start` en local antes de seguir instrumentando.

## Funciones internas abiertas al público en la API REST (resuelto)
El linter de Supabase avisaba de que `crear_cuenta_completa` era
ejecutable por los roles `anon` y `authenticated` a través de
`/rest/v1/rpc/`. Confirmado con una llamada real y anónima: la función se
ejecutaba entera y solo fallaba al final por la FK `users.id → auth.users`.
Es decir, cualquiera con una cuenta gratuita (que sí tiene un uuid válido)
podía fabricarse organizaciones con sus créditos de trial en bucle, sin
pasar por el registro. Lo mismo con las tres `check_*` que dispara pg_cron.

Dos cosas que casi salen mal y conviene recordar:

1. **El primer intento no hizo nada.** La migración `20260910180000` hacía
   `REVOKE ... FROM anon, authenticated` y se aplicó sin errores, pero el
   agujero seguía abierto: esos roles nunca tuvieron un permiso directo, lo
   heredaban de `PUBLIC` (Postgres concede EXECUTE a PUBLIC en toda función
   nueva por defecto; el ACL se ve como `=X/postgres`, donde el `=` a la
   izquierda es PUBLIC). Solo se detectó porque se volvió a llamar al
   endpoint después de aplicar, en vez de dar por bueno el "migración
   aplicada". Corregido en `20260910190000` revocando desde `PUBLIC`.

2. **`service_role` también heredaba de PUBLIC.** Un `REVOKE ... FROM
   PUBLIC` a secas habría dejado el alta de cuentas inservible, porque el
   servidor de la app llama a la función con esa clave. Hay que devolverle
   el permiso explícitamente en la misma migración.

No se tocaron `auth_rol`, `auth_is_admin`, `auth_tenant_id`,
`auth_has_permission` ni `is_super_admin`, que el linter marca igual: 56
políticas de RLS las invocan y una política se evalúa con el rol de quien
consulta, así que `authenticated` necesita conservar el EXECUTE o se cae el
acceso a media aplicación. Tampoco `get_resumen_creditos`, que sí se llama
con el cliente de sesión desde `superadmin.ts`.

Verificación final en producción: anónimo → 401/42501; usuario identificado
con sesión real → 403/42501; `service_role` → entra y llega a la lógica de
la función; pg_cron (rol `postgres`, dueño de las funciones) → conserva
acceso.

## `traducirError` destruía los mensajes buenos de la app (resuelto)
Cualquier `showToast(msg, 'error')` pasaba `msg` por `traducirError()`, y esa
función terminaba en un `return` genérico —"Ha ocurrido un error inesperado.
Si persiste, contacta con soporte."— cuando el texto no coincidía con ninguno
de sus patrones (`23505`, `23502`, `42501`...). Como los mensajes que escribe
la app están en español y esos patrones son de Postgres en inglés, **ningún
mensaje propio coincidía nunca**: todos acababan en el genérico.

Repro real: `actualizarRegla` (`src/app/actions/reglas.ts`) bloquea
correctamente editar una regla `es_protegida` con el mensaje "Esta regla es
del sistema y no se puede editar ni desactivar.", pero en `/dashboard/reglas`
el usuario solo veía el genérico.

Al investigarlo apareció que el problema era más ancho que el Toast:
`traducirError` se llamaba igual de mal desde **otros 13 sitios**
(`dashboard/metricas`, `dashboard/page`, `audit-log`, `politicas`,
`vendedor/page`, los formularios de login/registro/recuperación...), muchos
con la forma `traducirError(res.error || 'Error al cargar métricas')`, donde
ese literal perfectamente escrito también acababa convertido en el genérico.
Por eso el arreglo se hizo en `traducirError` y no en `Toast.tsx`.

La causa de fondo es que la función hacía dos trabajos con el mismo código:
traducir un **objeto de error** técnico, y sanear un **texto** que casi
siempre ya era un mensaje humano. Ahora los distingue:
- objeto de error no reconocido → genérico (no se filtran detalles internos);
- texto no reconocido → se devuelve tal cual, salvo que tenga rastros
  técnicos evidentes (`violates`, `constraint`, `PGRST`, `JWT`, `syntax
  error`...), en cuyo caso también cae al genérico.

Verificado con 17 casos: mensajes reales de la app salen intactos, los
errores crudos siguen traduciéndose, y el ruido técnico no reconocido sigue
sin llegar a la pantalla.

Los "manejos de error local" que se añadieron en el commit `75db8e0` para
esquivar el problema en 5 pantallas ya no hacen falta como parche, pero se
dejan: con la función arreglada hacen justo lo correcto.
