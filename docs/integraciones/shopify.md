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
  `abrir_caso`, `etiquetar`. Frenos: una vez por cosa, tope de 500
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
- **Automatizaciones listas y probadas (5 de 37)**: Pedido confirmado,
  Pedido enviado, Pedido cancelado o reembolsado, Pedido retrasado (repaso
  diario a las 9 h de la sucursal) y Aviso de pedido grande.

### Plantillas de WhatsApp: lo que hay que saber
Un cliente que compra en la web normalmente **no te ha escrito por WhatsApp
en las últimas 24 h**, así que casi todos los avisos de pedido salen como
plantilla aprobada por Meta. Sin plantilla elegida en los ajustes, a ese
cliente no se le escribe (queda en el registro con el motivo). Los huecos de
la plantilla se rellenan siempre por orden: nombre, nº de pedido, total,
enlace. Solo valen plantillas de solo texto (sin foto ni botones que pidan
valor). Por correo no hace falta nada de esto.

### Pruebas (scratchpad de la sesión)
- `probar-tienda.mjs` — 46 comprobaciones: conexión, token en Vault y que
  no sale por ningún sitio, permisos, Shopify que frena/cae/congela, misma
  tienda en dos sitios, catálogo de 37, frenos de la pantalla.
- `probar-motor-automatizaciones.mjs` — 40 comprobaciones de punta a punta
  (Shopify simulado + Meta simulado): firma, apagada, encendida → WhatsApp
  real, no repetir, condiciones, seguimiento, ventana de 24 h, plantilla
  aprobada, registro, apagar a media espera, cron recoge lo huérfano.

### Pendiente
- Las otras 32 automatizaciones, de cinco en cinco, cada una con su prueba.
  Siguientes: Pedido entregado (Shopify avisa por `fulfillments/update`,
  no hay tema "delivered"), Falta información, Contra reembolso, Carrito
  abandonado, Aviso de stock bajo.
- Herramientas de la IA con datos de la tienda: `buscar_en_tienda`,
  `estado_del_pedido` (con comprobación de identidad), enlace de compra y
  descuento. Sin ellas, las de "Vender desde el chat" y "¿Dónde está mi
  pedido?" no pueden estar listas.
- Registrar los webhooks desde la app (hoy el cliente los pega a mano en
  Shopify; con `write_webhooks`... no: los custom apps no lo permiten por
  API, así que se queda a mano y documentado en la pantalla).
- Pasada de verificación contra una tienda de desarrollo real (Jorge crea
  la cuenta de Partner). Ahí se confirma la versión de la API.
- Editor visual de recetas ("el mapa"): el motor ya lee `automatizaciones.receta`
  cuando no está vacía, pero todavía no hay pantalla.
