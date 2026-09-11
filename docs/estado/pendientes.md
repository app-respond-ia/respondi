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
- [x] Verificaciones aplazadas — revisadas (10-09-2026):
      - Invitación con hash: ya no existe ese flujo, ahora va por
        `invitaciones_pendientes`. Nota obsoleta
      - Contraseña con cuenta de email: funcionaba, pero el recorrido estaba
        roto. La invitación de vendedor y la de agente mandaban a `/login`,
        donde esa persona todavía NO tiene cuenta y lo único que ve es
        "Prueba gratis 14 días". Ahora van a `/registro-trial?inv=<id>`, con
        la pantalla adaptada a cada tipo de invitado
      - Notificación de comisiones: sin revisar, Jorge la da por buena
- [x] **Las respuestas no salían hacia WhatsApp** — resuelto (11-09-2026):
      WhatsApp directo con Meta, sin n8n. Ver `canales-mensajeria.md`
- [ ] **Probar con un número de verdad**: crear la app de prueba de Meta
      (número de prueba gratis, hasta 5 móviles) y conectarla en Canales
- [ ] Whaticket: preguntar a su soporte si pueden avisar a Respondi de los
      mensajes que entran (su API documentada solo envía)
- [ ] Plantillas de WhatsApp desde Chats para escribir fuera de la ventana
      de 24 h
- [ ] Token permanente de Meta: el de prueba caduca en 24 h; explicar en
      Canales cómo crear el de "usuario del sistema"
- [x] Modelo de chats, conversaciones y casos — paso 1 hecho (11-09-2026):
      el caso solo cuando hace falta una persona, cierres unificados, y la IA
      y las personas ya no se pisan. Ver `docs/arquitectura.md`
- [x] Paso 2: Chats con una fila por persona — hecho (11-09-2026): su
      conversación abierta (o la última) y cuántas lleva; los filtros miran
      esa conversación
- [x] Paso 3: las notas internas son de la persona — hecho (11-09-2026): se
      ven en todas sus conversaciones de la sucursal, marcadas con la fecha
      de la conversación en que se escribieron
- [x] Borrado el código muerto: `agente-casos.ts`, `agente-caso-detalle.ts`
      y `OperarioLayout.tsx` (11-09-2026)
- [x] Cada sucursal ve solo lo suyo — hecho (11-09-2026), también la
      configuración, los permisos por sección en el servidor y el registro
      de cambios. Ver `docs/arquitectura.md`, "Cada sucursal ve solo lo suyo"
- [ ] Límite de canales del plan (`canales_max`): solo lo comprueba la
      pantalla. Decidir con Jorge si es por sucursal o por organización
      antes de ponerlo en el servidor
- [ ] Alinear el enum `seccion_permiso` con las secciones que usa la app
      (ver `docs/arquitectura.md`, "Permisos y roles")
- [ ] Borrar las columnas obsoletas `contacts.trato/modo/respuesta_auto/nota`
      (ya no se usan; se borran con el OK de Jorge)
- [x] Historial del cliente en Conversaciones — hecho (11-09-2026) según la
      maqueta (https://claude.ai/code/artifact/2339cc2a-07c6-4b98-98e8-b70feb6962db):
      solo las conversaciones de esa sucursal. Falta que lo vea Andreina
- [x] Chats en tiempo real — hecho (11-09-2026): la hora del último mensaje
      ya no se pierde y un chat nuevo aparece sin recargar

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
- [ ] Pasar Vercel a Pro antes de cobrar a clientes: el plan Hobby es solo
      para uso personal, no comercial
- [x] Ronda de pruebas de la jerarquía de pausa/horario — hecha
      (10-09-2026): 15 escenarios contra el endpoint real + 18 de la
      función de horarios con el reloj congelado. Todos correctos. Por el
      camino salieron dos fallos graves del motor de IA, ver
      `incidentes-resueltos.md`
- [x] **Horarios que cruzan medianoche** — soportados (10-09-2026). Un bar
      de 22:00 a 02:00 ya se puede configurar; el editor marca la franja
      como "del día siguiente" y el cálculo mira también la cola del día
      anterior. 31 escenarios verificados
- [x] Coste por token configurable por plan — hecho (10-09-2026).
      `plans.precio_input_usd_millon` / `precio_output_usd_millon`, editables
      desde /superadmin/planes. Verificado con una respuesta real: al cambiar
      el precio del plan cambia el coste que guarda `ai_logs`
- [x] Precios reales por plan — puestos (10-09-2026), con la lista que pasó
      Jorge y los modelos verificados uno a uno contra la API
- [ ] Diferenciar el modelo de Pro y Business: comparten `gpt-4.1` porque
      entre `gpt-4o-mini` y `gpt-4.1` no hay ningún modelo con precio
      confirmado. `gpt-4.1-mini` está verificado que funciona; solo falta su
      precio para poder ponerlo en medio
- [ ] Soportar la familia `gpt-5.6` (Luna, Terra, Sol): rechazan las
      herramientas del motor salvo que se les pase `reasoning_effort: 'none'`.
      `gpt-6-astra` no admite ni eso. Ojo antes de meterlos: en la prueba
      consumieron el doble de tokens de entrada para la misma pregunta, así
      que su coste real por respuesta es peor que su precio por token

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
- [x] Caducidad real de invitaciones — **se decide no hacerla**. Bloquear
      un alta porque la invitación tiene más de 14 días solo genera
      soporte: el enlace no lleva ningún secreto, la vinculación se hace
      por email, así que una invitación vieja no es un riesgo. El estado
      "caducada" en pantalla ya cumple su función: avisar a quien invitó
      de que reenvíe

## Sueltos — sin bloquear nada, hacer cuando encaje
- [x] Cron `disparador-ia-agrupador` — revisado (10-09-2026). No puede ser
      reactivo: su trabajo es esperar a que el cliente lleve N segundos sin
      escribir (`tiempo_agrupacion_seg`, 30 por defecto) para agrupar varios
      mensajes en una sola respuesta, y esperar un silencio obliga a
      comprobar cada cierto tiempo. Se bajó a 20 segundos (la mitad de
      ejecuciones) y se añadió un índice parcial que cubre su filtro.
      Pendiente para cuando haya tráfico: guardar en `conversations` quién
      escribió el último mensaje, para quitar la subconsulta por
      conversación. No se hace ahora porque exige un disparador en la
      inserción de mensajes, el camino más caliente de la app
- [x] Días de prueba: solo el plan Trial los tiene. Los de pago pasan a 0,
      y `dias_trial = 0` significa alta activa con un mes de vigencia, no
      una cuenta vencida el mismo día que nace
- [x] Linter de Supabase: 13 funciones con `search_path` mutable y la
      vista `saldos_actuales_ia` (único aviso de nivel ERROR, dejaba ver
      el saldo de créditos de TODAS las organizaciones) — corregidos y
      verificados con RLS real
- [ ] **Activar la protección de contraseñas filtradas** en el panel de
      Supabase (Authentication → Passwords). Es un clic, lo tiene que
      hacer Jorge
- Avisos del linter que se dejan a propósito, con motivo:
  - `vector` en el esquema `public`: moverlo obligaría a recrear la
    columna `embedding` de `policy_fragments` y rehacer los embeddings.
    No compensa por un aviso de estilo
  - `auth_rol` / `auth_is_admin` / `auth_tenant_id` /
    `auth_has_permission` / `is_super_admin` ejecutables por `anon` y
    `authenticated`: **no se pueden cerrar**. 56 políticas de RLS son
    `TO public` (que incluye a `anon`) y las invocan; sin EXECUTE se cae
    el acceso a media aplicación. Además no filtran nada: llamadas sin
    sesión devuelven null/false
- [x] Tramo D de horarios — resuelto (10-09-2026). Al auditarlo salieron
      6 fallos más en la misma función, ver `incidentes-resueltos.md`
- [x] Unificar el editor de horarios del onboarding — ya estaba hecho en
      el tramo C: `onboarding/page.tsx` usa `EditorHorarios` (paso 2) y
      `ConfiguracionMensajeIA` con el selector de 3 modos (paso 4). La
      nota se quedó sin marcar
- [ ] Auditoría completa del esquema de Supabase (FKs faltantes) —
      hacer después de terminar el diseño de contexto/herramientas de
      la IA
- [ ] Herramienta de presupuestos real para la IA (hoy la skill existe
      en el panel pero sin herramienta real detrás)
- [ ] Bloque 2.1 (traducir errores crudos de Postgres a mensajes
      entendibles) — pausado a propósito hasta cerrar la auditoría de
      esquema y la estrategia de errores/seguridad, para diseñar el
      mapeo una sola vez
- [x] Interceptor de `Toast.tsx` que traducía a ciegas TODO error —
      resuelto (10-09-2026), ver `docs/estado/incidentes-resueltos.md`.
      El arreglo se hizo en `traducirError` y no en el Toast, porque la
      función se llamaba igual de mal desde otros 13 sitios.
- [ ] Stripe (Pieza B) — falta crear la cuenta de Stripe; resto del
      código ya preparado (ver `docs/estado/creditos-facturacion.md`)
- [x] Migrar `create_trial_account` al RPC `crear_cuenta_completa` — ya
      estaba: la función no existe ni en el código ni en la base de datos
- [x] Columna `plans.dias_trial` editable — hecho (10-09-2026). El 14
      estaba dentro de la función `crear_cuenta_completa` de la base de
      datos, no en el código de la app. Ahora es una columna del plan,
      editable desde /superadmin/planes
- [x] Aplicar `registrarError()` a las funciones de riesgo — hecho
      (10-09-2026). Varias notas estaban desfasadas: `crearSucursal` ya
      registraba y lo de `eq('rol','admin')` ya estaba corregido. Lo que
      quedaba: 3 fallos mudos (guardaban sin comprobar nada) y los `catch`
      de los pasos 0, 2, 4 y 5 del onboarding, que solo hacían
      `console.error` — invisible en producción. Verificado: cero fallos
      mudos en onboarding.ts, usuarios.ts y sucursales.ts
- [ ] Verificar `invitarUsuario` de principio a fin. **Media prueba hecha**
      (10-09-2026) contra la app real: crear rol → invitar → la invitación
      nace con el tenant, el tipo y el rol correctos. La otra mitad (que
      el invitado al registrarse entre en ESA organización y no en una
      nueva) no se pudo automatizar: `signupTrial` recibe `FormData` y no
      se puede invocar bien desde un script. Prueba manual, 2 minutos:
      invitar a un agente desde /dashboard/usuarios, registrarse con ese
      email en /registro-trial y comprobar que aparece en la lista de
      usuarios de la organización que invitó
- [x] Modal muerto de `/dashboard/sucursales` eliminado, junto con la
      acción `crearSucursal` que solo él usaba. Ya solo hay una forma de
      crear una sucursal: el asistente
- [x] Pantalla de registro para invitados — hecho (10-09-2026). El enlace
      del correo lleva `?inv=<id>`, así que la pantalla sabe a quién da de
      alta: enseña el nombre del negocio, trae el email puesto y bloqueado
      (era lo único que enlazaba la invitación con el alta) y oculta el
      botón de Google, que habría creado una cuenta sin vincular
- [x] Rutas huérfanas — `src/app/auth/verificar/route.ts` ya no existe y
      `auth/procesar-hash` sí se usa (desde `auth/callback` y
      `usuarios-globales`). La nota estaba desfasada
- [ ] Plantilla "Invite user" en Supabase, sin usar (limpieza en el panel)
- [ ] Excedentes sobre límites del plan (`plans.precio_credito_adicional`,
      `plans.precio_sucursal_extra`) — existen en el formulario pero
      sin flujo de cobro real todavía
