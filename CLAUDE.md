# CLAUDE.md — Respondi

## Qué es Respondi
SaaS multi-tenant de atención al cliente y ventas por IA (WhatsApp, Instagram,
Facebook). El público son equipos comerciales/de atención al cliente de
cualquier tipo de negocio, no solo negocios pequeños tipo restaurantes.

Socios al 50/50: Atsura (Andreina — diseño/comercial) y Propulse System LLC
(Jorge — desarrollo/tecnología).

## Stack
- Next.js + TypeScript + Tailwind CSS
- Supabase (PostgreSQL + RLS + Realtime + Storage + pg_cron)
- Vercel (Hobby plan) — producción en respondi.vercel.app
- n8n como conector de mensajería (relay), NUNCA lógica de negocio
- Repo: `app-respond-ia/respondi`

## Reglas de oro (nunca las rompas sin preguntar primero)
1. n8n es solo relay de mensajes. Toda la lógica de negocio (decisión
   IA-vs-humano, resolución de canal, creación de contacto/caso, transcripción)
   vive en Next.js/Supabase.
2. La IA nunca inventa etiquetas ni reglas de escalado — solo usa las que
   existen de verdad en `message_categories`/`case_rules` para esa sucursal.
3. Usa `supabaseAdmin` solo cuando el cliente normal esté bloqueado por RLS.
   Nunca por defecto.
4. Nunca uses `date-fns` (no está instalado) — usa `toLocaleDateString`/
   `toLocaleString` nativos.
5. Modales de confirmación: siempre `ConfirmModal` propio, nunca `confirm()`
   del navegador.
6. Notificaciones: `ToastContext` (arriba a la derecha, 4s), nunca banners
   estáticos.
7. Cada acción de gestión pasa por `registrarAuditoria()`. Cada error
   inesperado, por `registrarError()` (`src/lib/errores.ts`).
8. Canales de mensajería: cada cliente trae su propia cuenta (Whaticket o
   Meta Cloud API directa) y mete sus propias claves/tokens en su panel de
   Respondi. Atsura NO centraliza cuentas ni es Tech Provider — modelo de
   cuenta individual por cliente, sin excepción.

## Cómo trabajamos
- Por tramos: cada bloque de trabajo (un bug, una feature, una integración)
  en su propia sesión/rama. Nunca "haz todo lo pendiente" de una vez.
- Verificación siempre en producción (respondi.vercel.app), nunca en local —
  así es como Jorge comprueba las cosas.
- Cambios en la base de datos de producción: **siempre** como archivo de
  migración en `supabase/migrations/`, aplicado con `supabase db push`.
  Nunca escribiendo por MCP: el MCP va en modo `--read-only` a propósito y
  no tiene herramienta de migraciones, así que un `execute_sql` de escritura
  entraría en la base sin quedar registrado en el historial y los `.sql` del
  repo dejarían de coincidir con la realidad.
  - **Se aplican sin preguntar** (verificando después y contando el
    resultado): índices, columnas nuevas con valor por defecto, arreglos de
    políticas RLS, permisos (`GRANT`/`REVOKE`). Es decir, lo reversible y
    que no toca datos ya guardados.
  - **Se propone y se espera confirmación explícita**: borrar o renombrar
    columnas/tablas, cualquier cosa que modifique datos existentes, y todo
    lo que toque cuentas, contraseñas o accesos.
- Verificar SIEMPRE después de aplicar una migración, no dar por bueno el
  "aplicada sin errores". Caso real: un `REVOKE ... FROM anon, authenticated`
  se ejecutó limpiamente y no cambió nada, porque el permiso venía de
  `PUBLIC`. Solo se vio comprobando el estado real después.
- Jorge no tenía experiencia previa de programación — explica en lenguaje
  sencillo qué se está haciendo y por qué, no des por hecho jerga.

## Dónde está el resto
- `docs/arquitectura.md` — decisiones de diseño y el porqué (créditos, RAG,
  jerarquía de pausa de IA, modelo de contactos, canales)
- `docs/convenciones.md` — convenciones de código y UI/UX en detalle
- `docs/estado/` — qué está hecho y pendiente, por área:
  - `core-plataforma.md` — paneles, roles/permisos, auth, funciones ya construidas
  - `creditos-facturacion.md` — créditos, planes, Stripe
  - `canales-mensajeria.md` — WhatsApp/Whaticket/Meta/n8n, email
  - `motor-ia.md` — herramientas de la IA, RAG, jerarquía pausa/horario, skills
  - `incidentes-resueltos.md` — bugs reales ya encontrados, para no repetirlos
  - `pendientes.md` — checklist activo por prioridad
- `docs/integraciones/` — un archivo por integración (Shopify y futuras);
  vacía hasta que arranque cada tramo
- Esquema de base de datos: consultar directo vía Supabase MCP si está
  conectado; si no, pedir a Jorge el volcado más reciente antes de asumir
  cualquier columna existente
