# Estado — Core plataforma (Respondi)

Qué existe ya y cómo está hecho, en la parte de paneles/gestión
general. No repetir trabajo que ya está aquí; si algo de esto falla,
mirar primero `docs/estado/incidentes-resueltos.md`.

## Paneles completados
- **Superadmin**: 5 pantallas — KPIs, listado de comercios, CRUD de
  vendedores, edición de planes, logs de errores. Notificaciones en
  tiempo real vía Supabase Realtime (con fix de `setAuth()`), sistema
  completo de tickets de soporte, gestión de planes, impersonación de
  organizaciones, analíticas con Recharts.
- **Vendedor**: completo, con las mismas notificaciones en tiempo
  real. Acciones separadas en `src/app/actions/vendedor.ts`.
- **Agente**: inbox "Mis casos", detalle de caso con indicadores de
  SLA, caja de respuesta.

## Casos / Conversaciones / Chats
Rediseñadas: **Chats es la única superficie desde la que se envían
mensajes**; Casos y Conversaciones son de solo lectura, con botón
"Abrir en Chats" para actuar. Panel de contexto compartido en Chats:
info del cliente, tags, gestión de caso, toggle de IA, notas, log de
actividad.

Desde el 11-09-2026: Chats tiene una fila por persona y se actualiza en
directo (un chat nuevo aparece sin recargar). El detalle de Conversaciones
es el **historial del cliente**: todas sus conversaciones con la sucursal
en un hilo, con índice, casos, etiquetas, resúmenes y notas. Las notas
internas se ven en todas las conversaciones de la persona.

## Escalado de casos
`case_rules` con reordenamiento drag-and-drop vía `@dnd-kit`.

## Roles y permisos
Jerarquía completa: tabla `roles_personalizados`, `nivel` 1-5,
`es_propietario`, función `canManageRole`. Ver
`docs/arquitectura.md` (sección Permisos) y
`docs/estado/incidentes-resueltos.md` para el problema conocido de
desincronización con la columna legacy `rol`.

## Auditoría
`registrarAuditoria()` en todas las acciones de gestión. Pantalla de
Audit Log con exportación CSV vía `supabaseAdmin`.

## Notas internas y novedades
Sistema de notas internas: se escriben en una conversación y se ven en
todas las de esa persona en la sucursal. Novedades con tabla
dinámica `tipos_novedad` (por sucursal), selector de icono, safelist
de Tailwind para los colores dinámicos.

## Sucursales
Pantalla con expansión de timezone, función de copiar configuración
entre sucursales, y los módulos nuevos (país — ver abajo).

## Contactos
Renombrada desde "Blacklist". Sistema de tres estados de `trato`
(campo `contacts.trato`).

## Lista de precios
Migrada de `xlsx` a `exceljs`, con importación CSV vía `papaparse`.

## Onboarding
6 pasos, incluyendo Paso 0 (perfil + subida de avatar al bucket
`avatars`). `ErrorModal` estandarizado en todos los pasos.

## Recuperación de contraseña
Flujo construido (verificación pendiente con cuenta de email — ver
`docs/estado/pendientes.md`).

## Móvil
Fixes de layout usando unidades `dvh`.

## Campo país de sucursal
Nueva columna `sucursales.pais` (código tipo 'ES'/'MX'), capturable
en los tres formularios de sucursal (creación rápida, creación con
datos, edición de perfil). Lista de 15 países extraída a
`src/lib/paises.ts` (código, nombre, bandera, prefijo) para no
duplicarla.

## Componente MultiSelectBuscador
`src/components/ui/MultiSelectBuscador.tsx` — multi-select con
buscador y chips, patrón "click fuera cierra" vía `useRef`. Usado hoy
en los filtros de `/superadmin/creditos`; reutilizar en vez de crear
un multi-select nuevo.

## Emails transaccionales
SMTP personalizado vía Resend (host `smtp.resend.com`, puerto 465,
username `resend`) en vez del envío nativo de Supabase Auth.
Remitente de pruebas `onboarding@resend.dev` — solo entrega al email
de la cuenta de Resend hasta verificar dominio propio. Ver
`docs/estado/pendientes.md` para lo de dominio propio.

## Sistema de invitaciones
Sin enlaces mágicos con token (diseño abandonado — ver
`docs/estado/incidentes-resueltos.md`). Tabla `invitaciones_pendientes`
+ función `resolverAltaUsuario()`, enganchada tanto en el camino de
Google OAuth como en el de email+contraseña. Verificado end-to-end
para tipo `vendedor`. `invitarUsuario` verificado de punta a punta el
11-09-2026 y el reenvío arreglado el 12-09-2026 (usaba el sistema viejo de
Supabase): `probar-invitacion`, 9 comprobaciones con navegador real
(`usuario_organizacion`) de principio a fin.

## Asistente de IA del panel (14-09-2026)
Decidido con Jorge: el chat de Ayuda y soporte deja de ser solo soporte y
pasa a **hacer cosas**. El cliente pide lo que quiere en su idioma («créame
una etiqueta de devoluciones», «los lunes abrimos de 9 a 14 y de 16 a 20»,
«sube el corte de pelo a 15 euros») y el asistente lo prepara, lo enseña en
una tarjeta y lo ejecuta **solo cuando el cliente confirma**.

Dónde: `/dashboard/soporte`, pestaña «Asistente». El ticket hacia nuestro
equipo sigue en la otra pestaña, para lo que el asistente no puede resolver.

Cómo está montado:
- `src/lib/asistente/herramientas.ts` — 25 herramientas. Cada una llama a la
  **misma acción del panel** que usa la pantalla (`crearEtiqueta`,
  `saveHorarios`, `guardarAjustesAgenda`, `invitarUsuario`…). Por eso hereda
  gratis los permisos, las validaciones y la auditoría: el asistente no
  puede hacer nada que el usuario no pudiera hacer a mano. Aquí no se
  escribe en la base de datos directamente.
  - Mirar (9): etiquetas, reglas, precios, horarios, agenda, automatizaciones,
    usuarios, canales (sin claves) y ficha del negocio.
  - Cambiar (16): crear/cambiar/borrar etiquetas, reglas y artículos de la
    lista de precios; horarios; ficha del negocio; encender y apagar
    automatizaciones; ajustes y recursos de la agenda; invitar usuarios y
    cambiar su rol o su acceso.
- `src/lib/asistente/asistente.ts` — el motor. Mirar se ejecuta al momento;
  cambiar **nunca**: devuelve una propuesta. Las instrucciones le prohíben
  decir «ya está hecho».
- `src/app/actions/asistente.ts` — preguntar y confirmar, separados a
  propósito. Los argumentos de la propuesta se guardan en el servidor
  (`asistente_acciones`), no viajan por el navegador: nadie puede cambiarlos
  entre la propuesta y el sí. Al confirmar se vuelven a comprobar los
  permisos (pueden haber cambiado) y se descarta si tiene más de una hora.
- Borrar algo va marcado como peligroso: botón rojo, modal de confirmación y
  la consecuencia escrita («las conversaciones que la tengan la perderán»).
- Migración `20260914100000_asistente.sql`: `asistente_conversaciones`,
  `asistente_mensajes`, `asistente_acciones` (cada uno ve solo las suyas) y
  `audit_log.por_asistente`.

En el registro de cambios se ve **la IA y el usuario** (lo pidió Jorge así):
`por_asistente` marca que lo ejecutó el asistente y `user_id` sigue siendo la
persona que lo pidió. La pantalla lo enseña como el nombre de la persona con
una etiqueta «Asistente de IA» debajo, y sale también en el CSV exportado.

Lo que NO hace: claves de canales, planes y cobros, borrar la organización, y
leer o escribir conversaciones con clientes finales (para eso está Chats).

Créditos: el asistente **no gasta los créditos de IA del cliente**. Lleva su
propio modelo (`ASISTENTE_MODELO_IA`, por defecto `gpt-4o-mini`). El motivo:
si pedir ayuda gastara créditos, usar Respondi saldría caro justo cuando el
cliente está atascado.

Probado con un OpenAI simulado (`openai-simulado.mjs`, el SDK respeta
`OPENAI_BASE_URL`): `probar-asistente.mjs`, 44 comprobaciones, 0 fallos.
Cubre que mirar lee datos de verdad, que cambiar no toca nada antes de
confirmar, que al confirmar se ejecuta y queda bien en la auditoría, que
confirmar dos veces no duplica, descartar, borrar con aviso, fallos con
motivo claro, varias propuestas a la vez, caducidad, propuestas inventadas y
que el saldo de créditos no se mueve. Y una pasada por las demás familias de
herramientas: lista de precios (crear, cambiar precio y quitar), horarios
(la semana entera, y que se para si no llegan los siete días),
automatizaciones (encender por nombre, y que una de tienda sin tienda
conectada se niega diciendo por qué), agenda (añadir y quitar una persona) e
invitaciones (con un rol que no existe no se invita a nadie).

### Verificado en producción (14-09-2026, commit `524699f`)
Las pruebas locales van contra un OpenAI simulado, así que en producción se
comprobó lo único que aquellas no pueden: que el **modelo de verdad**
entiende las herramientas y se porta como toca (`prod-asistente.mjs`, 9 de 9).
Preguntándole «¿cuántas etiquetas tengo?» contestó «Tienes 1 etiqueta
configurada», o sea que llamó a la herramienta y leyó los datos reales. Al
pedirle crear una etiqueta contestó «He preparado la etiqueta … Confírmala
cuando quieras», **sin** decir que estaba hecha y **sin** crearla. Al
confirmar se creó y quedó en el registro marcada como hecha por la IA con su
usuario. El saldo de créditos no se movió.

Una cosa que pilló la segunda pasada de pruebas: `invitar_usuario` daba acceso a todas
las sucursales y además leía mal la respuesta de `getSucursales` (devuelve
`{ sucursales: [...] }`, no una lista), así que habría fallado siempre. Ahora
invita solo a la sucursal en la que se está trabajando, que además es lo
prudente: el resto se añade a mano en Usuarios.
