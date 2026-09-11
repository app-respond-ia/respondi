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

## Copiar una sucursal perdía y corrompía datos (resuelto)
`crearSucursal` (el modal rápido de `/dashboard/sucursales`, distinto del
asistente `/dashboard/sucursales/nueva`) copia los datos de otra sucursal
campo a campo, y se había quedado atrás respecto al esquema. Se buscaba un
solo fallo —el `.limit(7)` de los horarios— y aparecieron siete:

1. **`business_hours`**: `.limit(7)` daba por hecho "una fila por día", pero
   con varias franjas por día y dos tipos de horario una sucursal puede tener
   hasta 56 filas. Además no copiaba `tipo`, que por defecto vale `'negocio'`:
   las filas del horario de la IA que sobrevivían al recorte se insertaban
   **etiquetadas como horario de negocio**. No era solo pérdida, era
   corrupción. Medido sobre datos reales: de una sucursal con 14 filas (7 de
   negocio + 7 de IA) se copiaban 7, ninguna de la IA.
2. **`onboarding_completado`** no se ponía a `true`. La sucursal nacía con el
   alta "sin terminar" y, en cuanto alguien la elegía como sucursal activa,
   el siguiente inicio de sesión lo mandaba al asistente de onboarding
   (`auth-redirect.ts`). El asistente de sucursal nueva sí lo marcaba.
3. **`business_profiles`**: no copiaba `modo_horario_ia` ni
   `abrir_caso_fuera_horario`, justo los dos ajustes de los tramos A/B/C.
4. **`case_rules`**: no copiaba `es_protegida`, `orden` ni
   `prioridad_default`. Sin `es_protegida`, las reglas del sistema llegaban
   a la sucursal nueva como reglas normales, editables y borrables — se
   perdía el candado.
5. **`message_categories`**: no copiaba `es_protegida` ni `es_fallback` (la
   etiqueta a la que va lo que la IA no sabe clasificar).
6. **`price_list`**: no copiaba `tipo`, `visible_ia` ni `etiquetas`.
   `categoria_id` se deja fuera a propósito: apunta a una categoría de la
   sucursal de origen.
7. **`tipos_novedad`**: no se copiaba en absoluto.

Rastro del bug en producción: la sucursal "m" del tenant
`8f75616e-98ff-4a77-84c1-0ef3204f7792` tiene 7 horarios y 0 de IA, copiada
de una que sí tenía los 14.

Lección de fondo, y el pendiente que queda: **la causa no es ninguno de los
siete fallos, es que hay dos caminos para crear una sucursal.** El asistente
(`crearSucursalConDatos`) hacía todo esto bien; el modal rápido se fue
quedando atrás cada vez que se añadió una columna. Mientras existan los dos,
volverán a desincronizarse.

## Los precios no se copiaban al crear una sucursal (resuelto)
`crearSucursalConDatos` —el asistente de `/dashboard/sucursales/nueva`, el
camino que sí usan los clientes— insertaba en `price_list` una columna
`activo` que no existe: la columna se llama `disponible`. Postgres rechaza la
sentencia entera, así que al crear una sucursal copiando precios **no se
copiaba ninguno**. La sucursal se creaba con normalidad y nada en pantalla
avisaba de que faltaban.

Se encontró leyendo el código por otro motivo, no por un informe de fallo,
así que llevaba ahí desde que se escribió esa función.

Después se barrió **todo** `src/` comparando las claves de cada `.insert()` /
`.update()` contra las columnas reales de las 50 tablas del esquema. Este era
el único caso: los otros tres avisos eran claves dentro de la columna `datos`
de `invitaciones_pendientes`, que es jsonb y admite cualquier contenido. El
script está en el scratchpad de la sesión y merece la pena repetirlo cada vez
que se añadan tablas.

## Fallos mudos al guardar (resuelto)
Tres sitios guardaban en la base de datos sin comprobar siquiera si la
operación había funcionado, así que un fallo no dejaba rastro en ninguna
parte: ni error en pantalla, ni fila en `error_logs`, ni nada.

- `usuarios.ts` (`actualizarUsuario`): borraba las sucursales del usuario y
  las reinsertaba. Si el borrado iba bien y la inserción no, el usuario se
  quedaba **sin ninguna sucursal asignada** en silencio.
- `onboarding.ts` (`getOnboardingState`): al fijar la sucursal activa. Si
  fallaba, el onboarding volvía a empezar de cero en cada recarga sin pista
  de por qué.
- `sucursales.ts` (`vincularPropietariosASucursal`): al vincular a los
  propietarios con la sucursal nueva. Si fallaba, no podían entrar en ella.
  Además usaba `console.error`, que en producción no lo lee nadie.

Aparte, los `catch` de los pasos 0, 2, 4 y 5 del onboarding solo hacían
`console.error` antes de relanzar. El error llegaba a la pantalla, pero no
quedaba registrado en `error_logs`, que es lo único consultable después. Los
pasos 1 y 3 ya lo hacían bien. Ahora los seis registran.

## El motor de IA no podía responder a nadie (resuelto)
Encontrado en la ronda de pruebas de la jerarquía (10-09-2026), antes de
tener clientes reales. Dos fallos en el mismo sitio:

**1. El modelo estaba escrito a fuego.** `generarRespuesta.ts` llamaba a
OpenAI con `model: 'gpt-5.6-luna'` en cuatro sitios, ignorando por completo
la columna `plans.modelo_ia` que se edita por plan desde
`/superadmin/planes`. Dos consecuencias: ese campo del panel no servía para
nada (todos los clientes usaban el mismo modelo, pagaran lo que pagaran) y,
sobre todo, **OpenAI rechazaba la llamada**:

    400 Function tools with reasoning_effort are not supported for
    gpt-5.6-luna in /v1/chat/completions

Como el motor usa herramientas (etiquetar, escalar, consultar horario y
catálogo), la petición fallaba siempre. La IA no podía contestar a nadie.
Ahora lee `plans.modelo_ia` con `plans!plan_id` (organizaciones tiene dos
claves hacia plans y sin especificarla la consulta falla) y cae a
`gpt-4o-mini` si el plan no tiene modelo.

**2. Cada respuesta descontaba 2 créditos en vez de 1.** Se llamaba a
`descontar_cuota_ia` en dos sitios para la misma respuesta: dentro de
`generarRespuesta` ("consumo por agrupacion de mensajes") y otra vez en
`/api/ai/process` ("Mensaje respondido por IA"). Confirmado en
`message_quotas`: dos apuntes seguidos con 0,2 segundos de diferencia. Los
clientes se quedaban sin saldo al doble de velocidad de lo que dice
`docs/arquitectura.md` ("1 mensaje respondido por la IA = 1 crédito"). Se
quita el de `generarRespuesta`; el de `route.ts` es el bueno porque además
guarda la sucursal y el origen del movimiento, y solo corre si la respuesta
salió bien.

Verificado después del arreglo con una conversación real: la IA contesta,
`ai_logs` registra `modelo_ia: gpt-4o` con su coste, y el saldo baja
exactamente 1.

## Ronda de pruebas de la jerarquía de pausa/horario (10-09-2026)
15 escenarios contra el endpoint real `/api/ai/process`, todos correctos:
prioridad de la pausa manual sobre la sucursal apagada, trato del contacto
(derivar y respuesta automática), sucursal apagada vs. automática, los tres
modos de horario de la IA (`mismo_negocio`, `siempre_activa`,
`personalizado`, incluido el caso de `personalizado` sin horario de IA
configurado), mensaje y apertura de caso fuera de horario, y créditos
agotados. Guion en el scratchpad de la sesión; merece la pena repetirlo
cuando se toque la jerarquía.

Y 18 escenarios de `isFueraDeHorario` (función pura, con el reloj
congelado): franjas partidas, límites exactos de apertura y cierre, día
cerrado, sin horario configurado, husos horarios distintos para el mismo
instante y zona horaria inválida. Todos correctos salvo el horario que
cruza medianoche, que se documenta abajo como limitación conocida.

## Limitación conocida: horarios que cruzan la medianoche
Un negocio de noche (un bar de 22:00 a 02:00, una farmacia de guardia, un
soporte 24h por turnos) no puede configurar su horario real:
`validarHorarios` exige que la hora de apertura sea anterior a la de cierre,
así que la pantalla lo rechaza. Si se saltara esa validación, tampoco
funcionaría: `isFueraDeHorario` compara minutos dentro del mismo día y daría
"fuera de horario" las 24 horas.

No es un fallo silencioso —la pantalla avisa— pero sí una limitación real
para un tipo de cliente que entra dentro del público de Respondi. Arreglarlo
supone permitir el cruce de día en la validación y, en `isFueraDeHorario`,
mirar también las franjas del día anterior que se prolongan más allá de
medianoche. Pendiente de decidir.

## Horarios que cruzan la medianoche — resuelto
La limitación descrita más arriba queda resuelta (10-09-2026). Un bar de
22:00 a 02:00, una farmacia de guardia o un soporte por turnos ya pueden
configurar su horario real.

- `validarHorarios` acepta que el cierre sea anterior a la apertura, con dos
  condiciones para que el día siga siendo interpretable: solo una franja
  nocturna por día y siempre la última. Se sigue rechazando apertura igual
  a cierre y las franjas solapadas.
- `isFueraDeHorario` mira ahora también las franjas del **día anterior** que
  se prolongan pasada la medianoche. Es la parte que no salta a la vista: a
  la 01:00 del sábado el negocio está abierto por la franja del viernes,
  aunque el sábado no tenga ninguna franja propia.
- `EditorHorarios` marca la franja con la etiqueta "del día siguiente", para
  que ver "22:00 a 02:00" no parezca una errata.

Verificado con 31 escenarios (reloj congelado): apertura y cierre justos,
cola del día anterior, día sin franja propia que hereda la cola del
anterior, lunes de madrugada cerrado porque el domingo no abre, husos
horarios distintos, y los 7 casos de validación.

## El escalado a un humano nunca creó ningún caso (resuelto)
Encontrado en la ronda de pruebas del motor de IA (10-09-2026). Es el fallo
más grave de los que han salido: la IA le decía al cliente "ahora mismo te
paso con una persona del equipo", **no se creaba ningún caso, no se avisaba a
nadie**, y el cliente se quedaba esperando a alguien que nunca iba a llegar.

Causa: dos campos que se llaman parecido y no son lo mismo.
- `case_rules.tipo_caso` es el motivo de negocio que configura el cliente:
  `derivacion_solicitada`, `documento_no_procesable`, `queja`, `consulta`.
- `cases.tipo` es un enum del sistema con otros valores completamente
  distintos: `normal`, `fallo_llm`, `fallo_entrega`, `blacklist_sugerida`.

El motor pasaba el primero como si fuera el segundo, y Postgres rechazaba la
inserción con `invalid input value for enum tipo_caso`. Los dos catálogos no
comparten **ni un solo valor**, así que **ninguna regla de escalado llegó
nunca a crear un caso**, en ninguna sucursal.

Se salvaban los escalados que NO vienen de una regla (fuera de horario, cuota
agotada, contacto marcado para derivar), porque esos usan el valor por
defecto `'normal'`, que sí es válido. Por eso la ronda de pruebas de la
jerarquía los daba por buenos: el fallo estaba solo en el camino de las
reglas.

Y una segunda mitad que lo hacía invisible: `crearCasoDesdeSistema` se comía
el error con un `console.error` y devolvía `null`, pero quien llamaba no
miraba el resultado y le respondía a la IA "Caso escalado a humano y
respuestas automáticas pausadas". La IA daba por hecho que estaba hecho y se
lo prometía al cliente.

Arreglo:
- Un caso nacido de una regla de negocio se crea como `'normal'`, y el motivo
  concreto va en la descripción con el nombre de la regla delante
  (`[Cliente quiere hablar con un humano] ...`), que es lo que lee la persona
  que lo atiende.
- `crearCasoDesdeSistema` registra el fallo en `error_logs` en vez de
  perderlo por consola.
- Si el caso no se crea, se le dice explícitamente a la IA que NO prometa una
  atención humana que no va a existir.

Verificado: 11 escenarios del motor, todos correctos, con el caso creado y la
IA pausada.

## Ronda de pruebas del motor de IA (10-09-2026)
Primera prueba real del motor con clave de OpenAI. Se monta un negocio
completo de prueba (horario partido, catálogo con etiquetas, políticas con
sus embeddings, etiquetas de conversación, reglas de escalado y novedades del
día), se lanzan preguntas de cliente contra `/api/ai/process` y se comprueba
lo que hace. Guion en el scratchpad de la sesión.

Los 11 escenarios pasan: horario real por día (incluido el día cerrado),
precio exacto del catálogo, búsqueda por característica ("algo vegano"),
políticas por RAG (devoluciones y mascotas), novedades del día tenidas en
cuenta, respuesta en el idioma del cliente, escalado con creación de caso,
etiquetado con una categoría real de la sucursal, y agrupación de varios
mensajes seguidos en una sola respuesta.

## Multimedia: fotos, audios y documentos nunca llegaron a la IA (resuelto)
`messages.media_tipo` guarda el **tipo MIME** que manda n8n (`image/jpeg`,
`audio/ogg`, `application/pdf`...), pero el motor comparaba con las palabras
exactas `'image'` y `'audio'`:

```ts
if (m.media_tipo === 'image')        // nunca cierto: vale 'image/jpeg'
else if (m.media_tipo === 'audio')   // nunca cierto: vale 'audio/ogg'
```

Consecuencias, todas silenciosas:
- Las **fotos** no se enviaban a la IA. El cliente mandaba una imagen y a la
  IA le llegaba un mensaje vacío.
- Los **audios** no se transcribían. Igual: mensaje vacío.
- Los **documentos y vídeos** llegaban también vacíos, así que la IA ni
  siquiera podía saber que había llegado un archivo y derivarlo a una
  persona, que es lo que dicen sus instrucciones.

Es decir: **todo el bloque de multimedia del motor no había funcionado
nunca**. No había salido antes porque en la base de datos no hay ni un solo
mensaje con adjunto: nunca se había probado.

Arreglado comparando por familia MIME (`image/…`, `audio/…`) y añadiendo un
tercer caso para lo que la IA no puede abrir (PDF, Word, vídeo), donde ahora
se le inyecta una nota explícita para que avise al cliente y derive el caso.

De paso, dos mejoras del mismo bloque:
- Una imagen del historial que ya tiene su descripción guardada se manda como
  texto, no como foto. Mirar la misma imagen en cada turno multiplicaba el
  coste sin aportar nada, y contradecía el diseño de `docs/arquitectura.md`
  ("directo a la IA la primera vez; después se cachea la descripción").
- El fallo al transcribir un audio se registra en `error_logs` en vez de
  perderse por consola.

Verificado con ficheros reales subidos al bucket: la IA lee un cartel con
texto y guarda su descripción, transcribe un audio y responde a lo que se
dice en él, y ante un PDF avisa al cliente y crea el caso.

## Los ajustes de idioma no hacían nada (resuelto)
Dos cosas que el cliente configura y que el motor ignoraba por completo:

- **`business_profiles.idioma_base`**: se elige en Perfil de sucursal y en el
  alta de sucursal, se guarda en la base... y `generarRespuesta` nunca lo
  leía. Ni siquiera venía en la consulta de `/api/ai/process`.
- **La skill "Idioma multi"**: aparece en el panel como una capacidad más de
  la IA, pero no había ni una sola referencia a ella en el motor. Apagarla no
  cambiaba nada.

En la práctica la IA siempre respondía en el idioma del cliente, que es lo
que hace la skill activada — así que por casualidad el comportamiento visible
era el correcto mientras nadie tocara nada. Pero eran dos campos muertos.

Ahora: con "Idioma multi" activa se responde en el idioma del cliente y, si
no queda claro en cuál escribe, en el idioma base. Con la skill apagada se
responde siempre en el idioma base. Verificado con las dos configuraciones.

## Ronda del ciclo de vida de una conversación (10-09-2026)
No "¿responde o no responde?", sino qué pasa DESPUÉS de bloquear una
conversación y si el cliente acaba siendo atendido. 13 escenarios contra los
endpoints reales.

Funciona bien (verificado):
- **Fuera de horario**: avisa, bloquea, y cuando llega el horario de apertura
  `/api/cron/revisar-bloqueos` la desbloquea y dispara la respuesta a la
  pregunta que había quedado pendiente.
- **Sucursal apagada** y **sin créditos**: mismo ciclo; al encenderla o al
  recargar créditos se desbloquea sola.
- **Contacto marcado para no atender**: se bloquea y el revisor NO la
  desbloquea, que es lo correcto.
- **Escalado**: crea el caso, pausa la IA, la IA no responde por encima del
  agente mientras está pausada, y al devolverla desde el chat vuelve a
  responder.
- El candado `ia_procesando_desde` evita que el revisor de bloqueos y el cron
  principal procesen la misma conversación a la vez.

Corregido por el camino: al reabrir, la IA **repetía el aviso de "estamos
cerrados"** que seguía en el historial, justo cuando el negocio ya había
abierto. Ahora se le indica que no repita los avisos automáticos.

## Cada mensaje entrante abría un caso (resuelto, 11-09-2026)
`resolve_incoming_message_context` (la función que llama n8n al llegar cada
mensaje) insertaba **siempre** una fila en `cases`, vacía, además de crear el
contacto y la conversación. Consecuencias: la cola de casos se llenaba de
casos vacíos indistinguibles de un escalado real, y como el cierre por
inactividad no cierra conversaciones con caso abierto, **ninguna conversación
se cerraba sola y la IA nunca tenía memoria** de conversaciones anteriores.

La misma función tampoco ponía `fecha_ultimo_mensaje` al crear una
conversación nueva, así que **el primer mensaje de un cliente nuevo no lo
contestaba nunca el cron** (solo lo recoge si esa fecha existe). Las pruebas
anteriores no lo vieron porque creaban la conversación a mano.

Decidido con Jorge: el caso solo cuando hace falta una persona. Migración
`20260911100000`. De paso se unificaron los cuatro caminos de cierre (cada uno
hacía una cosa distinta) en `src/lib/conversaciones/cierre.ts`, y los estados
"terminado/abierto" de un caso en una sola definición
(`src/lib/casos/estados.ts`). Reglas completas en `docs/arquitectura.md`,
sección "Chats, conversaciones y casos".

## La IA y las personas se pisaban (resuelto, 11-09-2026)
Salieron al probar el modelo nuevo con choques entre caminos, no uno a uno:

- **Un segundo mensaje enviado mientras la IA contestaba el primero no se
  contestaba nunca.** El cron solo recogía la conversación si el último
  mensaje era del cliente, y la respuesta de la IA quedaba guardada después.
  Ahora mira si hay mensajes del cliente sin contestar (migración
  `20260911110000`).
- **Un agente podía escribir con la IA activa**, y el cliente recibía las dos
  respuestas. Ahora escribir pausa la IA y da por contestado lo anterior.
- **Si una persona pausaba la IA mientras pensaba, la respuesta salía
  igual.** Ahora se descarta y no se cobra.
- **El cierre de 24 h rompía la promesa de "te contestamos al abrir"**: un
  mensaje del sábado se cerraba el domingo y el lunes no había nada que
  contestar. Esas conversaciones ya no se cierran solas, y la respuesta de la
  IA cuenta como actividad.
- **Reabrir una conversación** fallaba con un error de base de datos si el
  cliente ya tenía otra abierta, y si arrastraba un bloqueo viejo la IA se
  quedaba muda para siempre.
- **Reabrir un caso** lo dejaba colgado de una conversación cerrada (el agente
  no tenía dónde escribir) o fallaba si la conversación actual ya tenía caso.
- **Soltar un caso** le quitaba el agente pero lo dejaba "atendiendo", un
  estado sin nadie detrás. **Tomar un caso resuelto** lo dejaba "atendiendo"
  sobre una conversación cerrada.
- En Chats, si cerrar o reabrir fallaba, la ventana no decía nada.
- **Conversaciones que no se cerraban nunca**: las que creó la versión
  anterior de la entrada de mensajes no tienen fecha de último mensaje, y el
  cierre de 24 h no las veía. Ahora, si falta, cuenta desde el inicio. Al
  aplicarlo se cerraron 3 de demostración en "Mi organización" (del 08-09);
  otras 2 siguen abiertas porque tienen un caso pendiente, que es lo correcto.

Verificado también en producción con el cron de verdad: el primer mensaje de
un cliente nuevo se contesta una sola vez (~51 s) y sin caso; pedir una
persona abre un caso y pausa la IA; un agente que escribe pausa la IA; y un
mensaje que se quedó detrás de la respuesta de la IA lo recoge el cron y lo
contesta (~21 s).

Verificado con `contrato-conversaciones` (36 comprobaciones: los mensajes
entran por la misma puerta que un WhatsApp real y las acciones de las
personas se hacen con la sesión de un usuario real).

Lección sobre las pruebas: el cron de producción comparte base de datos con
las pruebas locales y cogía las mismas conversaciones de prueba, contestando
a la vez con el código viejo. Las pruebas ahora ponen el candado
`ia_procesando_desde` igual que el cron. Y la limpieza fallaba en silencio
(los registros de `ai_logs` apuntan a los mensajes y no dejan borrarlos), así
que cada ejecución arrancaba con restos de la anterior; ahora se borran antes
y se comprueba que no queda nada.

## Las sucursales se veían entre sí y el selector no funcionaba (resuelto, 11-09-2026)
Salió al decidir que cada sucursal ve solo lo suyo y comprobar si la app
ya lo cumplía:
- **El selector de sucursal no hacía nada desde el 27-07-2026.** Guardaba la
  elegida en la cookie `respondi_active_branch` y la app la leía de
  `active_branch_id`, que nadie escribía: todos trabajaban siempre en su
  sucursal por defecto.
- **Nadie comprobaba que la sucursal elegida fuera del usuario.** Al arreglar
  el selector habría bastado con cambiar la cookie para entrar en otra.
- **Conversaciones y Casos enseñaban las de todas las sucursales** (Chats sí
  filtraba), y el detalle, las notas y el historial de cambios solo
  comprobaban la organización.
- **La memoria de la IA cruzaba sucursales**: en una podía "recordar" lo que
  el cliente había hablado con otra.
- **En la base de datos solo había separación por organización**, así que
  cualquier usuario podía leer por la API los datos de todas las sucursales.
  Y la lista de sucursales asignadas (`user_branches`) la podía cambiar
  cualquiera: un agente podía asignarse otra sucursal.
- **La lista de agentes para asignar casos** miraba la sucursal por defecto
  de cada usuario, no las que tiene asignadas, y se podía dar un caso a
  alguien de otra sucursal.
- Por el camino: "restaurar a normal" un contacto le borraba la nota y ponía
  "Restaurado a normal", que es lo que luego leía la IA; y la métrica "casos
  de la IA / manuales" dejó de distinguir nada cuando la entrada de mensajes
  dejó de abrir casos vacíos.

Migración `20260911120000`. Verificado con `probar-tiendas` (26
comprobaciones con una segunda sucursal y un agente temporales, por la app y
atacando la base de datos directamente con la sesión del agente) y con todas
las baterías anteriores.

Lección sobre las pruebas: un usuario creado a mano sin
`invitacion_aceptada` es desviado por el middleware a "aceptar invitación" y
la app le devuelve respuestas vacías. Varias comprobaciones "pasaron" así sin
probar nada; ahora cada una exige su mensaje de error concreto y la prueba
empieza comprobando que la app reconoce las dos sesiones.

## La pantalla de Métricas nunca funcionó (resuelto)
`src/app/actions/metricas.ts` estaba escrito contra un esquema que no existe.
Las seis consultas del archivo pedían columnas inventadas:

- `conversations.status` / `created_at` / `updated_at` / `channel_id` y un
  embed `channels(tipo)` sin relación → los nombres reales son `estado`,
  `fecha_inicio`, `fecha_cierre` y `canal`.
- `messages.role` / `created_at` / `branch_id` → son `remitente`, `timestamp`,
  y `messages` **no tiene** `branch_id`: hay que ir por las conversaciones.
- `cases.status` / `created_at` / `updated_at` / `assigned_to` / `source` →
  son `estatus`, `fecha_apertura`, `fecha_cierre`, `agente_id`, y `source` no
  existe.
- `contacts.branch_id` / `channel_id` → `contacts` es por organización, no por
  sucursal, y el canal es una columna suya.

Todas fallaban, y como el error se descartaba (`const { data } = await ...`
sin mirar `error`), la pantalla enseñaba **ceros en todo** como si fueran
datos reales. Es la misma forma de fallar que el `activo` de `price_list`:
columna equivocada, error silencioso, dato falso en pantalla.

Reescrito contra el esquema real y verificado con una sesión de cliente: la
acción devuelve ahora conteos de verdad. La primera consulta comprueba el
error y corta, para que no pueda volver a pintar ceros en silencio.

Se amplió el barrido automático de columnas inexistentes a los `.select()`
(antes solo miraba `.insert()`/`.update()`). Tras el arreglo: cero hallazgos
en todo `src/`. El guion está en el scratchpad de la sesión y conviene
repetirlo cuando se toque el esquema.

Nota: la métrica "casos escalados por IA vs manuales" no tiene ninguna
columna que la sustente —no existe un campo de origen del caso—, así que de
momento se distingue por si el caso tiene descripción (los crea el sistema)
o no (los abre la entrada de mensajes). Si esa métrica importa, hace falta
una columna `origen` de verdad.
