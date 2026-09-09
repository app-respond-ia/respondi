# Pendientes — Respondi

Checklist activo. Marca lo que se cierre y anota el resultado en el
archivo de `docs/estado/` que corresponda (no aquí — este archivo es
solo la lista viva).

## Prioridad 1 — Antes de la ronda de pruebas grande de Fase 0
- [ ] UI de horarios: no distingue horario del negocio vs. horario de
      respuesta de la IA
- [ ] Falta botón de políticas en el perfil de sucursal
- [ ] Bug de permisos: un admin/dueño de organización no podía hacer
      ciertas acciones en su propio panel (detectado en pruebas de la
      última reunión) — sospecha: misma familia que el problema de
      `rol` legacy desincronizado con `es_propietario`
- [ ] Verificaciones aplazadas: contraseña con cuenta email
      (vendedor/superadmin), fix de invitación con hash, prueba de
      notificación de comisiones

## Prioridad 2 — Fase 0 (antes de construir nada de la v2)
- [ ] Conseguir `OPENAI_API_KEY` (bloquea pruebas reales end-to-end de
      créditos y del motor de IA)
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

## Sueltos — sin bloquear nada, hacer cuando encaje
- [ ] Auditoría completa del esquema de Supabase (FKs faltantes) —
      hacer después de terminar el diseño de contexto/herramientas de
      la IA
- [ ] Herramienta de presupuestos real para la IA (hoy la skill existe
      en el panel pero sin herramienta real detrás)
- [ ] Bloque 2.1 (traducir errores crudos de Postgres a mensajes
      entendibles) — pausado a propósito hasta cerrar la auditoría de
      esquema y la estrategia de errores/seguridad, para diseñar el
      mapeo una sola vez
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
