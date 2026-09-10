# Convenciones de código y UI/UX — Respondi

Patrones a seguir SIEMPRE, no sugerencias. Si una tarea no encaja con
ninguno de estos patrones, pregunta antes de inventar uno nuevo.

## Confirmaciones
Nunca `window.confirm()`. Usa siempre el componente `ConfirmModal`
propio.

## Notificaciones
Nunca banners estáticos. Usa `ToastContext` (definido en el layout) —
aparecen arriba a la derecha, 4 segundos.

## Fechas
`date-fns` NO está instalado y no debe instalarse ni usarse. Usa
siempre los métodos nativos: `toLocaleDateString()`, `toLocaleString()`.

## Acceso a Supabase
- Cliente normal por defecto.
- `supabaseAdmin` SOLO cuando el cliente normal esté bloqueado por
  RLS de forma confirmada (no "por si acaso") — ejemplo real: RLS de
  `sucursales` bloquea a super_admin con el cliente normal salvo
  bypass explícito.

## Auditoría y errores (obligatorio en toda acción de gestión)
- Toda acción de gestión (crear, editar, borrar, cambiar estado)
  llama a `registrarAuditoria()`.
- Todo error no controlado en una Server Action se captura y pasa por
  `registrarError()` (`src/lib/errores.ts`) — nunca dejar un
  `.insert()`/`.update()` sin capturar. Patrón real de bug ya visto:
  fallos silenciosos que dejaban registros a medias sin que nadie se
  enterara (ver `docs/estado/incidentes-resueltos.md`).

## Server Actions (`'use server'`)
Un archivo con `'use server'` arriba **solo puede exportar funciones
`async`**. Next convierte todos sus exports en referencias de servidor, así
que una reexportación de tipos (`export type { X }`) genera código que en
tiempo de ejecución busca un valor que no existe y revienta el módulo
entero, llevándose por delante cualquier pantalla que lo importe. Solo se
nota en build de producción, no en `next dev`. Los tipos van en `src/lib/`
y se importan desde ahí. `export interface X {}` y `export type X = ...`
(declaraciones, no reexportaciones) sí son seguros. Ver el incidente de
`perfil-sucursal` en `docs/estado/incidentes-resueltos.md`.

## Sistemas de filtros
Patrón consistente en toda la app: búsqueda + pills de estado siempre
visibles; filtros secundarios ocultos detrás de un botón
"Filtros (N)".

## Permisos
- Fuente de verdad: `roles_personalizados` (`nivel` 1-5,
  `es_propietario`), consultado vía `auth_has_permission()`.
- NUNCA uses la columna legacy `rol` de `users` para decidir permisos
  — es una fuente histórica de bugs por desincronización con
  `es_propietario`. Si una función ya usa `eq('rol', 'admin')` en vez
  de `es_propietario`, es candidata a bug, no un patrón a copiar.

## Branch/sucursal activa
Server Actions con alcance de sucursal deben resolver la sucursal
activa leyendo la cookie del selector (vía `resolveBranchId`), no
asumir la sucursal inicial del usuario — bug real ya corregido que
afectaba a 9 archivos.

## Componentes reutilizables ya existentes (usar antes de crear nuevos)
- `MultiSelectBuscador` — multi-select con buscador y chips
- `ErrorModal` — estandarizado en flujos de onboarding
- Selector de país (`src/lib/paises.ts`) — 15 países con código,
  nombre, bandera, prefijo

## Verificación
Nunca verificar cambios en local — todo se comprueba en producción
(`respondi.vercel.app`). Antes de dar una tarea por terminada, indica
explícitamente qué pasos concretos probar en producción para
confirmarlo.

## Cambios en la base de datos de producción
Nunca ejecutar una migración/SQL directamente sin mostrarla antes y
esperar confirmación explícita — es la base de datos de producción,
con posibilidad de clientes reales.
