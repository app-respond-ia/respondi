# Pendientes — Respondi

Checklist activo. Marca lo que se cierre y anota el resultado en el
archivo de `docs/estado/` que corresponda (no aquí — este archivo es
solo la lista viva).

## Prioridad 1 — Antes de la ronda de pruebas grande de Fase 0
- [x] UI de horarios: no distingue horario del negocio vs. horario de
      respuesta de la IA — resuelto (tramos A/B/C de horarios)
- [x] Falta botón de políticas en el perfil de sucursal — resuelto
- [x] Bug de permisos: un admin/dueño de organización no podía hacer
      ciertas acciones en su propio panel — resuelto, ver
      `docs/estado/incidentes-resueltos.md`
- [x] `crear_cuenta_completa` ejecutable por cualquiera vía
      `/rest/v1/rpc/` — cerrado (10-09-2026, migración
      `20260910190000`). Verificado en producción: anónimo y usuario
      identificado reciben 42501 "permission denied"; el servidor de la
      app (service_role) y pg_cron conservan el acceso. Las tres
      `check_*` de cron quedan igual de cerradas.
- [ ] Verificaciones aplazadas: contraseña con cuenta email
      (vendedor/superadmin), fix de invitación con hash, prueba de
      notificación de comisiones

## Prioridad 2 — Fase 0 (antes de construir nada de la v2)
- [x] Conseguir `OPENAI_API_KEY` — hecha: en `.env.local` y en las
      variables de entorno de Vercel (09-09-2026)
- [ ] **Verificar dominio en Resend** — antes de que se registren
      personas de fuera, no antes. Hoy la cuenta está en modo prueba y
      solo envía a `app.respond.ia@gmail.com`; cualquier invitación a
      otra dirección se guarda pero el correo se rechaza con un 403.
      Es el motivo real de "invité a alguien y no llegó ningún email".
      No bloquea las pruebas internas: Jorge y Andreina las hacen con
      sus propias cuentas de Gmail/Facebook y móviles, y el alta se
      puede completar entrando a `/registro-trial` con el mismo email
      de la invitación — el sistema la vincula por email, sin
      necesidad de abrir ningún correo.
- [ ] Papeleo de canales (verificación de Atsura, registro como
      partner de Gupshup para el BSP)
- [ ] Ronda de pruebas rigurosa, escenario por escenario, de toda la
      jerarquía de pausa/horario de la IA — incluye los 3 modos nuevos
      de horario (`mismo_negocio`/`personalizado`/`siempre_activa`),
      reescritos pero nunca probados con el mismo rigor que el resto
      de la jerarquía

## Prioridad 3 — Cimientos antes de Shopify
- [ ] Canal de email: mismo motor de IA, lógica de conversación
      distinta (ver `docs/arquitectura.md`) — proveedor de correo
      entrante, nuevo valor en `channels.tipo`, ajustes de UI en Chats

## Prioridad 4 — Shopify Fase 1
- [ ] Conexión real con la API de Shopify (catálogo/stock/pedidos)
- [ ] Caso de uso WISMO
- (Catálogo conversacional, recuperación de carritos, devoluciones y
  fidelización van después, una vez validado lo anterior)

## Invitaciones pendientes — cerrado (10-09-2026)
Todo el bloque está hecho: `PanelInvitaciones` compartido en
`/vendedor/clientes`, `/superadmin/vendedores`, `/superadmin/organizaciones`
y la ficha de cada vendedor; métricas de invitaciones y tasa de cierre en
"Rendimiento de vendedores"; validación de email; reconciliación contra
cuentas ya existentes; aviso de errata; y el fallo de envío de email ya no
se traga en silencio.
- [ ] Limpiar las invitaciones basura de las pruebas (`mmm`, `mmmm` y
      `n8n@propulsesytem.com`) desde el panel, con el botón Cancelar
- [ ] Caducidad real de invitaciones: hoy `DIAS_CADUCIDAD_INVITACION` (14)
      solo pinta el estado en pantalla; no bloquea el alta. Si se quiere
      que caduquen de verdad hace falta migración

## Sueltos — sin bloquear nada, hacer cuando encaje
- [ ] Cron `disparador-ia-agrupador` (jobid 6) corre **cada 10 segundos**
      y `cron-procesar-politicas` (jobid 8) cada minuto. Revisar si esa
      frecuencia es necesaria antes de que haya tráfico real: son
      ~8.600 ejecuciones al día del primero
- [ ] Avisos del linter de Supabase sin atender: vista
      `saldos_actuales_ia` con SECURITY DEFINER, 13 funciones con
      `search_path` mutable, extensión `vector` en el esquema `public`,
      y protección de contraseñas filtradas desactivada en Auth
- [ ] Tramo D de horarios: la copia de sucursal en `crearSucursal` usa
      `.limit(7)` y no copia `orden` ni `tipo`, así que al duplicar una
      sucursal se pierden las franjas múltiples y el horario de la IA
- [ ] Unificar `onboarding/page.tsx` para que reutilice el componente
      compartido `EditorHorarios` (`src/components/sucursales/
      EditorHorarios.tsx`) en vez de su propia implementación
      duplicada del editor de horarios (franjas, "copiar a...", etc.,
      hoy repetida a mano dentro del Paso 2 del wizard). También
      reemplazar su checkbox simplificado de 2 opciones para el
      horario de la IA por el selector completo de 3 modos
      (`mismo_negocio`/`siempre_activa`/`personalizado`) que ya usa
      `perfil-sucursal`, si tiene sentido ofrecerlo desde el alta
      inicial. Aplazado a propósito: onboarding es el flujo más
      crítico de la app (alta de cuentas reales), y este cambio
      merece su propio tramo con testing dedicado end-to-end, no
      mezclado con ajustes de claridad visual menores.
- [ ] Auditoría completa del esquema de Supabase (FKs faltantes) —
      hacer después de terminar el diseño de contexto/herramientas de
      la IA
- [ ] Herramienta de presupuestos real para la IA (hoy la skill existe
      en el panel pero sin herramienta real detrás)
- [ ] Bloque 2.1 (traducir errores crudos de Postgres a mensajes
      entendibles) — pausado a propósito hasta cerrar la auditoría de
      esquema y la estrategia de errores/seguridad, para diseñar el
      mapeo una sola vez
- [ ] Interceptor de `Toast.tsx` traduce a ciegas TODO error, incluidos
      mensajes ya legibles y correctos de la propia app — bug
      relacionado con el de arriba pero distinto y más urgente, afecta
      a toda la app, merece su propio tramo. Causa: `showToast(msg,
      'error')` pasa `msg` por `traducirError()` sin distinguir si ya
      es un mensaje humano de la app o un error técnico crudo de
      Postgres/Auth; si no coincide con ninguno de los patrones que
      `traducirError` reconoce (`23505`/`23502`/`42501`/etc.), cae
      siempre al genérico "Ha ocurrido un error inesperado. Si
      persiste, contacta con soporte." — destruyendo el mensaje real.
      Repro real: `actualizarRegla` (`src/app/actions/reglas.ts`)
      bloquea correctamente editar una regla `es_protegida` con el
      mensaje "Esta regla es del sistema y no se puede editar ni
      desactivar.", pero en `/dashboard/reglas` el usuario solo veía el
      genérico. El commit `75db8e0` ya evitó el problema a mano en 4
      pantallas con "manejo de error local" (mostrando el error fuera
      del Toast) — indicio de que ya se detectó antes sin arreglar la
      causa de raíz. Posibles enfoques: que las Server Actions marquen
      de algún modo si un error ya es "para mostrar tal cual" vs "crudo
      a traducir", o que `traducirError` solo actúe sobre objetos de
      error reales (con `.code`/`.message` de Postgres) y no sobre
      strings ya construidos por la app.
- [ ] Stripe (Pieza B) — falta crear la cuenta de Stripe; resto del
      código ya preparado (ver `docs/estado/creditos-facturacion.md`)
- [ ] Migrar `create_trial_account`/flujo de Google OAuth al RPC
      `crear_cuenta_completa` (delicado, toca login real)
- [ ] Columna `plans.dias_trial` editable (hoy los 14 días están
      hardcodeados)
- [ ] Aplicar `registrarError()` al resto de funciones ya
      inventariadas con el mismo patrón de riesgo: `crearSucursal`
      (11 operaciones sin capturar, además del hallazgo de
      `eq('rol','admin')` en vez de `es_propietario`), `saveStep1`/
      `saveStep3` (onboarding.ts), `invitarUsuario` (usuarios.ts),
      `cambiarRolUsuario` (usuarios-globales.ts, menor prioridad)
- [ ] Verificar `invitarUsuario` de principio a fin (mismo patrón ya
      probado para vendedor/admin_trial)
- [ ] Pantalla de registro simplificada para invitados (sin "nombre de
      negocio" ni textos de prueba gratis)
- [ ] Limpieza de rutas huérfanas sin tráfico:
      `src/app/auth/verificar/route.ts`, plantilla "Invite user" en
      Supabase
- [ ] Excedentes sobre límites del plan (`plans.precio_credito_adicional`,
      `plans.precio_sucursal_extra`) — existen en el formulario pero
      sin flujo de cobro real todavía
