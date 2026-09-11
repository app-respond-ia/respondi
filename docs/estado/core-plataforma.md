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
para tipo `vendedor`. Pendiente verificar `invitarUsuario`
(`usuario_organizacion`) de principio a fin.
