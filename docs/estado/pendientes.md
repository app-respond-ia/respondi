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
- [x] Plantillas de WhatsApp — hecho (11-09-2026): se crean y se mandan a
      Meta, se traen de Meta con su estado, y se envían desde Chats pasadas
      las 24 h. Ver `canales-mensajeria.md`
- [x] Plantillas con foto/vídeo/documento en la cabecera o con botones que
      cambian — hecho (12-09-2026): se envían desde Chats adjuntando lo que
      pidan. Quedan fuera la cabecera de ubicación y los botones de catálogo,
      formulario o código de un solo uso
- [x] Ver las fotos y los archivos en Chats (12-09-2026): antes solo los veía
      la IA; ahora el mensaje enseña la foto, el vídeo o el archivo con un
      enlace temporal
- [x] Cliente que escribió con el negocio cerrado y se abre pasadas 24 h —
      hecho (11-09-2026, decidido con Jorge): antes de gastar un crédito se
      mira la ventana de WhatsApp; si está cerrada, la IA manda la plantilla
      de reapertura que elija la sucursal (Canales → Plantillas) sin cobrar,
      y si no hay, la conversación queda para el equipo
- [x] Token permanente de Meta — hecho (11-09-2026): guía paso a paso en
      Canales → Cambiar claves, y al conectar se pregunta a Meta cuándo
      caduca el token; si caduca, la tarjeta de WhatsApp lo avisa con la fecha
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
- [x] Límite de canales del plan (`canales_max`) — hecho (11-09-2026): es de
      toda la organización (el que se pone en cada plan en el panel de
      superadmin), cuenta los canales no desconectados de todas sus
      sucursales y lo comprueba el servidor al conectar
- [x] Enum `seccion_permiso`: añadidas `contactos` y `facturacion`
      (11-09-2026). Las que sobran se dejan (quitarlas obliga a rehacer el tipo)
- [x] Borradas las columnas obsoletas `contacts.trato/modo/respuesta_auto/nota`
      (11-09-2026, con el OK de Jorge; migración `20260911150000`). Antes se
      comprobó que nada las usaba y que no se perdía ningún dato; verificado
      después en producción (entrada por WhatsApp y fichas por tienda)
- [x] Historial del cliente en Conversaciones — hecho (11-09-2026) según la
      maqueta (https://claude.ai/code/artifact/2339cc2a-07c6-4b98-98e8-b70feb6962db):
      solo las conversaciones de esa sucursal
- [x] Chats en tiempo real — hecho (11-09-2026): la hora del último mensaje
      ya no se pierde y un chat nuevo aparece sin recargar
- [x] Lentitud general: las funciones de Vercel corrían en EE. UU. y la base
      de datos está en Irlanda — resuelto (11-09-2026), ahora en Dublín. Chats
      pasó de 13-18 s a unos 4 s en cargar
- [x] Chats más rápido (11-09-2026): al entrar hace una sola petición
      (permisos, etiquetas y lista) y al abrir un chat otra (mensajes, ficha,
      actividad); antes eran 6 en fila. El marco del panel pide a la vez lo
      que no depende entre sí

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
- [x] Modelo de Pro diferenciado (11-09-2026): Pro pasa a `gpt-4.1-mini`
      (0,40 $ / 1,60 $ por millón, precio oficial de OpenAI). Trial
      `gpt-4.1-nano`, Starter `gpt-4o-mini`, Business `gpt-4.1`. Los modelos
      baratos siguen algo peor las instrucciones: se añadieron redes de
      seguridad (etiquetado obligatorio, revisión si el cliente pide una
      persona, políticas antes de responder, recordatorio de idioma). Ver
      `motor-ia.md`
- [ ] Soportar la familia `gpt-5.6` (Luna, Terra, Sol): rechazan las
      herramientas del motor salvo que se les pase `reasoning_effort: 'none'`.
      `gpt-6-astra` no admite ni eso. Ojo antes de meterlos: en la prueba
      consumieron el doble de tokens de entrada para la misma pregunta, así
      que su coste real por respuesta es peor que su precio por token

## Decidido
- [x] Créditos de la prueba (12-09-2026): **500, una sola vez** al abrir la
      cuenta, no recarga diaria (Jorge). Cuestan unos 8 céntimos por cuenta.
      Por el camino salió que registrarse estaba roto desde el 10-09, ver
      `incidentes-resueltos.md`

## Prioridad 3 — Cimientos antes de Shopify
- [x] Canal de email (11-09-2026): el negocio conecta su propio buzón
      (IMAP/SMTP) y la IA contesta con forma de correo, en el mismo hilo.
      Detalle en `docs/estado/canales-mensajeria.md`
- [ ] Email con Outlook / Microsoft 365: necesita el inicio de sesión de
      Microsoft (OAuth, registrar una app en Azure). Hoy se avisa de que no
      se puede
- [x] Email: todos los adjuntos (12-09-2026). Se guardan todos en
      `messages.adjuntos` y se ven en Chats; el primero sigue en
      `media_url`, que es lo que mira la IA

## Repaso completo antes de Shopify (12-09-2026)
Revisión a fondo pedida por Jorge ("revisa cada milímetro"). Lo que salió, ya
arreglado y verificado, está en `incidentes-resueltos.md`: registrarse estaba
roto, la lista de precios no dejaba añadir productos y duplicaba al importar,
los PDF de políticas no se procesaban nunca, formularios vacíos que creaban
basura, errores técnicos a la vista del usuario y un par de carreras del canal
de correo.

Pruebas que quedan hechas y se pueden repetir cuando haga falta:
`contrato-conversaciones` (40), `probar-whatsapp` (25), `probar-plantillas`
(44), `probar-correo` (31), `probar-ia-correo` (10), `probar-precios` (19),
`probar-plantilla-precios` (11), `probar-politicas` (13), `probar-formularios`
(13), `probar-configuracion` (20), `probar-resumenes` (6), `probar-motor-ia`,
`probar-multimedia`, `probar-presupuestos` (5), `probar-idioma`,
`probar-jerarquia`, `probar-promesas`, `probar-limite-canales` (6),
`probar-alta-creditos` (4), `probar-invitacion` (9), `probar-errores` (15),
`probar-reintento` (4) y, en navegador, `captura-precios` (11),
`captura-plantillas`, `captura-correo` y `revisar-paginas` (todas las
pantallas, en ordenador y en móvil). En producción: `prod-correo` (10),
`prod-plantillas` (7), `prod-e2e` (4), `prod-planes` (4), `probar-alta-web` (4)
y `probar-invitacion` (9).

## Lo que necesita algo de Jorge (nada de esto puede hacerlo Claude solo)
- [ ] **Stripe**: crear la cuenta (modo prueba vale) y pasar las claves. El
      código de suscripción está a medias esperándolas; sin cuenta no se puede
      ni escribir con sentido (faltan los precios y los identificadores) ni
      probar. Es lo único que bloquea cobrar
- [ ] **Dominio en Resend**: hoy la cuenta solo envía a
      `app.respond.ia@gmail.com`, así que ninguna invitación llega a nadie de
      fuera. Hace falta decidir el dominio y pegar 3 registros DNS
- [ ] **Vercel a Pro** antes de cobrar (el plan gratis es solo uso personal)
- [ ] **Supabase a Pro** para la protección de contraseñas filtradas
- [ ] **Papeleo de Meta** (verificación de Atsura) y número de WhatsApp de
      prueba para probar con un móvil de verdad
- [ ] **Whaticket**: escribir a su soporte preguntando si pueden avisar a
      Respondi de los mensajes entrantes. Si no pueden, se quita de la pantalla
- [ ] **Outlook / Microsoft 365 en el correo**: registrar una app en Microsoft
      (Azure) para su inicio de sesión

## Prioridad 4 — Shopify y automatizaciones (arrancado el 12-09-2026)
Decidido con Jorge: todas las automatizaciones prediseñadas (37, por
categorías), cada una la enciende el cliente; construir de cinco en cinco y
probar cada una; la IA puede mandar enlaces de compra y descuentos, pero
reembolsos y cancelaciones siempre los hace una persona. Detalle y estado en
`docs/integraciones/shopify.md`.
- [x] Cimientos (12-09-2026): tabla de tiendas con el token en Vault, motor
      de recetas con cola y registro, cron cada minuto, entrada de avisos de
      Shopify con firma, pantallas Tienda online y Automatizaciones. Probado
      con Shopify y Meta simulados: `probar-tienda` (46) y
      `probar-motor-automatizaciones` (40)
- [x] Canal por automatización, plantillas prediseñadas con botón a Meta,
      workflow dibujado, editor de recetas (moldear las nuestras y crear las
      propias, con «probar con un pedido de ejemplo») — hechos el 12-09-2026
      con el «hazlo todo de una» de Jorge. Decidido por defecto: propias para
      todos los planes, tope 20 por sucursal, plantillas en español
- [x] **Las 37 automatizaciones listas y probadas** (12-09-2026; migración
      `20260912180000`: intereses de producto, baja de promociones, origen
      externo en la lista de precios). Detalle en `docs/integraciones/shopify.md`
- [x] Herramientas de la IA con datos de la tienda: buscar, estado del pedido
      con identidad, enlace de compra (con tope), lista de espera, detectar
      intención, presupuesto con precios de la tienda, relacionados
- [x] Baja de promociones: «BAJA» corta el marketing aunque Shopify diga que sí
- [ ] Descuento a mano desde el chat (que la IA pueda ofrecer un código si el
      negocio lo permite): hoy los descuentos salen solo por automatización
- [ ] Verificación contra una tienda de desarrollo real (necesita que Jorge
      cree la cuenta de Partner de Shopify: pide verificar un correo y
      aceptar su contrato)
- [ ] Editor visual de recetas ("el mapa"), más adelante
- Soporte automatizado con IA: aplazado por Jorge hasta terminar Shopify

## Prioridad 5 — Agenda de reservas (arrancada el 12-09-2026)
Decidido con Jorge: agenda para cualquier negocio (también restaurantes),
tres tramos seguidos; la IA confirma lo que cabe en las reglas y lo raro va
a una persona (el negocio puede poner confirmación a mano); sin señales de
momento; en todos los planes; el cliente no se registra. Detalle en
`docs/integraciones/agenda.md`.
- [x] Tramo 1 (12-09-2026): recursos, servicios reservables en la lista de
      precios, citas con blindaje en la base de datos, cálculo de huecos,
      herramientas de la IA, calendario, permiso "Agenda", 8 automatizaciones
      (migraciones `20260912190000`, `190100`, `190200`)
- [x] Tramo 2 (13-09-2026): modo restaurante (mesas por comensales y zona,
      mesas que se juntan, turnos, duración por comensales, aforo por turno,
      cortesía que libera la mesa, sentar sin reserva, vista de sala)
- [x] Tramo 3 (13-09-2026): enlace público de reserva (respondi.vercel.app/r/…,
      con QR) y página de cada reserva con su llave para cambiar o cancelar
- [ ] Google Calendar (proyecto de Google de Jorge), más adelante

## Invitaciones pendientes — cerrado (10-09-2026)
Todo el bloque está hecho: `PanelInvitaciones` compartido en
`/vendedor/clientes`, `/superadmin/vendedores`, `/superadmin/organizaciones`
y la ficha de cada vendedor; métricas de invitaciones y tasa de cierre en
"Rendimiento de vendedores"; validación de email; reconciliación contra
cuentas ya existentes; aviso de errata; y el fallo de envío de email ya no
se traga en silencio.
- [x] Invitaciones basura de las pruebas: ya no existían (11-09-2026)
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
- [x] Tramo D de horarios — resuelto (10-09-2026). Al auditarlo salieron
      6 fallos más en la misma función, ver `incidentes-resueltos.md`
- [x] Unificar el editor de horarios del onboarding — ya estaba hecho en
      el tramo C: `onboarding/page.tsx` usa `EditorHorarios` (paso 2) y
      `ConfiguracionMensajeIA` con el selector de 3 modos (paso 4). La
      nota se quedó sin marcar
- [x] Auditoría completa del esquema de Supabase (12-09-2026): las relaciones
      ya estaban (una consulta engañosa hizo creer lo contrario, ver
      `incidentes-resueltos.md`). Faltaban dos (`vendedores.user_id` y
      `comisiones_log.user_id`) y un índice, ya añadidos. Cero filas huérfanas
- [x] Bloque 2.1 (traducir errores crudos de Postgres a mensajes
      entendibles) — hecho (12-09-2026) al cerrar la auditoría
- [x] Herramienta de presupuestos de la IA — hecho (11-09-2026): con la
      skill "Hacer presupuestos" activada, la IA pasa productos y cantidades
      y `hacer_presupuesto` calcula el total con los precios del catálogo
      (avisa de los "desde", no inventa los "a consultar" ni lo que no
      existe). De paso, el buscador del catálogo ya encuentra los productos
      aunque el cliente escriba sin tildes o en plural
- [x] Interceptor de `Toast.tsx` que traducía a ciegas TODO error —
      resuelto (10-09-2026), ver `docs/estado/incidentes-resueltos.md`.
      El arreglo se hizo en `traducirError` y no en el Toast, porque la
      función se llamaba igual de mal desde otros 13 sitios.
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
- [x] Invitar a un usuario de principio a fin — verificado (11-09-2026) con
      un navegador de verdad (`probar-invitacion`, 7 comprobaciones): la
      invitación nace con la organización, la sucursal y el rol; el registro
      trae el email bloqueado; al registrarse entra en ESA organización con su
      rol y su sucursal, y el propietario lo ve en su lista. Queda pendiente
      que el correo de invitación llegue (dominio de Resend)
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
- [x] Plantilla "Invite user" de Supabase (12-09-2026): ya no la usa nada.
      Detrás de esa nota había un fallo de verdad: "reenviar invitación"
      seguía llamando al sistema de invitaciones de Supabase y mandaba a la
      persona a `/aceptar-invitacion`, donde no podía hacer nada. Ahora
      reenvía el mismo correo de Respondi con el enlace bueno. La plantilla de
      Supabase es una de las suyas por defecto: no se puede borrar, pero ya no
      se manda nunca
- [ ] Excedentes sobre límites del plan (`plans.precio_credito_adicional`,
      `plans.precio_sucursal_extra`) — existen en el formulario pero
      sin flujo de cobro real todavía
- [x] Cron `revisar-bloqueos` con el tiempo de espera por defecto de pg_net
      (5 s): cuando Vercel tardaba en arrancar, la llamada se daba por perdida
      (6-8 veces por hora en `net._http_response`). Igualado a 60 s como los
      demás (12-09-2026, migración `20260912160000`), verificado
- [ ] Llamadas del reloj que se cuelgan 60 s enteros: 1-3 por hora, a
      cualquier cron, desde antes de Shopify. La app no llega ni a leer la
      base de datos (el aviso pendiente se trató limpio al minuto siguiente en
      3,8 s). Todos los crones se recuperan solos en la vuelta siguiente, así
      que no bloquea; para afinarlo hacen falta los logs de Vercel de esos
      minutos (cold start vs. Supabase)
