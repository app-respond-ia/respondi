# Estado — Canales de mensajería (Respondi)

Ver `docs/arquitectura.md` (sección "Canales de mensajería") para el
modelo de diseño general. Aquí va el detalle de decisiones,
proveedores y estado real.

## Modelo de canales — decisión final (vigente)
Decidido en reunión con Andreina, y confirmado después: **cada
cliente trae su propia cuenta**, sin excepción.
- Whaticket: cada cliente paga y gestiona su propia suscripción;
  Respondi solo se conecta por API.
- Meta oficial: cada cliente monta su propia conexión directa a la
  Meta Cloud API y mete sus propias credenciales/tokens en su panel
  de Respondi — sin BSP, sin que Atsura sea Tech Provider ni haga
  Embedded Signup.

Un plan anterior (Atsura como Partner/Tech Provider centralizador vía
Gupshup, con WABA compartida y onboarding por Embedded Signup propio)
quedó **descartado** por esta decisión — no construir sobre ese
modelo antiguo si aparece documentación o código que lo asuma.

Consecuencia práctica: el onboarding de canal Meta en Respondi es un
formulario donde el cliente pega sus propias claves (App ID, token de
acceso, número verificado, etc.), no un flujo de Embedded Signup
gestionado por Atsura.

## Whaticket — en espera (11-09-2026)
Proveedor: whaticket.com. Se había decidido arrancar con clientes reales
sobre Whaticket, pero al integrarlo directamente se vio que, según su
documentación pública, **su API solo envía**: no hay forma documentada de que
Whaticket avise a otra aplicación de los mensajes que entran, así que la IA
de Respondi no podría contestarlos. Además, en conexiones por QR cada mensaje
enviado por API gasta créditos de Whaticket (en conexiones de API Cloud cobra
Meta). Envío: `POST https://api.whaticket.com/api/v1/messages` con token.
Pendiente: preguntar a su soporte si pueden mandar cada mensaje entrante a
una dirección nuestra. Hasta entonces la opción aparece en Canales como
"todavía no disponible".

## Meta oficial — BSP elegido (papeleo, no código)
Gupshup, no 360dialog — sin cuota mensual fija, solo pago por mensaje
(~0,001$ de Gupshup por mensaje; Meta solo cobra mensajes de
plantilla, no los de sesión/conversación normal). Encaja mejor sin
tener aún clientes que la cuota fija de 360dialog (250-1.000€/mes).

## WhatsApp directo con Meta, sin n8n (11-09-2026)
Jorge decidió quitar n8n: la app habla directamente con la API de WhatsApp
de Meta (Cloud API, versión 25).
- **Conectar** (Canales): el cliente pega tres datos de su propia app de
  Meta: identificador del número, token de acceso y clave secreta de la app.
  Se comprueban con Meta antes de guardarlos y van cifrados a la caja fuerte
  de Supabase (Vault; `guardar/leer/borrar_credenciales_canal`, solo el
  servidor). Nunca vuelven a la pantalla.
- **Recibir**: cada canal tiene su dirección,
  `/api/whatsapp/meta/<id del canal>`, que el cliente pega en su app de Meta
  con el "verify token" que le da Respondi. Al verificarla Meta, el canal
  pasa a activo solo. Cada aviso se comprueba con la firma
  `X-Hub-Signature-256`. Los archivos (fotos, audios, documentos) se
  descargan de Meta y se guardan en el almacén privado `whatsapp_media`. Un
  aviso repetido no duplica el mensaje.
- **Enviar** (`src/lib/canales/salida.ts`): las respuestas de la IA, los
  mensajes de los agentes y los avisos automáticos (fuera de horario, sin
  créditos, respuesta fija a un contacto) salen por el canal de la sucursal.
  Cada mensaje guarda `estado_envio` (pendiente → enviado → entregado →
  leído, o fallido) y el motivo si falla; los estados llegan en los avisos
  de Meta. Los fallos pasajeros se reintentan solos (cron
  `reintentar-envios-whatsapp`, hasta 3 intentos). Fuera de la ventana de
  24 h no se reintenta y se explica que hace falta una plantilla (ver abajo). Si Meta
  rechaza el token, el canal pasa a "error" con el motivo.
- **Pruebas**: `probar-whatsapp` (23 comprobaciones) contra un Meta
  simulado (`WHATSAPP_GRAPH_URL`).

## La app tiene que estar suscrita a la cuenta — hecho el 13-09-2026
Meta solo entrega los mensajes (y los avisos de plantillas) a las apps
SUSCRITAS a la cuenta de WhatsApp Business; poner la dirección del webhook
en la app no basta. Pasó con el número de pruebas de Jorge: todo verde y no
llegaba nada, porque solo estaba suscrita una app interna de Meta. Ahora
`conectarWhatsAppMeta` llama a `POST /{WABA}/subscribed_apps`
(`suscribirAppALaCuenta`) y, si Meta no lo acepta, no deja conectar y
explica que el token necesita `whatsapp_business_management`. La
verificación del webhook (GET) vuelve a asegurarla en segundo plano, por si
el canal se conectó antes de este cambio. Comprobación:
`GET /{WABA}/subscribed_apps` debe listar la app del cliente.

## Versiones e historial de plantillas — hecho el 13-09-2026
Decidido con Jorge: cada cliente puede editar cualquier plantilla (también
las prediseñadas), y todas vienen hechas para no tener que editarlas.
- **Modelo**: una plantilla es una FAMILIA de versiones
  (`whatsapp_templates.familia`, `version`, `en_uso`, `activar_al_aprobar`,
  `huecos`, `ejemplos`, `origen`; migración `20260913120000`). Cada versión
  es una plantilla distinta en Meta (`recordatorio_cita`,
  `recordatorio_cita_v2`...), porque Meta no deja usar una plantilla editada
  hasta que la vuelve a aprobar. De cada familia hay una versión en uso
  (índice único parcial): la que mandan la IA, Chats, la reapertura y las
  automatizaciones.
- **Editar** (`editarPlantillaWhatsApp`) crea la versión siguiente, en
  revisión y con `activar_al_aprobar`; la de siempre sigue en uso. Cuando
  Meta la aprueba (aviso del webhook o "Actualizar desde Meta"), pasa a
  usarse sola. Si la rechaza, no cambia nada.
- **Historial**: en la página de plantillas cada familia enseña su versión
  en uso y un historial con todas; "Usar esta versión" vuelve a cualquier
  aprobada al momento; "Volver a enviar" recupera el texto de una borrada o
  rechazada como versión nueva. Borrar una versión con hermanas la deja como
  "borrada" (así nunca se repite un número: Meta reserva los nombres
  borrados); borrar la única versión la quita del todo. Lo que se borra en
  Meta queda igual como historial al actualizar.
- **Resolución**: los ajustes guardan el identificador de una versión
  cualquiera; `resolverPlantilla` / `versionParaEnviar` devuelven la que
  toca mandar (en uso y aprobada, o la aprobada más reciente). Lo usan el
  motor de automatizaciones (`prepararPlantilla`), la reapertura y las
  listas de Chats y del ajuste "Otra plantilla mía" (una por familia).
- **Prediseñadas**: desde Automatizaciones o desde la página de plantillas
  se envían tal cual o con "Editar el texto antes". Cada versión guarda qué
  dato va en cada hueco (`huecos`), así que el cliente puede quitar huecos
  o cambiar el texto de alrededor, pero no inventar huecos nuevos ({{1}} es
  siempre el primer dato de la lista). El editor común está en
  `src/components/plantillas/EditorPlantilla.tsx`.
- **Pruebas**: `probar-plantillas-versiones` (32) contra el Meta simulado,
  más `probar-plantillas` (44) y `probar-whatsapp` (25) sin regresiones.
  Nombres con `_v<número>` al final quedan reservados para las versiones.
- **Verificado en producción** (13-09-2026, commit `9f02896`,
  `prod-plantillas` 9/9): el aviso firmado de Meta aprueba una versión 2 y
  pasa a usarse sola (la 1 deja de estar en uso), Chats ofrece solo la
  versión en uso, y la página de plantillas carga.

## Instagram y Facebook (Messenger) — hecho el 13-09-2026
Mismo modelo que WhatsApp: cada cliente conecta su página con las claves de
su propia app de Meta. Instagram entra por la página de Facebook a la que
está vinculada la cuenta profesional.
- **Conectar** (Canales → Facebook o Instagram → requisitos → claves,
  acción `conectarPaginaMeta`): identificador de la página, token de página
  (guía en pantalla: usuario del sistema con `pages_messaging`,
  `pages_manage_metadata`, `pages_read_engagement` y, para Instagram,
  `instagram_basic` e `instagram_manage_messages`) y clave secreta de la app.
  Se comprueba la página con Meta (`comprobarPagina`: nombre y cuenta de
  Instagram vinculada), se suscribe la app a la página
  (`suscribirAppAPagina`) y las claves van al Vault. El canal de Facebook se
  identifica por la página y el de Instagram por la cuenta de Instagram
  (`channels.identificador_externo`; `configuracion` guarda `page_id`,
  `page_nombre`, `instagram_id`, `instagram_username`). Queda "pendiente"
  hasta que Meta verifica el webhook.
- **Recibir**: dirección `/api/meta/<id del canal>` (una por canal; la de
  WhatsApp sigue en `/api/whatsapp/meta/…`). El cliente la pega en su app en
  Webhooks → objeto **Page** (campos messages, messaging_postbacks,
  message_deliveries, message_reads) o **Instagram** (messages). Firma
  `X-Hub-Signature-256` con la clave de la app. Cada canal solo atiende su
  objeto y su página/cuenta; los ecos (lo que envía la propia página) no se
  guardan; los avisos repetidos no duplican; el nombre del contacto se pide a
  Meta (`perfilDeContacto`); las fotos, vídeos, audios y archivos se
  descargan del enlace temporal y van al almacén privado (si no se puede,
  el mensaje entra igual diciéndolo); un botón pulsado entra con su texto;
  entregas y lecturas actualizan `estado_envio`.
- **Enviar** (`salida.ts` → `enviarPorPagina` → `enviarTextoPagina`): texto
  por `POST /{página}/messages` (Messenger) o `POST /{cuenta de
  Instagram}/messages`, con `messaging_type: RESPONSE`. Más de 2000
  caracteres (1000 en Instagram) sale en varios mensajes. Sin plantillas.
- **Ventana de 24 h**: igual que WhatsApp pero sin plantillas: la IA no
  contesta fuera de ella (la conversación queda bloqueada hasta que el
  cliente vuelva a escribir), Chats bloquea el recuadro y lo explica, y si
  Meta rechaza un envío por la ventana (código 10, subcódigo 2018278 /
  2534022) el mensaje queda "fallido" con el motivo.
- **Pruebas**: `probar-paginas-meta` (26) contra el Meta simulado (páginas,
  perfiles, suscripción, envíos por página, avisos de Page e Instagram).
- **Para clientes de fuera**: mientras la app está en modo desarrollo, solo
  funciona con páginas de cuentas con rol en la app; para clientes reales
  Meta tiene que revisar los permisos de mensajería (App Review).

## Token de Meta que caduca — hecho el 11-09-2026
El token de la pantalla de pruebas de Meta dura 24 h. Al conectar (o cambiar
claves) se pregunta a Meta cuándo caduca (`debug_token`) y se guarda en
`channels.token_caduca_en`; si caduca, la tarjeta de WhatsApp lo avisa con la
fecha. Si Meta no lo dice, no se avisa de nada y la conexión sigue igual. En
"Cambiar claves" hay una guía para crear un token de "usuario del sistema"
que no caduca.

## Ventana de 24h y plantillas (WhatsApp oficial) — hecho el 11-09-2026
WhatsApp solo deja escribir libremente a un cliente durante las 24 h
siguientes a su último mensaje; después, solo con una plantilla aprobada por
Meta.
- **La cuenta de WhatsApp Business** (`channels.meta_waba_id`): se pide al
  conectar (está en la misma página de Meta que el identificador del número)
  y se comprueba con Meta que el número es de esa cuenta. Meta guarda las
  plantillas por cuenta, no por número.
- **Plantillas** (Canales → Gestionar plantillas,
  `src/app/actions/whatsapp-plantillas.ts`): se crean en Respondi y se mandan
  de verdad a Meta para revisión (antes se guardaban aquí con el aviso
  "enviada a revisión" pero nunca llegaban a Meta). "Actualizar desde Meta"
  trae también las creadas directamente en Meta y quita las que se hayan
  borrado allí. Meta avisa de los cambios de estado (aprobada, rechazada con
  su motivo, pausada, desactivada) por el mismo webhook, en el campo
  `message_template_status_update`, que el cliente tiene que activar en su
  app (se le indica al conectar).
- **Enviar desde Chats**: Chats calcula la ventana desde el último mensaje
  del cliente en cualquiera de sus conversaciones con la sucursal. Con la
  ventana cerrada, bloquea el recuadro de texto y ofrece "Enviar plantilla":
  se elige una aprobada, se rellenan sus huecos ({{1}}, {{2}}...) con vista
  previa, y sale hacia Meta como plantilla (`messages.plantilla`), guardando
  en Chats el texto ya rellenado. Como cualquier mensaje de una persona,
  pausa la IA. Cuando el cliente contesta, la ventana se abre sola.
- **Límites de hoy**: se envían plantillas con huecos en el cuerpo, cabecera
  de texto, pie y botones fijos. Las que llevan foto, vídeo o documento en la
  cabecera, huecos en la cabecera o botones que cambian en cada envío, o
  huecos con nombre ({{nombre}}), aparecen en la lista pero marcadas como que
  aún no se pueden enviar desde Respondi. Desde Respondi solo se crean de tipo
  Utilidad o Marketing, con cuerpo de texto.
- **Plantillas con foto, vídeo o documento en la cabecera y con botones**
  (12-09-2026): se envían desde Chats. La ventana pide lo que falte —el
  archivo, el hueco del título, el final del enlace de un botón o el código
  de un botón «copiar»— y el archivo se sube a Meta en el momento del envío
  (su identificador dura 30 días, así que en un reintento se vuelve a subir).
  El archivo se guarda además en el almacén privado, así que el mensaje
  enviado se ve con su foto en Chats. Lo que sigue sin poder enviarse:
  cabecera de UBICACIÓN y botones de catálogo, formulario o código de un solo
  uso. Desde Respondi solo se **crean** plantillas de texto; las de foto se
  crean en Meta y se traen con «Actualizar desde Meta».
- **La plantilla de reapertura** (la que manda la IA sola pasadas 24 h) solo
  admite plantillas que no piden nada: sin archivo, sin huecos en la cabecera
  y sin botones que haya que rellenar.
- **Pruebas**: `probar-plantillas` (44 comprobaciones) contra el Meta
  simulado, más un recorrido en navegador (`captura-plantillas`) que adjunta
  una foto de verdad.

## Canal de email (hecho el 11-09-2026)
Decidido con Jorge: **opción A**, el negocio conecta **su propio buzón**
(IMAP para leer, SMTP para enviar) y la IA contesta desde su dirección. Se
eligió frente a un proveedor de correo entrante (reenvío a una dirección de
Respondi) porque no hay que tocar DNS ni reenvíos: pone su correo y una
contraseña y listo. Leer y enviar son piezas separadas en
`src/lib/canales/correo.ts`, así que otra forma de recibir o enviar se añade
sin tocar el resto.
- **Conectar** (Canales → tarjeta Email → `ConectarCorreo.tsx`, acción
  `conectarCorreo`): dirección, proveedor y contraseña. El proveedor se
  detecta solo por la dirección (`detectarProveedorCorreo`: dominios
  conocidos y, si no, a qué servidores le llega el correo a ese dominio) y
  rellena los servidores (`src/lib/canales/proveedores-correo.ts`: Gmail/
  Workspace, IONOS, Hostinger, OVHcloud, Zoho —con su región—, Yahoo,
  iCloud u "Otro" a mano). Antes de guardar se entra en el buzón y en el
  servidor de salida; la contraseña va a la caja fuerte (Vault) y la
  pantalla nunca la recibe. Nombre del remitente y firma, opcionales.
  "Cambiar datos" sin escribir la contraseña mantiene la guardada.
- **Gmail, Yahoo e iCloud** piden una *contraseña de aplicación* (no la
  normal); la ventana lo explica con el enlace.
- **Outlook / Hotmail / Microsoft 365 no se pueden conectar todavía**:
  Microsoft ya no deja entrar en el buzón con contraseña (exige su inicio de
  sesión OAuth). Se detecta y se explica; queda en pendientes.
- **Leer**: cron `revisar-correos` cada minuto (pg_cron →
  `/api/cron/revisar-correos`, solo si hay algún buzón activo). Lee la
  bandeja de entrada desde el momento de conectar (nunca lo antiguo), hasta
  20 correos por pasada. Se saltan respuestas automáticas, rebotes,
  boletines y listas, y lo que manda el propio buzón. Del texto se quita lo
  citado del correo anterior. Lo leído se apunta con
  `guardar_lectura_correo`, que solo toca eso (antes se guardaba la
  configuración entera y podía pisar una firma recién cambiada).
- **Contestar**: la IA usa el mismo motor y herramientas, con otra forma de
  escribir (`src/lib/ai/estilo-email.ts`): saludo con el nombre, párrafos,
  despedida, sin formato de chat y sin firmar (la firma se añade sola). La
  respuesta —de la IA o de un agente desde Chats— sale "Re: asunto" dentro
  del mismo hilo (In-Reply-To/References) y se deja copia en Enviados
  (Gmail lo hace solo). En Chats se ve el asunto de cada correo.
- **Adjuntos**: entran todos los archivos del correo (`messages.adjuntos`), y
  se ven en Chats con un enlace temporal. El primero va también en `media_url`,
  que es lo que mira la IA para las fotos.
- **Sin ventana de 24 h**: en correo se puede contestar cuando sea.
- **Errores**: si el proveedor rechaza la contraseña, el canal pasa a
  "error" con el motivo en su tarjeta; un fallo pasajero solo se apunta y se
  reintenta al minuto. Al conectar, el canal no pasa a activo hasta tener la
  contraseña guardada (si no, la revisión de ese minuto lo marcaba con
  error: pasó en las pruebas).
- **Recomendación a los clientes**: un buzón de atención al cliente
  (info@, hola@…), no uno personal, porque la IA contesta todo lo que llega.
- **Pruebas**: `probar-correo` (29 comprobaciones) con un buzón de pruebas
  real de Ethereal (IMAP/SMTP que no entregan a nadie), y `captura-correo`
  en navegador (ventana, detección de Gmail, aviso de Hotmail, Chats, móvil).

## Investigación de competidores (v2)
Analizados Neople.io, Aurora Inbox y Chatwoot (sugerido por Andreina)
como inspiración para la v2 — documentos de ideas priorizadas
generados para revisar con Andreina. De ahí salió la decisión de
subnicho Shopify (ver `docs/estado/pendientes.md` y
`docs/integraciones/`).
