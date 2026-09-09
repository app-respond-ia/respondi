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
