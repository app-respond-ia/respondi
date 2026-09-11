# Arquitectura — Respondi

Decisiones de diseño estructurales y el motivo detrás de cada una.
Si vas a proponer un cambio que contradiga algo de aquí, primero
entiende por qué se decidió así — pregunta antes de deshacerlo.

## Modelo de contactos ("Escenario A")
Un contacto es compartido a nivel de organización (mismo cliente
identificado igual en todas las sucursales), pero las conversaciones
activas se aíslan por sucursal — un mismo contacto puede tener una
conversación activa distinta por cada sucursal a la que escriba.

## Cada sucursal ve solo lo suyo
Decidido con Jorge el 11-09-2026: los datos de los clientes de una
sucursal no se comparten con las demás.
- **Quién entra en qué sucursal:** el propietario o un administrador de
  la organización, en todas; el resto, en las que tiene asignadas
  (`user_branches`). La regla vive en la base de datos
  (`auth_sucursales()`) y en la app (`sucursalesPermitidas()` en
  `src/lib/active-branch.ts`), y el selector de la cabecera solo ofrece
  y solo acepta esas. Solo el propietario o un administrador puede
  cambiar las sucursales asignadas.
- **Qué se separa:** conversaciones, mensajes, notas internas, etiquetas
  de conversación, casos y sus notas, y la ficha del contacto. Lo impone
  la base de datos (RLS), no solo las pantallas: un usuario no puede
  leerlos de otra sucursal ni atacando la API directamente.
- **La ficha del contacto es de cada sucursal** (`contactos_sucursal`):
  trato (normal / sin IA / bloqueado), modo, respuesta automática y nota.
  Bloquear un número en una sucursal no lo bloquea en otra. El nombre sí
  es de la persona y se comparte. Las antiguas columnas `trato`, `modo`,
  `respuesta_auto` y `nota` de `contacts` se borraron el 11-09-2026.
- **La memoria de la IA** solo usa lo hablado con esa sucursal.
- **La app trabaja siempre sobre la sucursal activa**: aunque el
  propietario pueda entrar en todas, cada pantalla enseña solo la elegida
  en el selector.
- **La configuración de cada sucursal** (catálogo, categorías de
  precios, etiquetas, reglas, skills, canales, plantillas, novedades,
  horarios, perfil, políticas) se lee desde esa sucursal, y para
  cambiarla hace falta además permiso de escritura en su sección para
  esa sucursal (`auth_puede(sucursal, sección, nivel)`). Lo impone la
  base de datos y, para dar un mensaje claro, también cada acción del
  servidor (`sinPermiso()` en `src/lib/permisos-servidor.ts`).
- **La ficha de la sucursal**: la ven quienes trabajan en ella; la editan
  con permiso de Perfil o de Sucursales. Crear o borrar sucursales en la
  base de datos, solo el propietario o un administrador; quien tiene
  permiso de Sucursales las crea a través de la acción de la app, que
  comprueba el permiso y el límite del plan y hace el alta completa como
  sistema (si no, las reglas le frenarían a mitad) y le asigna la
  sucursal nueva.
- **El límite de sucursales del plan** se comprueba en el servidor y
  contando las de toda la organización (no solo las que ve el usuario).
- **El límite de canales del plan** también es de toda la organización:
  el número que se pone en cada plan en el panel de superadmin son los
  canales en total, repartidos entre sus sucursales como quiera (el plan
  Pro trae 3 canales y 2 sucursales; como cada sucursal tiene como mucho
  uno de cada tipo, "3 por sucursal" no limitaría nada). Cuentan los que
  no están desconectados (activos, pendientes o con error) y lo comprueba
  el servidor al conectar; cambiar las claves de un canal ya conectado no
  ocupa otro hueco.
- **Registro de cambios**: cada cambio guarda su sucursal. Los de una
  sucursal los ve quien tenga permiso en ella; los de toda la
  organización (usuarios, plan, facturación...) y los anteriores al
  11-09-2026, solo el propietario o un administrador.

## Canales de mensajería
- Modelo: **cada cliente trae su propia cuenta**, sin excepción. En
  Whaticket, cada cliente paga y gestiona su propia suscripción (Respondi
  solo se conecta por API). Para el canal oficial de Meta, cada cliente
  monta su propia conexión directa a la Meta Cloud API y mete sus propias
  credenciales/tokens en su panel de Respondi — sin BSP, sin que Atsura sea
  Tech Provider ni haga Embedded Signup centralizado.
- **Sin n8n** (decidido por Jorge el 11-09-2026): la app recibe y envía
  los mensajes directamente con cada proveedor. Un sistema menos que
  mantener, y las claves de cada cliente solo están en Respondi, cifradas
  en la caja fuerte (Vault). Detalle en `docs/estado/canales-mensajeria.md`.
- Hoy funciona **WhatsApp con Meta** (Cloud API): dirección propia por
  canal para los avisos, firma comprobada, estados de envío y reintentos.
  **Whaticket queda en espera**: su API documentada solo envía, no avisa
  de los mensajes que entran.
- Canal de **email** (pendiente de construir, antes de Shopify): mismo
  motor de IA y mismas herramientas que WhatsApp, pero lógica de
  conversación distinta — sin ventana de 24h, hilos con asunto en vez
  de mensajes en tiempo real, proveedor de correo entrante que avise a la
  app. `channels.tipo` ya está preparado como enum para añadir este valor.
- Pendiente: fuera de la ventana de 24 h de WhatsApp, un mensaje de un
  agente falla y el agente ve el motivo; falta poder elegir y enviar una
  plantilla aprobada desde Chats.

## Multimedia entrante
- Imágenes: se pasan directo a la IA la primera vez; después se
  guarda una descripción de texto (`contenido`) para reutilizar en el
  historial sin volver a mandar la imagen.
- Audio: se transcribe solo bajo demanda (cuando la IA lo necesita),
  no automáticamente al llegar; la transcripción se cachea igual, una
  sola vez, y vive en Next.js.
- Documentos (PDF, Word): la IA no los procesa por ahora — el agente
  confirma la recepción y el caso se marca para revisión humana.

## Jerarquía de pausa/horario de la IA
Orden de prioridad para si la IA responde a un mensaje:
1. Conversación en pausa manual (`conversations.ia_pausada`)
2. Trato/modo del contacto
3. Apagado manual de la sucursal (`sucursales.modo_pausa`: solo
   controla 'apagada' vs 'ninguna')
4. Horario comercial (el comportamiento fuera de horario lo deciden
   `business_profiles.modo_horario_ia` y `abrir_caso_fuera_horario`, NO
   `modo_pausa`)
5. Responde normal

El horario real del negocio (consultable por la IA bajo demanda) está
separado del horario en que responde la IA (3 modos:
`mismo_negocio`/`personalizado`/`siempre_activa`, en `route.ts` Fase 1).

## Chats, conversaciones y casos
Tres cosas distintas que no hay que mezclar:
- **Chat** = una persona (el contacto). La lista de Chats saca una fila por
  persona: su conversación abierta o, si no tiene, la última, con cuántas
  lleva con la sucursal. Los filtros miran esa conversación (quien está
  hablando no sale en "Cerradas" por tener conversaciones viejas cerradas).
- **Conversación** = una sesión con esa persona. Es lo que resume la IA y lo
  que recuerda la próxima vez.
- **Historial del cliente** (`/dashboard/conversaciones/<id>`): todas sus
  conversaciones con la sucursal en un hilo, de la más antigua a la más
  reciente; las anteriores plegadas en su resumen. Se llega desde la lista
  de Conversaciones o con "Ver historial" en Chats. Es para consultar; se
  atiende en Chats.
- **Las notas internas son de la persona**: se guardan en la conversación
  en que se escriben, pero se ven en todas las suyas de la sucursal,
  marcadas con la fecha de aquella conversación.
- **Caso** = una tarea para una persona del equipo. Solo existe cuando hace
  falta alguien.

Reglas (decididas con Jorge el 11-09-2026, verificadas con
`contrato-conversaciones`, 40 comprobaciones):
- La conversación nace con el primer mensaje y **no abre caso**. Un caso lo
  abren: el escalado de la IA, fuera de horario con "abrir caso" activado, los
  créditos agotados, el trato "derivar" del contacto, tres fallos seguidos de
  la IA, o una persona a mano.
- **Una conversación, como mucho un caso** (índice `unique_active_case`). Un
  segundo motivo se anota en el caso; un escalado sobre un caso resuelto lo
  reabre (`crearCasoDesdeSistema`).
- **Cerrar la conversación resuelve su caso y resolver el caso cierra la
  conversación**, por cualquier camino, y siempre se genera el resumen
  (`src/lib/conversaciones/cierre.ts`).
- Se cierra sola tras **24 h sin actividad**; cuenta cualquier mensaje, también
  los de la IA y los agentes. Excepción: si espera a que abra el negocio
  (`motivo_bloqueo = 'fuera_horario'`) no se cierra, porque al cliente se le
  prometió respuesta al abrir.
- **La IA y las personas no se pisan:**
  - La IA contesta los mensajes del cliente que nadie ha contestado
    (`agrupado` sin marcar y posteriores al último mensaje de un agente). Un
    mensaje que llega mientras la IA contesta el anterior se recoge en la
    pasada siguiente.
  - Cuando una persona escribe, la IA se pausa en esa conversación y lo que
    el cliente había escrito queda como contestado.
  - Si una persona toma la conversación mientras la IA está pensando, la
    respuesta de la IA se descarta y no se cobra.
  - Tomar un caso o ponerlo "atendiendo" pausa la IA. Soltarlo lo devuelve a
    la cola (pendiente, sin agente) y la IA sigue en pausa.
- **Reabrir**: una conversación reabierta vuelve con la IA en pausa y sin
  bloqueos viejos, y no se puede si el cliente ya tiene otra abierta por ese
  canal. Un caso reabierto se queda en su conversación si sigue abierta, se
  lleva a la actual del cliente si ya ha vuelto a escribir, o reabre la suya;
  nunca queda colgado de una conversación cerrada.

## Herramientas de la IA
La IA (fase 2 del motor) tiene herramientas propias, no solo texto:
- Puede etiquetar la conversación usando las categorías configuradas
  por esa sucursal en `message_categories`
- Puede escalar a un humano usando las reglas de esa sucursal en
  `case_rules`
- **Regla de oro**: nunca etiquetas ni reglas inventadas, solo las que
  existan de verdad para esa sucursal

Búsqueda de catálogo (`price_list`): NO usa RAG/embeddings — usa una
herramienta con filtros estructurados (categoría, subcategoría,
precio) + etiquetas por producto, porque los vectores dan resultados
aproximados en vez de precisos para datos estructurados.

Políticas del negocio: SÍ usan RAG real (texto troceado en fragmentos
+ embeddings + pgvector). Admite dos formas de alimentarlo a la vez:
texto manual y documentos subidos (PDFs) — ambos como fragmentos en
la misma tabla, sin distinción para la IA.

Resumen de conversación (`conversations.resumen`): no se genera tras
cada respuesta de la IA — es una tarea periódica aparte, cuando una
conversación lleva 24h sin actividad.

## Sistema de créditos
1 mensaje respondido por la IA = 1 crédito. Movimientos en
`message_quotas` (`tipo`: abono/debito: dirección; `origen`:
consumo_ia/recarga_manual/recarga_plan: matiz consultable). Pasarela
de pago: Stripe (diseñado desde el principio, en curso). Además del
plan mensual, el usuario puede comprar créditos sueltos (paquetes
puntuales fuera del ciclo mensual).

Cuando Stripe esté conectado: el cambio de plan de una organización
con `stripe_subscription_id` no nulo solo se podrá hacer desde el
portal de Stripe, no manualmente desde el panel — para evitar
desincronización entre la base de datos y la suscripción real.

## Permisos y roles
`roles_personalizados` (nivel 1-5, `es_propietario`) es el sistema
real. La columna legacy `rol` en `users` puede desincronizarse de
`es_propietario` — origen repetido de bugs de permisos (revisar antes
de tocar cualquier lógica de permisos). Por eso las reglas nuevas
tratan como "administrador de la organización" a quien tenga
`rol = 'admin'` **o** `es_propietario` (`auth_es_admin_org()`), y la
app igual (`getMisPermisos().esAdmin`). A qué sucursales entra cada
uno: ver "Cada sucursal ve solo lo suyo".

Ojo: el enum `seccion_permiso` de la base de datos no coincide con las
secciones que guarda la app en `roles_personalizados.permisos` (la app
usa `contactos` y `facturacion`, que el enum no tiene; el enum tiene
`blacklist`, `roles` y `soporte`, que la app no usa). Por eso las reglas
nuevas usan `auth_puede()`, que recibe la sección como texto; la antigua
`auth_has_permission()` no puede preguntar por `contactos`.

## Manejo de errores del sistema
`registrarError()` (`src/lib/errores.ts`) es la función central —
mismo patrón que `registrarAuditoria()`, usa `supabaseAdmin`, nunca
lanza excepción. Cubre tanto orígenes externos (n8n, api_meta, llm,
db, cron) como internos (`origen: 'app'`, Server Actions).

## Papeleo de canal WhatsApp oficial (no código, contexto de negocio)
- BSP: Gupshup (no 360dialog) — sin cuota fija, pago por mensaje.
- Modelo de cuenta individual por cliente (ver arriba, "Canales de
  mensajería") — Atsura NO centraliza ni gestiona cuentas de clientes.
