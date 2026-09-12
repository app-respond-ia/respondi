# Shopify — integración y automatizaciones

Decidido con Jorge el 12-09-2026. Objetivo: que la IA conteste con datos
reales de la tienda (productos, stock, precios, pedidos) y que el negocio
pueda encender **automatizaciones** (workflows) ya hechas, una a una.

## Cómo se conecta (opción A)
Cada cliente crea una **app personalizada en su propio Shopify**
(Configuración → Apps y canales de venta → Desarrollar apps → Crear app),
le da permisos de lectura y copia dos cosas en Respondi:

- el **dominio** de su tienda (`mitienda.myshopify.com`)
- el **token de acceso de la Admin API** (`shpat_…`)

El token se guarda cifrado en la caja fuerte (Vault), igual que las claves de
Meta y la contraseña del correo. Nunca vuelve a salir a ninguna pantalla.

Permisos que se piden (solo lectura en la primera fase):
`read_products`, `read_inventory`, `read_orders`, `read_fulfillments`,
`read_customers`, `read_shipping`, `read_content` (políticas de la tienda).
Para los enlaces de compra y los descuentos hacen falta además
`write_draft_orders` y `write_discounts`.

Por qué esta opción y no una app pública en la tienda de apps de Shopify: no
dependemos de que Shopify nos apruebe nada, no hace falta cuenta de Partner ni
el permiso especial de "datos personales protegidos" (lo autoriza el propio
comerciante), y encaja con la regla de oro de Respondi: cada cliente trae su
cuenta. La app pública queda para cuando interese como canal de captación.

## Motor de automatizaciones
Cada workflow es una **receta guardada**, no código suelto:

```
disparador  →  condiciones  →  acciones  →  espera  →  más acciones
```

- **Disparadores**: algo que pasa en Shopify (aviso suyo por webhook), una
  hora/fecha (cron), algo que dice el cliente en el chat, o a mano.
- **Condiciones**: importe, país, producto o etiqueta, primera compra o no,
  si aceptó marketing, canal…
- **Acciones**: mandar un mensaje (plantilla si han pasado 24 h), dejar que
  conteste la IA, abrir caso, etiquetar, avisar al equipo, llamar a Shopify.
- **Frenos de seguridad**: no escribir dos veces al mismo cliente por el mismo
  motivo, respetar las bajas de marketing, tope diario, y registro de todo.

Las 37 automatizaciones que se entregan hechas son **recetas ya escritas** de
ese mismo motor. El día que se haga el editor visual ("el mapa"), solo tendrá
que escribir esa misma receta: no hay que rehacer el motor.

Todas nacen **apagadas**. El cliente enciende las que quiera, una a una.

## Catálogo de automatizaciones (por categorías)

### Pedidos y envíos
1. ¿Dónde está mi pedido? · 2. Pedido confirmado · 3. Pedido enviado ·
4. Pedido entregado · 5. Pedido retrasado · 6. Pedido cancelado o reembolsado ·
7. Confirmar pedido contra reembolso · 8. Falta información del pedido ·
9. Cambio de dirección a tiempo

### Recuperar ventas
10. Carrito abandonado · 11. Segundo aviso con descuento ·
12. Pago iniciado sin terminar · 13. Te aviso cuando vuelva (stock) ·
14. Bajó de precio · 15. Cliente dormido · 16. Recompra / reposición

### Vender desde el chat
17. Venta asistida · 18. Carrito armado por la IA · 19. Producto relacionado ·
20. Presupuesto · 21. Reserva o lista de espera

### Posventa
22. Pedir reseña · 23. Cómo usarlo / cuidados · 24. Garantía por vencer ·
25. Cumpleaños o aniversario · 26. Cliente VIP

### Devoluciones e incidencias
27. Devolución guiada · 28. Producto dañado o equivocado · 29. Reclamación

### Para tu equipo
30. Aviso de pedido grande · 31. Aviso de stock bajo · 32. Resumen diario ·
33. Cliente esperando

### Mantenimiento (sin mensajes)
34. Importar el catálogo · 35. Importar las políticas de la tienda ·
36. Etiquetar clientes en Shopify · 37. Etiquetar conversaciones

Las de **marketing** (11, 14, 15, 19, 25) se marcan como tales: solo a quien
lo haya aceptado y con baja automática al responder "BAJA".

## Dinero: quién paga qué
- Las respuestas de la IA gastan **créditos de Respondi**, como siempre.
- Los mensajes que empieza el negocio (avisos, carrito abandonado…) van por
  plantilla y **Meta los cobra al cliente**, más caros los de marketing que los
  de utilidad. La pantalla lo avisa antes de encender cada automatización.

## Reglas de la IA con la tienda
- Puede: buscar productos con stock y precio real, decir el estado de un
  pedido (tras comprobar que es de quien pregunta), mandar enlaces de compra y
  descuentos preparados.
- No puede: reembolsar, cancelar ni editar pedidos. Eso siempre lo hace una
  persona (decidido con Jorge el 12-09-2026).
- Identidad: no se dan datos de un pedido sin que coincidan el número de
  pedido y el correo o el teléfono, salvo que escriba desde el mismo teléfono
  con el que compró.

## Cómo se prueba
Igual que con Meta: hay un **Shopify simulado** (`shopify-simulado.mjs`) que
responde como la API de verdad, para que las pruebas automáticas corran sin
depender de internet ni de una tienda. Cada automatización tiene su prueba.
Antes de dárselo a un cliente, una pasada de verificación contra una **tienda
de desarrollo real** de Shopify (gratis, la crea Jorge desde una cuenta de
Partner: el alta pide verificar un correo y aceptar su contrato, así que no
puede hacerla Claude).

## Estado (12-09-2026)

### Hecho
- **Base de datos** (migraciones `20260912140000` y `20260912150000`):
  `tiendas` (la conexión; el token en Vault vía
  `guardar/leer/borrar_credenciales_tienda`, solo `service_role`),
  `tienda_eventos` (avisos de Shopify a la espera, con clave única para no
  tratar dos veces el mismo), `automatizaciones` (cuáles tiene encendidas
  cada sucursal y con qué ajustes; `receta` vacía = la del catálogo) y
  `automatizaciones_ejecuciones` (cola + registro; clave única
  automatización+referencia = "no escribir dos veces por lo mismo";
  `mensajes_enviados` para el tope diario). RLS igual que los canales
  (permiso `canales`). Cron `automatizaciones` cada minuto, solo llama a la
  app si hay algo pendiente.
- **Cliente de Shopify** `src/lib/tiendas/shopify.ts`: GraphQL Admin API
  (versión por `SHOPIFY_API_VERSION`, por defecto `2026-01`), reintenta solo
  cuando Shopify frena (THROTTLED/429) o se cae (5xx), errores traducidos
  (token que no vale, tienda congelada, permiso que falta), dominio
  normalizado (vale el nombre, la URL de la tienda o la del panel).
  `SHOPIFY_API_URL` apunta a la tienda simulada en las pruebas.
- **Pantalla Tienda online** (`/dashboard/tienda`): conectar (se comprueba
  la tienda ANTES de guardar; el token va a Vault y no vuelve a salir),
  probar conexión, cambiar datos, desconectar (borra el secreto), aviso de
  permisos que faltan, guía paso a paso para sacar el token, y la dirección
  del webhook si se dio la clave secreta.
- **Motor** `src/lib/automatizaciones/motor.ts`: ejecuta las recetas
  (`tipos.ts` es el idioma; `catalogo.ts` las 37). Pasos construidos:
  `esperar`, `comprobar`, `mensaje` (texto o plantilla), `avisar_equipo`,
  `abrir_caso` (una conversación tiene como mucho un caso: si ya lo tiene,
  el motivo nuevo se anota en él, se reabre si estaba resuelto y sube de
  prioridad si toca), `etiquetar`. Frenos: una vez por cosa, tope de 500
  mensajes/día por sucursal, promociones solo con consentimiento, fuera de
  la ventana de 24 h de WhatsApp solo con plantilla aprobada (si no hay, se
  omite y se explica en el registro). Apagar una automatización cancela lo
  que estuviera esperando. Un paso que falla se reintenta 3 veces (5, 10,
  15 min) y luego queda en error y en `error_logs`.
- **Entrada de avisos** `/api/tiendas/shopify/[tienda]`: firma HMAC con la
  clave secreta de la app (sin ella, 403: la tienda sigue funcionando con
  los repasos), se apunta y se responde en el acto, se trata en `after()`;
  lo que se quede sin tratar lo recoge el cron.
- **Pantalla Automatizaciones** (`/dashboard/automatizaciones`): las 37 por
  categorías, todas apagadas de inicio, cada una con interruptor, detalle,
  ajustes (mensaje con huecos, esperas, plantilla de WhatsApp elegida de las
  aprobadas), avisos de "escribe al cliente" y "promoción", y el registro
  "Últimos movimientos" (hecho / no hacía falta y por qué / esperando / error).
  Las que aún no están construidas se ven en gris, "En preparación", y no
  se pueden encender.
- **Las 37 automatizaciones listas y probadas** (las 19 últimas, 12-09-2026):
  - Piezas nuevas: tabla `intereses_producto` (quién preguntó por qué y a
    qué precio; la alimenta la IA y la lista de espera), `contacts.no_promociones`
    (responder «BAJA», «STOP» o «no más avisos» corta las promociones aunque
    Shopify diga lo contrario), `price_list.origen_externo` (para importar sin
    duplicar), paso `crear_descuento` (código de un solo uso en Shopify,
    `discountCodeBasicCreate`, con caducidad), paso `pausar_ia`, paso
    `ia_responde` (la instrucción vuelve a la IA), pasos `importar_catalogo` /
    `importar_politicas`, eventos internos (`carrito_primer_aviso_enviado`
    directo; `mensaje_entrante` y `conversacion_etiquetada` por la cola
    `tienda_eventos` con tipo `interno:*`), y las etiquetas que necesita cada
    automatización se crean solas al encenderla (`ETIQUETAS_NECESARIAS`).
  - IA: `detectar_intencion` (solo con las intenciones de las
    automatizaciones encendidas: cambio de dirección, devolución, dañado,
    reclamación) lanza la automatización sobre esa misma conversación y
    devuelve a la IA cómo contestar; `apuntar_lista_espera`;
    `presupuesto_de_tienda` (con la misma red forzada que el presupuesto de
    catálogo); relacionados por tipo de producto; intereses al buscar.
  - Repasos nuevos en el cron: vuelve el stock (cada hora), bajó de precio
    (10 h), aniversario (9 h, una compra de hace un año: Shopify no guarda
    cumpleaños), dormidos y recompras (11 h), garantías (10 h), catálogo (a la
    hora elegida), políticas (lunes 5 h). Todos con `forzar`.
  - Webhooks: `checkouts/update` (pago iniciado: solo con forma de pago
    elegida y sin completar); la referencia de los avisos de checkout y de
    envío es la entrega (Shopify manda varios por el mismo objeto).
- **Por grupos**:
  - Pedidos y envíos: Pedido confirmado, Pedido enviado, Pedido entregado
    (Shopify avisa del envío con `fulfillments/update` y
    `shipment_status: delivered`; se va a por el pedido a la tienda),
    Pedido retrasado (repaso diario a las 9 h), Pedido cancelado, Confirmar
    contra reembolso (espera la respuesta; sin ella abre caso; «ha
    contestado» se vuelve a mirar en el momento), Falta información del
    pedido.
  - Recuperar ventas: Carrito abandonado (repaso cada hora de
    `abandonedCheckouts`; solo carritos de más de X horas y menos de una
    semana; Meta lo considera promoción).
  - Vender desde el chat: Venta asistida, Carrito armado por la IA, ¿Dónde
    está mi pedido? — son las herramientas de la IA (ver más abajo).
  - Posventa: Pedir reseña (marketing), Cómo usarlo, Cliente VIP (por compras
    o por gasto; etiqueta al cliente en Shopify con `tagsAdd`).
  - Para tu equipo: Aviso de pedido grande, Aviso de stock bajo (repaso
    diario a la hora elegida), Resumen diario (pedidos y ventas de la tienda
    + conversaciones, respuestas de la IA y casos pendientes), Cliente
    esperando (cada 5 min; no necesita tienda).
- **Canal por automatización** (12-09-2026): ajuste «Por dónde escribir» en
  las 18 que escriben al cliente: automático (WhatsApp si hay teléfono, si no
  correo), solo WhatsApp, solo correo, los dos. Con «los dos» cuenta dos
  mensajes. Si por el canal elegido no se puede, se explica en el registro.
  Los correos de automatización llevan su propio asunto y salen como correo
  nuevo (no se enganchan al último hilo del cliente).
- **Plantillas prediseñadas** (`plantillas-predisenadas.ts`): una por
  automatización que escribe, escrita para que Meta la apruebe (utilidad o
  marketing según las normas de Meta: carrito abandonado, vuelve el stock,
  bajó de precio, dormido, recompra, reseña y cumpleaños son marketing aunque
  parezcan avisos). Botón «Enviar a Meta para que la apruebe» en la tarjeta;
  el estado llega solo por el webhook de Meta; al aprobarse queda elegida y
  se usa sin tocar nada. Sus huecos se rellenan por nombre (`huecos`), no por
  orden. Una rechazada se borra en Meta antes de reenviarla. Texto no
  editable; «Usar otra plantilla mía» para el camino de expertos.
- **El workflow dibujado** (`describir.ts`): cada tarjeta enseña la receta
  en cristiano (disparador → condiciones → pasos), y es lo mismo que usa el
  botón de probar.
- **Editor de recetas** (`EditorReceta.tsx`, `definiciones.ts`): moldear las
  de Respondi (se guarda la receta en `automatizaciones.receta`; «Volver a la
  de Respondi» la vacía; los ajustes que la receta ya no usa se esconden) y
  crear las propias (`clave propia_*`, nombre, descripción, «es promoción»;
  tope de 20 por sucursal). Disparadores, condiciones y pasos de listas
  cerradas; `problemaDeReceta` es la única puerta y rechaza pasos que no
  existen (reembolsar), esperas de más de 30 días, etc. «Probar con un
  pedido de ejemplo» (`simularReceta`) cuenta qué haría sin hacer nada y
  avisa (sin plantilla aprobada, etiqueta inexistente, canal sin conectar).
  Las propias con reloj las lanza el cron (`lanzarPropiasProgramadas`).
- **Herramientas de la IA con la tienda** (`herramientas-ia.ts`): existen
  solo si está encendida la automatización que las gobierna —
  `buscar_en_tienda` (Venta asistida: precio de hoy, stock, enlace),
  `estado_del_pedido` (¿Dónde está mi pedido?: solo si escribe desde el
  teléfono/correo del pedido o da el correo/teléfono con el que compró; nunca
  cancela ni reembolsa) y `enlace_de_compra` (Carrito armado por la IA: crea
  un pedido borrador en Shopify y da el enlace de pago; por encima del
  importe máximo avisa al equipo y no da enlace). Dos enganches en
  `generarRespuesta.ts`, el resto fuera.
- **Cron**: acepta `{ "forzar": ["carrito_abandonado", ...] }` con la clave
  para lanzar un repaso sin esperar a su hora (lo usan las pruebas).

### Plantillas de WhatsApp: lo que hay que saber
Un cliente que compra en la web normalmente **no te ha escrito por WhatsApp
en las últimas 24 h**, así que casi todos los avisos de pedido salen como
plantilla aprobada por Meta. Sin plantilla elegida en los ajustes, a ese
cliente no se le escribe (queda en el registro con el motivo). Los huecos de
la plantilla se rellenan siempre por orden: nombre, nº de pedido, total,
enlace. Solo valen plantillas de solo texto (sin foto ni botones que pidan
valor). Por correo no hace falta nada de esto.

### Pruebas (scratchpad de la sesión; todas contra Shopify y Meta simulados)
- `probar-tienda.mjs` (46): conexión, token en Vault y que no sale por
  ningún sitio, permisos, Shopify que frena/cae/congela, misma tienda en dos
  sitios, catálogo de 37, frenos de la pantalla.
- `probar-motor-automatizaciones.mjs` (73): firma del aviso, apagada,
  encendida → WhatsApp real, no repetir, condiciones, seguimiento, ventana de
  24 h, plantilla del cliente, plantilla prediseñada (enviar, Meta aprueba
  por webhook, se usa sola con los huecos por nombre, rechazo con motivo y
  reenvío), canal (solo correo con asunto propio, los dos, solo WhatsApp sin
  teléfono, automático que cae al correo), registro, apagar a media espera,
  cron recoge lo huérfano.
- `probar-editor.mjs` (45): lo que no se deja guardar, crear una propia,
  probar con un pedido de ejemplo sin tocar nada, el motor ejecuta la receta
  del cliente (aviso, etiqueta, caso), editar, moldear una de Respondi y
  volver, espera a medias y apagar, borrar, tope de 20.
- `probar-automatizaciones-2.mjs` (29): Pedido entregado (aviso de envío →
  pedido en la tienda), Falta información, Contra reembolso (espera, sin
  respuesta abre caso; con respuesta no), Carrito abandonado (repaso forzado,
  consentimiento, no repetir), Stock bajo (una vez al día).
- `probar-automatizaciones-3.mjs` (21): Cómo usarlo (espera 0 = en el acto),
  Pedir reseña (espera un día, solo con consentimiento, con el enlace del
  ajuste), Cliente VIP (por compras y por gasto; etiqueta en Shopify), Resumen
  diario, Cliente esperando (y no la ya contestada).
- `probar-herramientas-tienda.mjs` (18, con OpenAI de verdad): precio y
  enlace reales, agotado, inexistente, estado del pedido desde su teléfono /
  con su correo / con un correo falso, nunca cancela, enlace de compra con
  borrador en Shopify, tope que avisa al equipo. Deja el saldo en 7.
- `probar-automatizaciones-4.mjs` (26): segundo aviso con descuento (evento
  interno, espera, descuento real en la tienda, y no si ya compró), BAJA,
  aniversario, lista de espera → vuelve el stock, bajó de precio, etiquetar
  conversaciones por datos de la tienda, etiquetar clientes en Shopify.
- `probar-automatizaciones-5.mjs` (27): pago iniciado sin terminar,
  cliente dormido (ventana de una semana), recompra, garantía por vencer,
  importar catálogo (categorías, precios, agotados, reimportar sin duplicar,
  retirados, no toca lo manual), importar políticas (y no reprocesar si no
  cambian).
- `probar-herramientas-tienda-2.mjs` (19, OpenAI real): devolución,
  dañado, reclamación (la IA se aparta), cambio de dirección tarde y a
  tiempo (en la misma conversación que la devolución), presupuesto con
  precios de la tienda. Esta prueba destapó dos fallos reales, ya
  arreglados: el filtro de herramientas de tienda solo conocía las cuatro
  primeras y contestaba "no disponible" a `detectar_intencion` y a
  `presupuesto_de_tienda` (la IA decía "voy a consultar y te digo"); y
  tras abrir la automatización un caso de devolución, la red de "prometió
  una persona sin escalar" volvía a escalar y pausaba la IA, con lo que
  los siguientes mensajes del cliente se quedaban sin respuesta. Ahora la
  gestión deja dicho qué ha hecho (caso, aviso, pausa) y el motor de la IA
  lo cuenta como escalado ya hecho. Y un tercero: con la devolución abierta,
  el cambio de dirección del mismo cliente no podía abrir su caso (una
  conversación, un caso) y se quedaba reintentando; ahora se anota en el
  caso que ya hay y lo sube a prioridad alta.
- `captura-shopify.mjs` (22, navegador real, ordenador y móvil): conectar
  desde la ventana, webhook, las 37 con interruptor, plantilla prediseñada
  con botón, workflow dibujado, moldear, crear una propia y probarla.
- Regresión que sigue en verde: `probar-whatsapp` (25), `probar-plantillas`
  (44), `contrato-conversaciones` (40), `probar-configuracion` (20),
  `probar-correo` (31), `probar-motor-ia` (todos los escenarios).
- Ojo con la base de datos compartida: la IA de producción contesta a
  cualquier mensaje de cliente que meta una prueba y, al fallar el envío con
  el token falso, marca el canal de WhatsApp de prueba como «error». Las
  pruebas abren la ventana de 24 h insertando el mensaje ya agrupado y con
  la IA en pausa (`abrirVentana`), no con `llegaPorMeta`.

### Verificado en producción (12-09-2026, commit `a899e2a`)
- Tras el despliegue de las 37 listas + gestiones de tienda para la IA:
  `prod-automatizaciones` 9/9 (37 listas, ninguna en preparación, todas
  apagadas, frenos, dominio inexistente contra Shopify real),
  `captura-shopify` con `PROD=1` 6/6 (ordenador y móvil, sin errores de
  JavaScript), y el reloj de la base de datos trató un aviso pendiente en
  8 s (`prod-latido`). Sin restos y saldo del inquilino de pruebas en 7.
- Ojo al comprobar despliegues: los identificadores de las server actions
  del build local no valen en Vercel (dan "Server action not found" aunque
  el despliegue esté hecho); hay que leerlos del JS de producción, como hace
  `prod-automatizaciones`, o mirar los deployments en GitHub.

### Verificado en producción (12-09-2026, commit `0f1af93`)
- Tras el despliegue de canal + plantillas + editor + 18 listas + IA:
  `prod-automatizaciones` 9/9 (18 listas / 19 en preparación, todas
  apagadas, frenos, dominio inexistente contra Shopify real),
  `captura-shopify` con `PROD=1` 6/6, y el reloj de la base de datos trató un
  aviso pendiente en 11 s (`prod-latido`).

### Verificado en producción (12-09-2026, commit `316f015`)
- Pantallas Tienda online y Automatizaciones en respondi.vercel.app, en
  ordenador y móvil, sin errores (`captura-shopify` con `PROD=1`, 6/6).
- Acciones reales contra producción (`prod-automatizaciones`, 9/9): las 37
  llegan apagadas, 5 listas / 32 en preparación, los frenos responden con
  su mensaje, y conectar un dominio inexistente llama a Shopify de verdad y
  devuelve "No existe ninguna tienda con ese dominio" sin guardar nada.
- El reloj de la base de datos (pg_cron) recogió un aviso pendiente por su
  cuenta y la app respondió `200 {"avisos":1}` en 3,8 s (`prod-latido`).
  Ojo: la clave `CRON_INTERNAL_SECRET` de `.env.local` no es la de
  producción; los crons de producción se prueban así, dejando trabajo
  pendiente, no llamándolos a mano.

### Pendiente
- Registrar los webhooks desde la app no es posible en apps personalizadas:
  se queda a mano y explicado en la pantalla.
- Pasada de verificación contra una tienda de desarrollo real (Jorge crea
  la cuenta de Partner). Ahí se confirma la versión de la API (`2026-01`).
- El mapa visual (cajas y flechas): la misma receta que ya edita el editor
  de lista; solo cambia la piel.
