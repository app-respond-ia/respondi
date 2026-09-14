# Pendientes de Jorge — configuración en servicios externos

Lo que solo puedes hacer tú desde fuera de Respondi: cuentas, claves,
dominios. Estado a 14-09-2026. Están ordenados por lo que desbloquea más.
Cuando cierres un punto, márcalo aquí.

**Empieza por el 1 y el 2**: son diez minutos y dejan la cuenta de pruebas
funcionando otra vez. El resto puede esperar al día que tengas rato.

---

## 1. Volver a pegar las claves de WhatsApp (5 minutos)

Las pruebas automáticas borraron tu canal de WhatsApp con sus claves (lo
cuento en `incidentes-resueltos.md`). **Ya te he repuesto la fila con su
mismo identificador**, así que en Meta no hay que tocar absolutamente nada:
la dirección del webhook y el código de verificación son los de siempre.
Solo faltan las claves, que no se pueden recuperar.

- [ ] Respondi → **Canales** → tarjeta de WhatsApp (la verás en rojo, con el
      motivo escrito) → **Cambiar claves**.
- [ ] Pega las cuatro cosas de tu app de Meta. Dónde está cada una:

      **1 y 2. Identificador del número y de la cuenta de WhatsApp Business.**
      developers.facebook.com → tu app «Respondi Pruebas» → menú izquierdo
      WhatsApp → **Configuración de la API**. En esa pantalla salen los dos,
      uno debajo del otro: «Identificador del número de teléfono» e
      «Identificador de la cuenta de WhatsApp Business». Son números largos,
      no son secretos, se pueden copiar tal cual.

      **3. Clave secreta de la app.** Misma web → Configuración → **Básica** →
      «Clave secreta de la app» → botón **Mostrar** (te pedirá la contraseña
      de Facebook). Esta sí es secreta: no la pegues en ningún chat.

      **4. Token permanente.** Este NO se puede volver a ver: Meta solo lo
      enseña una vez, al generarlo. Hay que sacar uno nuevo, que tarda medio
      minuto y no rompe nada (el viejo simplemente deja de usarse):
      business.facebook.com/settings → **Usuarios del sistema** → el usuario
      «Respondi» → **Generar token** → elige la app «Respondi Pruebas»,
      marca `whatsapp_business_messaging` y `whatsapp_business_management`,
      y en caducidad pon **Nunca** → Generar. Cópialo en ese momento.

      Aviso: ninguna de las cuatro se puede recuperar de Respondi. El token y
      la clave secreta iban cifrados en la caja fuerte y se borraron con las
      pruebas; los dos identificadores estaban en la fila del canal, que
      también se borró. Por eso hay que ir a Meta a por ellos.
- [ ] Guarda. Si el canal se queda en «pendiente», entra en tu app de Meta →
      WhatsApp → Configuración → Webhooks y pulsa **Verificar y guardar** otra
      vez con la misma dirección y el mismo código. No hace falta cambiarlos.
- [ ] Escríbete un WhatsApp al número de pruebas: la IA debe contestar en
      menos de un minuto.

## 2. Volver a conectar la tienda de Shopify (5 minutos)

Igual que arriba: te he repuesto la fila de la tienda con su mismo
identificador, así que **los seis avisos que pegaste a mano en Shopify siguen
apuntando bien**. Falta el token.

El token de la app personalizada ya no se puede volver a ver. Tienes dos
caminos:

- **El bueno**: haz primero el punto 7 (crear la app de Respondi en Shopify)
  y conecta con un clic. Los avisos se registran solos y no vuelves a tocar
  un token nunca más.
- **El rápido**: Shopify → Configuración → Apps y canales de venta →
  Desarrollar apps → tu app → desinstalar y volver a instalar. Eso te da un
  token nuevo. Pégalo en Respondi → **Tienda online** junto con la clave de
  firma de los webhooks.

- [ ] Hecho, por el camino que sea.

---

## 3. Whaticket — escribir a su soporte

Su API solo envía mensajes; no hay forma documentada de que avisen a
Respondi de los que entran. Hasta que contesten, en Canales sigue como
«todavía no disponible». Mándales esto por su chat de soporte o por correo:

```
Hola,

Estamos integrando Whaticket con nuestra plataforma de atención al cliente por IA
(Respondi). Con la API pública ya podemos enviar mensajes (POST /api/v1/messages),
pero necesitamos también recibir los mensajes entrantes en nuestro sistema.

Dos preguntas:

1. ¿Existe alguna forma (webhook, callback o similar) de que Whaticket envíe a una
   URL nuestra cada mensaje que recibe una conexión, con el número del cliente, el
   texto y los archivos adjuntos? Si existe, ¿dónde se configura y qué formato tiene?

2. En conexiones por QR, ¿cada mensaje enviado por API consume créditos de
   Whaticket? ¿Y en conexiones por API Cloud (Meta)?

Gracias,
Jorge — Propulse System LLC
```

- [ ] Mensaje enviado
- [ ] Respuesta recibida → pásamela y decidimos

## 4. Correo del negocio — probar el canal de email

- [ ] Usa un Gmail que no sea personal: la IA contesta todo lo que llegue.
      Si hace falta, crea uno solo para esto.
- [ ] En esa cuenta de Google → Seguridad → activa la verificación en dos
      pasos.
- [ ] https://myaccount.google.com/apppasswords → crea una contraseña de
      aplicación llamada «Respondi» y copia las 16 letras.
- [ ] Respondi → Canales → tarjeta Email → pega la dirección y las 16 letras.
      Respondi detecta que es Gmail solo y comprueba el buzón antes de
      guardarlo.
- [ ] Mándate un correo a ese buzón desde otra cuenta: la IA debe contestar
      en un minuto.

## 5. Dominio propio y correos que manda Respondi

Hoy las invitaciones y los avisos de créditos salen desde
`onboarding@resend.dev`, que Resend **solo entrega al dueño de la cuenta de
Resend**. A cualquier otra persona no le llega. Hace falta un dominio.

- [ ] Decide el dominio. Mi recomendación: compra ya el definitivo de
      Respondi. Lo vas a necesitar igualmente para la dirección de la app, la
      política de privacidad de Meta, Stripe y la revisión de Shopify.
      Mientras tanto valdría un subdominio de propulsesystem.com.
- [ ] Resend → Domains → Add domain → añade los tres registros DNS que te da
      (SPF, DKIM y retorno) donde compraste el dominio → Verify.
- [ ] Vercel → Settings → Environment Variables: comprueba que existe
      `RESEND_API_KEY` en producción.
- [ ] Añade `RESEND_FROM` con el remitente en ese dominio, por ejemplo
      `Respondi <avisos@tudominio.com>`. Vuelve a desplegar. Sin esa
      variable, los correos siguen saliendo por el remitente de pruebas.
- [ ] Supabase → Authentication → SMTP Settings: pon el SMTP de Resend para
      los correos de registro y de «olvidé mi contraseña». El remitente por
      defecto de Supabase tiene un límite de unos pocos correos por hora.
      Dime cuando llegues aquí y te guío.

## 6. OpenAI — que no se vuelva a cortar

- [ ] https://platform.openai.com → Settings → Billing → **Auto recharge**
      activado. Por ejemplo, al bajar de 10 $ recargar 50 $. La cifra la
      decides tú.
- [ ] Settings → Limits → presupuesto mensual y aviso por correo.
- [ ] La clave que hay en Vercel es de ese mismo proyecto. No hay que
      cambiarla.

## 7. Shopify — crear la app de Respondi

Con esto tus clientes conectan su tienda con un clic, sin tokens ni webhooks
a mano. Las apps personalizadas ya no se pueden crear desde el 1 de enero de
2026. Es **una sola app**, creada una vez, para todos los clientes.

- [ ] Entra en https://dev.shopify.com con la cuenta con la que creaste la
      tienda de pruebas. Si te pide crear una organización de desarrollo,
      créala: es gratis.
- [ ] **Create app** → nombre «Respondi» → crear desde cero, no desde la CLI.
- [ ] En **Configuration**:
      - App URL: `https://respondi.vercel.app`
      - Allowed redirection URL(s):
        `https://respondi.vercel.app/api/tiendas/shopify/oauth/callback`
      - Access scopes: `read_products, read_inventory, read_orders,
        read_fulfillments, read_customers, write_customers, read_shipping,
        read_content, write_draft_orders, write_discounts`
      - Guarda y **publica** la versión (Release).
- [ ] **Distribución**. Aquí ojo, que te lo corregí:
      - Para **probar ahora** en tu tienda: **Custom distribution**, que
        genera un enlace para una tienda concreta y no necesita que Shopify
        revise nada.
      - Para **clientes reales**: hace falta **Public distribution**, porque
        la personalizada solo vale para una tienda. Todas las públicas pasan
        la revisión de Shopify, aunque no aparezcan en su tienda de apps
        («unlisted»), y además hay que pedirles acceso a datos protegidos de
        clientes, porque leemos nombres y correos de los pedidos. Eso pide
        dominio propio, política de privacidad y un correo de soporte, así
        que va después del punto 5.
- [ ] En la app → **Client credentials**: copia el **Client ID** y el
      **Client secret**.
- [ ] Vercel → Settings → Environment Variables (producción): añade
      `SHOPIFY_CLIENT_ID` y `SHOPIFY_CLIENT_SECRET`. Vuelve a desplegar.
- [ ] Prueba: Respondi → Tienda online → «Cambiar datos» → escribe
      `respondi-pruebas.myshopify.com` → «Ir a Shopify e instalar» → acepta.
      Debe volver con «Tienda conectada» y la tarjeta en verde «Instalada con
      la app de Respondi». Los seis avisos se registran solos.

## 8. Stripe — terminar la conexión

El código está listo desde el 13-09-2026.

- [ ] Comprueba en Vercel que `STRIPE_SECRET_KEY` es la clave **de prueba**
      (`sk_test_…`) mientras probamos. Con una real se crearían productos y
      cobros de verdad.
- [ ] Stripe (modo prueba) → Developers → Webhooks → **Add endpoint**:
      dirección `https://respondi.vercel.app/api/stripe/webhook`, y marca:
      `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
      `customer.subscription.created`, `customer.subscription.updated`,
      `customer.subscription.deleted`.
- [ ] Copia la **clave de firma** del webhook (`whsec_…`) y ponla en Vercel
      como `STRIPE_WEBHOOK_SECRET` (producción). Vuelve a desplegar.
- [ ] Stripe → Settings → Billing → Customer portal: activa el portal y
      permite actualizar el método de pago y cancelar la suscripción.
- [ ] Prueba: Superadmin → Planes → «Sincronizar con Stripe». Luego, con la
      organización de pruebas, Facturación → «Elegir y pagar» con la tarjeta
      4242 4242 4242 4242. El plan se activa solo y los créditos se recargan.
- [ ] Cuando pases a cobrar de verdad: cambia a las claves reales
      (`sk_live_…`) y crea el webhook también en modo real.

## 9. Instagram y Facebook

El código está listo desde el 13-09-2026.

- [ ] Convierte la cuenta de Instagram a **cuenta profesional** y vincúlala a
      la página de Facebook (Instagram → Configuración → Centro de cuentas, o
      desde la página de Facebook).
- [ ] En la app de Meta «Respondi Pruebas»: Añadir producto → **Messenger** y
      **Instagram**.
- [ ] Token de página que no caduque: business.facebook.com/settings →
      Usuarios del sistema → el usuario «Respondi» (o créalo) → Asignar
      activos: la página y la cuenta de Instagram con control total, y la
      app → Generar token con los permisos `pages_messaging`,
      `pages_manage_metadata`, `pages_read_engagement`, `instagram_basic`,
      `instagram_manage_messages`, caducidad «Nunca». Cópialo.
- [ ] El identificador de la página: página de Facebook → Configuración →
      Información de la página, abajo del todo.
- [ ] Respondi → Canales → Facebook → Conectar: pega identificador de la
      página, token y clave secreta de la app. Después, app de Meta →
      Webhooks → objeto **Page** → pega la dirección y el código que te da
      Respondi, verifica, y activa `messages`, `messaging_postbacks`,
      `message_deliveries`, `message_reads`.
- [ ] Igual para Instagram: Canales → Instagram → Conectar (misma página,
      mismo token) y en la app → Webhooks → objeto **Instagram** → pega la
      dirección y el código y activa `messages`.
- [ ] Prueba: escribe a la página por Messenger y a la cuenta por Instagram
      desde otra cuenta que tenga rol en la app. Mientras la app esté en modo
      desarrollo solo funcionan esas.

## 10. Antes de cobrar a clientes reales

- [ ] **Vercel a Pro**: el plan Hobby es solo para uso personal, no se puede
      usar con clientes de pago.
- [ ] **Supabase a Pro**: hace falta para la protección de contraseñas
      filtradas, entre otras cosas.
- [ ] **Meta**: cada cliente tiene que verificar su empresa y añadir un número
      real. El número de pruebas solo escribe a 5 móviles. Para clientes
      reales hay que pedirle a Meta la revisión de los permisos (App Review).
- [ ] **Shopify**: la revisión de la app pública (punto 7).
- [ ] Papeleo de canales: verificación de Atsura y registro como negocio,
      donde haga falta.

---

## Lo que necesito de ti para seguir yo

Cuando tengas estas dos cosas, avísame y las hago:

- [ ] **Google Calendar en la agenda**: necesito un proyecto en Google Cloud
      con la API de Calendar activada y unas credenciales OAuth. Te guío
      cuando quieras arrancarlo.
- [ ] **Outlook / Microsoft 365 en el correo**: necesito una app registrada
      en Microsoft Entra (el antiguo Azure AD) con permisos de correo.
