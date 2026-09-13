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
- [ ] Decirle el dominio a Claude: cambia el remitente en el código.
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

### 5. Instagram y Facebook (para cuando esté construido en Respondi)
- [ ] Convertir la cuenta de Instagram a **cuenta profesional** y
      vincularla a la página de Facebook. Nada más por ahora.

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

### 7. Para salir de pruebas con clientes reales (más adelante)
- Meta: cada cliente necesita verificar su empresa en Meta y añadir un
  número real (el número de pruebas solo escribe a 5 móviles).
- Shopify: desde el 1 de enero de 2026 los comerciantes ya no pueden crear
  "apps personalizadas": los clientes reales necesitarán una app del Dev
  Dashboard con enlace de instalación (pendiente en el código).
