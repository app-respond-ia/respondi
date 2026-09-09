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

## Whaticket
Proveedor: whaticket.com. Decidido usar Whaticket en vez de montar
servidor propio (Evolution API/Baileys) para la conexión WhatsApp por
QR — menos margen a cambio de menos complejidad de mantenimiento.

**Decidido arrancar con clientes reales facturando sobre Whaticket
ya** (clientes informados de que Whaticket puede bloquearles el
número), en paralelo a la verificación de Atsura y el registro como
partner de Gupshup para el BSP — para no perder ingresos durante las
semanas de espera de esa aprobación.

## Meta oficial — BSP elegido (papeleo, no código)
Gupshup, no 360dialog — sin cuota mensual fija, solo pago por mensaje
(~0,001$ de Gupshup por mensaje; Meta solo cobra mensajes de
plantilla, no los de sesión/conversación normal). Encaja mejor sin
tener aún clientes que la cuota fija de 360dialog (250-1.000€/mes).

## Relay n8n ↔ Next.js/Supabase
n8n es simple conector de mensajes. Toda la lógica de negocio
(decisión IA-vs-humano, resolución de canal, creación de
contacto/caso, transcripción de audio) vive en Next.js/Supabase, no
en n8n. n8n sigue llamando directo a las APIs de Meta/Whaticket para
el envío de mensajes (toca los tokens) — pendiente revisar
endurecimiento de seguridad de este punto más adelante.

## Ventana de 24h (WhatsApp oficial)
Pendiente para cuando Meta oficial esté conectado de verdad: en el
panel de Chats, cuando un agente abra una conversación cuya ventana
de 24h ya se cerró, avisar de que no se puede escribir texto libre y
ofrecer elegir una plantilla aprobada para reabrir la conversación,
en vez de dejar que el envío falle sin explicación. Tabla
`whatsapp_templates` ya existe en el esquema para esto.

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
