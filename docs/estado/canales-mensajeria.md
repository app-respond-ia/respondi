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
- **Pruebas**: `probar-plantillas` (30 comprobaciones) contra el Meta
  simulado, más un recorrido en navegador (`captura-plantillas`).

## Canal de email (pendiente de construir, antes de Shopify)
Mismo motor de IA y mismas herramientas que WhatsApp/Instagram, pero
lógica de conversación distinta:
- Sin ventana de 24h
- Hilos con asunto, no mensajes en tiempo real — pueden tardar
  horas/días
- Necesita proveedor de correo entrante (Resend, ya usado para
  transaccionales, o Postmark/SendGrid) que convierta el email en
  webhook — jugando el mismo papel que n8n hace para WhatsApp
- `channels.tipo` ya es un enum preparado para añadir este valor sin
  cambios grandes de esquema
- `conversations`/`messages` ya son genéricos por canal, no atados a
  WhatsApp

## Investigación de competidores (v2)
Analizados Neople.io, Aurora Inbox y Chatwoot (sugerido por Andreina)
como inspiración para la v2 — documentos de ideas priorizadas
generados para revisar con Andreina. De ahí salió la decisión de
subnicho Shopify (ver `docs/estado/pendientes.md` y
`docs/integraciones/`).
