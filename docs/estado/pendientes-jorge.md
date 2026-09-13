# Pendientes de Jorge — configuración en servicios externos

Lo que solo puede hacer Jorge desde fuera de Respondi (cuentas, claves,
dominios). Estado a 13-09-2026. Cuando cierres un punto, márcalo aquí.

## Ya hecho
- [x] **Stripe** (13-09-2026): claves puestas en las variables de Vercel.
      Falta pegar la dirección del webhook cuando se conecte en el código
      (Claude te la dará).
- [x] **Shopify** (13-09-2026): tienda de pruebas
      `respondi-pruebas.myshopify.com` conectada con una app personalizada
      (10 permisos, 6 webhooks a la dirección de Respondi, versión 2026-01).
- [x] **Meta / WhatsApp** (13-09-2026): app "Respondi Pruebas" publicada,
      número de pruebas +1 (555) 172-6062 registrado en la Cloud API, campo
      `messages` suscrito, app suscrita a la cuenta de WhatsApp Business y
      conversación completa probada (horario, servicios, huecos y reserva).
      El token guardado no caduca.

## Por hacer

### 0. URGENTE — reponer lo que borraron las pruebas (13-09-2026)
Las baterías de pruebas automáticas borraron tres cosas reales de tu
sucursal de pruebas (lo cuento en `incidentes-resueltos.md`): el canal de
WhatsApp con sus claves, la tienda de Shopify con su token y la reserva que
hiciste con la IA. Las claves no se pueden recuperar; el resto sí. Claude
puede reponer las filas con los **mismos identificadores** (así el webhook
de Meta y los seis webhooks de Shopify siguen apuntando bien) en cuanto le
digas «repón lo borrado». Después te toca a ti:
- [ ] **WhatsApp**: Canales → tarjeta WhatsApp → «Cambiar claves» → pegar
      otra vez el identificador del número, el de la cuenta de WhatsApp
      Business, el token (el permanente que generaste) y la clave secreta de
      la app. No hay que tocar nada en Meta: la dirección del webhook y el
      código de verificación son los mismos.
      Si prefieres conectar sin que Claude reponga nada, también funciona,
      pero saldrán una dirección de webhook y un código nuevos y habrá que
      pegarlos en la app de Meta.
- [ ] **Shopify**: lo más sencillo es hacer el punto 7 (la app de Respondi)
      y conectar con un clic; los avisos se registran solos. Si quieres
      volver a conectar con la app personalizada, el token ya no se puede
      ver: en Shopify → Apps → Desarrollar apps → la app → desinstalar y
      volver a instalar te da un token nuevo, y lo pegas en Tienda online
      con la clave de firma de los webhooks.
- [ ] **Reserva**: Claude la vuelve a crear (lunes 14-09 a las 11:00, corte
      de pelo con Carlos, a nombre de Jorgito) o la haces tú desde la agenda.
- [ ] Decidir si creamos una **sucursal solo para pruebas** dentro de tu
      organización, para que tus datos reales no convivan con las baterías.
      Es lo recomendable antes de meter clientes.

### 1. Whaticket — preguntar a su soporte
Su API solo envía mensajes; no hay forma documentada de que avisen a
Respondi de los que entran. Hasta que contesten, en Canales sigue como
"todavía no disponible". Mándales esto (por su chat de soporte o correo):

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
- [ ] Respuesta recibida → pasársela a Claude para decidir

### 2. Correo del negocio (probar el canal de email)
- [ ] Usar un Gmail que no sea personal (la IA contesta todo lo que llega);
      si hace falta, crear uno solo para pruebas.
- [ ] En esa cuenta de Google → Seguridad → activar la verificación en dos
      pasos.
- [ ] https://myaccount.google.com/apppasswords → crear una contraseña de
      aplicación llamada "Respondi" y copiar las 16 letras.
- [ ] En Respondi (sucursal de pruebas) → Canales → tarjeta Email → pegar la
      dirección y las 16 letras. Respondi detecta Gmail solo y comprueba el
      buzón antes de guardarlo.
- [ ] Mandarse un correo a ese buzón desde otro: la IA debe contestar en
      un minuto.

### 3. Correos que manda Respondi por su cuenta (dominio propio)
Hoy las invitaciones a usuarios salen desde `onboarding@resend.dev`, que
Resend **solo entrega al correo del dueño de la cuenta de Resend**: a
cualquier otra persona no le llega. Los futuros avisos de créditos bajos
saldrán por el mismo sitio. Hace falta un dominio propio.
- [ ] Decidir el dominio. Recomendación: comprar ya el dominio definitivo
      de Respondi (también hará falta para la dirección de la app, la
      política de privacidad de Meta y Stripe). Mientras tanto valdría un
      subdominio de propulsesystem.com.
- [ ] Resend → Domains → Add domain → añadir los tres registros DNS que da
      (SPF, DKIM y retorno) donde se compró el dominio → Verify.
- [ ] Vercel → Settings → Environment Variables: comprobar que existe
      `RESEND_API_KEY` en producción.
- [ ] Vercel → Settings → Environment Variables → añadir `RESEND_FROM` con
      el remitente en ese dominio, por ejemplo `Respondi <avisos@tudominio.com>`
      (el dominio tiene que ser el verificado en Resend). Volver a desplegar.
      Sin la variable, los correos siguen saliendo por el remitente de
      pruebas de Resend.
- [ ] Supabase → Authentication → SMTP Settings: poner el SMTP de Resend
      para los correos de registro y de "olvidé mi contraseña" (el
      remitente por defecto de Supabase tiene un límite de unos pocos
      correos por hora). Claude guía este paso cuando haya dominio.

### 4. OpenAI — que no se vuelva a cortar
- [ ] https://platform.openai.com → Settings → Billing → **Auto recharge**
      activado (por ejemplo, al bajar de 10 $ recargar 50 $; la cifra la
      decide Jorge).
- [ ] Settings → Limits → presupuesto mensual y aviso por correo.
- [ ] La clave que hay en Vercel es de ese mismo proyecto (la actual
      funciona; nada que cambiar).

### 5. Instagram y Facebook — el código ya está (13-09-2026)
- [ ] Convertir la cuenta de Instagram a **cuenta profesional** y
      vincularla a la página de Facebook (Instagram → Configuración →
      Centro de cuentas, o desde la página de Facebook).
- [ ] En la app de Meta "Respondi Pruebas": Añadir producto → **Messenger**
      y **Instagram**.
- [ ] Token de página que no caduque: business.facebook.com/settings →
      Usuarios del sistema → el usuario "Respondi" (o crear uno) → Asignar
      activos: la página y la cuenta de Instagram (control total) y la app →
      Generar token con la app y los permisos `pages_messaging`,
      `pages_manage_metadata`, `pages_read_engagement`, `instagram_basic`,
      `instagram_manage_messages`, caducidad "Nunca". Copiarlo.
- [ ] El identificador de la página: en la página de Facebook →
      Configuración → Información de la página (abajo).
- [ ] En Respondi → Canales → Facebook → Conectar: pegar identificador de la
      página, el token y la clave secreta de la app. Después, en la app de
      Meta → Webhooks → objeto **Page** → pegar la dirección y el código que
      da Respondi, verificar, y activar `messages`, `messaging_postbacks`,
      `message_deliveries`, `message_reads`.
- [ ] Igual para Instagram: Canales → Instagram → Conectar (misma página,
      mismo token) y en la app → Webhooks → objeto **Instagram** → pegar la
      dirección y el código y activar `messages`.
- [ ] Probar: escribir a la página por Messenger y a la cuenta por Instagram
      desde otra cuenta con rol en la app (mientras la app esté en modo
      desarrollo solo funcionan esas). Para clientes reales, pedir a Meta la
      revisión de esos permisos (App Review).

### 6. Stripe — el código ya está (13-09-2026)
- [ ] Comprobar en Vercel que `STRIPE_SECRET_KEY` es la clave **de prueba**
      (`sk_test_…`) mientras probamos. Con una clave real se crearían
      productos y cobros de verdad.
- [ ] En Stripe (modo prueba) → Developers → Webhooks → **Add endpoint**:
      dirección `https://respondi.vercel.app/api/stripe/webhook`, y marcar
      estos sucesos: `checkout.session.completed`, `invoice.paid`,
      `invoice.payment_failed`, `customer.subscription.created`,
      `customer.subscription.updated`, `customer.subscription.deleted`.
- [ ] Copiar la **clave de firma** del webhook (`whsec_…`) y ponerla en Vercel
      como `STRIPE_WEBHOOK_SECRET` (producción). Volver a desplegar.
- [ ] En Stripe → Settings → Billing → Customer portal: activar el portal y
      permitir actualizar el método de pago y cancelar la suscripción.
- [ ] Probar: en Superadmin → Planes pulsar «Sincronizar con Stripe»; luego,
      con la organización de pruebas, Facturación → «Elegir y pagar» con la
      tarjeta de prueba 4242 4242 4242 4242. El plan se activa solo y los
      créditos se recargan.
- [ ] Cuando se pase a cobrar de verdad: cambiar las claves por las reales
      (`sk_live_…`) y crear el webhook también en modo real.

### 7. Shopify — la app de Respondi (el código ya está, 13-09-2026)
Con esto los clientes conectan su tienda con un clic, sin tokens ni
webhooks a mano (las apps personalizadas ya no se pueden crear desde el
1 de enero de 2026). Hace falta una sola app, creada una vez:
- [ ] Entrar en https://dev.shopify.com (Dev Dashboard) con la cuenta con la
      que creaste la tienda de pruebas. Si pide crear una organización de
      desarrollo, crearla (es gratis).
- [ ] **Create app** → nombre «Respondi» → crear desde cero (no desde la
      CLI) .
- [ ] En **Versions / Configuration** de la app:
      - App URL: `https://respondi.vercel.app`
      - Allowed redirection URL(s):
        `https://respondi.vercel.app/api/tiendas/shopify/oauth/callback`
      - Distribución: **Custom distribution** (para instalar en tiendas
        concretas, sin tienda de apps). Si en su momento se quiere la tienda
        de apps, se cambia entonces.
      - Access scopes: `read_products, read_inventory, read_orders,
        read_fulfillments, read_customers, write_customers, read_shipping,
        read_content, write_draft_orders, write_discounts`
      - Guardar / **Release** la versión.
- [ ] En la app → **Settings** (o "Client credentials"): copiar el
      **Client ID** y el **Client secret**.
- [ ] Vercel → Settings → Environment Variables (producción): añadir
      `SHOPIFY_CLIENT_ID` y `SHOPIFY_CLIENT_SECRET` con esos dos valores.
      Volver a desplegar.
- [ ] Probar: en Respondi (sucursal de pruebas) → Tienda online → «Cambiar
      datos» → escribir `respondi-pruebas.myshopify.com` → «Ir a Shopify e
      instalar» → aceptar → debe volver a Respondi con «Tienda conectada» y
      la tarjeta en verde «Instalada con la app de Respondi». Los seis avisos
      se registran solos (se pueden ver en Shopify → Configuración →
      Notificaciones → Webhooks).
- [ ] Después, en la tienda de pruebas se puede desinstalar la app
      personalizada antigua (ya no hace falta).

### 8. Para salir de pruebas con clientes reales (más adelante)
- Meta: cada cliente necesita verificar su empresa en Meta y añadir un
  número real (el número de pruebas solo escribe a 5 móviles).
- Shopify: con la app de Respondi (punto 7) cada cliente instala con un
  clic. Si algún día se quiere aparecer en la tienda de apps de Shopify,
  habrá que pasar su revisión.
