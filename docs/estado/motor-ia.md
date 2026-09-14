# Estado — Motor de IA (Respondi)

Ver `docs/arquitectura.md` para el diseño de fondo (jerarquía de
pausa, herramientas, RAG). Aquí va el estado real de construcción.

## Modelo
OpenAI, y **lo define el plan** (`plans.modelo_ia`), editable desde
`/superadmin/planes`: los modelos más capaces solo en los planes altos. El
cliente paga 1 crédito por respuesta sea cual sea el modelo, así que el
margen depende del plan; por eso el precio por token vive también ahí
(`precio_input_usd_millon` / `precio_output_usd_millon`).

Modelos verificados contra la API con las herramientas del motor:
`gpt-4.1-nano`, `gpt-4o-mini`, `gpt-4.1-mini`, `gpt-4o` y `gpt-4.1`. La
familia `gpt-5.6` (Luna, Terra, Sol) rechaza las herramientas salvo que se le
pase `reasoning_effort: 'none'`, y `gpt-6-astra` no admite ni eso: quedan
fuera del selector hasta tocar el motor.

## Jerarquía de pausa/horario — estado
Reescrita la lógica de horario en `route.ts` (Fase 1) para separar el
horario real del negocio (consultable por la IA bajo demanda) del
horario en que responde la IA (3 modos: `mismo_negocio`/
`personalizado`/`siempre_activa`). Probada escenario por escenario el
10-09-2026 (ver `incidentes-resueltos.md`).

## Qué contesta la IA y cuándo se aparta
Resumen; el detalle y el porqué están en `docs/arquitectura.md`, sección
"Chats, conversaciones y casos".
- El cron (`disparar_webhook_ia`, cada 20 s) recoge una conversación cuando
  hay mensajes del cliente sin contestar, ha pasado la ventana de agrupación
  y no han pasado 6 h.
- Antes de guardar su respuesta, la IA vuelve a mirar la conversación: si
  mientras pensaba una persona la pausó o la cerró, la respuesta se descarta
  (queda en `ai_logs` como `pausa` con su coste) y no se cobra crédito.
- Su respuesta cuenta como actividad para el cierre de 24 h.
- **Nunca promete una persona sin avisar a nadie.** La instrucción se lo
  prohíbe, pero el modelo a veces se la salta (visto en pruebas: "te pongo en
  contacto con una persona" sin usar escalar_humano). Si la respuesta parece
  prometerlo y no ha escalado, se le pide que la revise: o escala de verdad,
  o la reescribe sin prometerlo. Cada vez que pasa queda en `error_logs`
  ("La IA prometió una persona sin escalar…") para poder vigilarlo. Sin el
  escalado activado, la instrucción le dice que no puede ofrecerlo.
  Verificado con `probar-promesas` (13 escenarios, incluido quitar la regla
  de "hablar con un humano" para forzar el fallo).

## Herramientas de la IA (Fase 2 del motor)
- Etiquetar conversación → usa `message_categories` configuradas por
  sucursal
- Escalar a humano → usa `case_rules` configuradas por sucursal
- Regla de oro: nunca inventa etiquetas ni reglas fuera de lo
  configurado para esa sucursal
- Con la tienda conectada (12-09-2026): buscar_en_tienda, estado_del_pedido,
  enlace_de_compra, apuntar_lista_espera, detectar_intencion,
  presupuesto_de_tienda; cada una existe solo si su automatización está
  encendida (`docs/integraciones/shopify.md`)
- Con la agenda activada (12-09-2026): ver_huecos, reservar_cita,
  cambiar_cita, cancelar_cita, mis_citas, apuntar_espera_agenda; solo toca
  las citas del contacto que escribe y lo raro abre un caso
  (`docs/integraciones/agenda.md`)

## Búsqueda de catálogo
NO usa RAG/embeddings — herramienta con filtros estructurados
(categoría, subcategoría, precio) + etiquetas (`price_list.etiquetas`)
por producto. Decisión: los vectores dan resultados aproximados, mal
encaje para datos estructurados.

## RAG de políticas del negocio (verificado el 12-09-2026)
Sí implementado de verdad: `policy_fragments` (texto troceado +
`embedding vector`, confirmado uso real de pgvector) +
`policy_sources` (origen: texto manual o PDF subido). Ambas formas de
alimentarlo conviven para el mismo negocio, guardadas como fragmentos
en la misma tabla, sin distinción para la IA.

## Multimedia — ver también `docs/arquitectura.md`
- Imágenes: directo a la IA la primera vez; después se cachea una
  descripción de texto en `messages.contenido`
- Audio: transcripción solo bajo demanda, cacheada una vez, vive en
  Next.js
- Documentos (PDF/Word): no procesados por la IA — el agente confirma
  recepción y el caso pasa a revisión humana

## Resumen de conversación
`conversations.resumen` se genera cuando la conversación lleva 24 h parada
(cron `job_resumen_inactividad` cada 30 min → `/api/ai/summarize`, que además
la cierra) y cuando una persona la cierra desde Chats. Ese resumen es lo que
la IA lee la próxima vez que escribe ese cliente, así que se acuerda de lo que
encargó. Verificado el 12-09-2026 (`probar-resumenes`, 6 comprobaciones).

## Consumo de créditos
Ver `docs/estado/creditos-facturacion.md` — 1 mensaje respondido = 1
crédito, vía RPC `descontar_credito_ia`.

## Skills
Tablas `skills` (por tenant/sucursal, con `skill_global_id`) y
`skills_globales` (catálogo base, `cliente_puede_toggle`,
`activa_por_defecto`). Pendiente confirmar si faltan FKs entre ambas
(ver Sueltos, abajo).

## Pendiente — Herramienta de presupuestos
La skill "Hacer presupuestos" está visible/activable en el panel como
las demás, pero sin ninguna herramienta real detrás todavía (hoy solo
reutiliza `consultar_catalogo`). Construir la herramienta real es
tarea aparte, futura.

## Probado de punta a punta (10-09-2026)
Ya no está bloqueado: con la clave puesta se hicieron tres rondas de pruebas
reales contra `/api/ai/process`, en total 30 escenarios. Guiones en el
scratchpad de la sesión, merece la pena repetirlos al tocar el motor.

- **Herramientas** (11): horario por día, precio exacto del catálogo,
  búsqueda por característica, políticas por RAG, novedades del día, idioma
  del cliente, escalado con caso, etiquetado y agrupación de mensajes.
- **Comportamiento** (15): agrupación y marcado de mensajes, no cobrar sin
  responder, producto oculto a la IA, filtro por precio, etiqueta de
  respaldo, sucursal sin nada configurado, memoria de conversaciones
  anteriores, resúmenes (con y sin caso pendiente), seguridad de los
  endpoints y recuperación tras 3 fallos seguidos de OpenAI.
- **Multimedia** (4): imagen leída y descrita, audio transcrito y contestado,
  PDF avisado y derivado.

Por el camino salieron cinco fallos graves, todos corregidos y documentados
en `incidentes-resueltos.md`: el modelo escrito a fuego que impedía responder,
el doble cobro de créditos, el escalado que nunca creaba caso, el cobro sin
respuesta y el bloque entero de multimedia.

## Sueltos relacionados (ver `docs/estado/pendientes.md`)
- Auditoría completa de FKs faltantes en el esquema (ej.
  price_list/categorias_precios ya corregido; confirmar
  skills/skills_globales)
- Ronda de pruebas rigurosa escenario-por-escenario de toda la
  jerarquía de pausa/horario, antes de tener clientes reales

## Presupuestos y búsqueda en el catálogo (11-09-2026)
- **`hacer_presupuesto`** (skill "Hacer presupuestos", apagada por defecto):
  la IA le pasa los productos y las cantidades y la herramienta calcula
  partidas y total con los precios reales del catálogo
  (`src/lib/ai/presupuesto.ts`). El modelo no hace cuentas: se equivocaba
  multiplicando y sumando. Lo que tiene precio "desde" sale como mínimo
  orientativo; lo "a consultar" no se suma; lo que no existe o es ambiguo
  se le devuelve aparte para que lo diga o pregunte.
- **Búsqueda sin tildes ni plurales** (`src/lib/ai/comparar-texto.ts`): el
  buscador del catálogo comparaba el texto tal cual y "tartas de limon" no
  encontraba "Tarta de limón", así que al cliente se le decía que no
  existía. Ahora buscador y presupuestos comparan igual: sin mayúsculas,
  tildes ni plurales, también en categorías y características.
- Pruebas: `probar-presupuestos` (5 comprobaciones con la IA real, estables
  en varias pasadas).

## Modelos por plan y redes de seguridad (11-09-2026)
Trial `gpt-4.1-nano` · Starter `gpt-4o-mini` · Pro `gpt-4.1-mini` · Business
`gpt-4.1`. Los modelos baratos siguen peor las instrucciones de usar
herramientas (en las pruebas: contestar de memoria sobre normas del local, no
etiquetar, responder en español a un inglés, no pasar a una persona a quien la
pedía). Para que valga con cualquier modelo:
- **Etiquetado obligatorio**: si la IA contesta sin etiquetar y la
  conversación no tiene ninguna etiqueta, se le pide solo eso, obligando a
  usar la herramienta.
- **El cliente pide una persona** y la IA no ha escalado: se le pide que lo
  revise con las reglas de caso delante (escala con la que encaje o
  reescribe). Hermana de la red de las promesas.
- **Políticas**: instrucción de consultarlas SIEMPRE antes de responder sobre
  condiciones o sobre qué se permite.
- **Idioma**: recordatorio al final de la conversación, que es donde más caso
  hacen los modelos pequeños.
Con esto, en varias pasadas de `probar-motor-ia`: Business 100 %; Pro y
Starter, la mayoría de pasadas perfectas y algún fallo suelto (una novedad
del día sin mencionar, un inglés). Es el precio de los modelos baratos.
- **Identificadores que no existen** (12-09-2026): la IA a veces se inventa el
  identificador de la regla de caso o de la etiqueta (visto con `gpt-4.1` en
  un correo). Ahora las herramientas solo admiten los identificadores que
  existen (`enum`), y si en una revisión elige una regla que no existe se
  escala con la de "quiere hablar con una persona". Si aun así no se puede
  pasar a nadie, la IA reescribe su respuesta sin prometerlo (antes se
  cambiaba entera por una frase fija de chat, que en un correo quedaba fatal).

## Correo (11-09-2026)
Mismo motor y herramientas; cambia la forma de escribir
(`src/lib/ai/estilo-email.ts`): saludo con el nombre, párrafos, despedida,
sin formato de chat y sin firma (se añade sola). La IA ve el asunto de cada
correo del cliente. Detalle del canal en `docs/estado/canales-mensajeria.md`.

## Ventana de 24 h al abrir (11-09-2026)
Antes de gastar un crédito, si la conversación es de WhatsApp y han pasado
más de 24 h desde el último mensaje del cliente, no se genera respuesta (no
llegaría): se manda la plantilla de reapertura de la sucursal si la hay
(`channels.plantilla_reapertura_id`, sin cobrar) o la conversación queda
parada (`ventana_cerrada`) para el equipo, y se desbloquea sola en cuanto el
cliente vuelve a escribir.

## Qué modelo usa cada cosa (decidido con Jorge, 14-09-2026)

Jorge: «el modelo más barato en todos los planes; los planes se diferencian
por créditos, sucursales, usuarios, canales y automatizaciones».

**Todos los planes usan `gpt-4o-mini`.** No es el más barato de la lista, es
el más barato **que funciona**, que no es lo mismo. Se midió antes de
decidir, porque hasta ahora ninguna batería comprobaba la CALIDAD de la IA,
solo que las tuberías funcionaban.

`probar-modelos.mjs` manda cinco mensajes de cliente de verdad al motor y
mira qué hace con cada uno: que diga el precio real del catálogo, que ofrezca
horas de la agenda, que abra un caso cuando piden una persona (se comprueba
la fila en `cases`, no el nombre de la herramienta), que conteste en el
idioma del cliente y que no se invente un servicio que no existe. Cada caso,
tres veces, porque un modelo no contesta igual dos veces: con una sola pasada
se saca la conclusión equivocada.

| Modelo | Acierta | Coste por respuesta |
|---|---|---|
| gpt-4o-mini | 15/15 | 0,00079 $ |
| gpt-4.1-nano | 12/15 | 0,00064 $ |
| gpt-4.1 | 15/15 | 0,01105 $ |
| gpt-5.6-luna | 0/15 | no contesta |

- **Nano** es un 20 % más barato pero se salta la agenda y el idioma: no vale.
- **GPT-4.1** acierta lo mismo que 4o mini y cuesta **catorce veces más**.
  Business a tope pasa de 27 $ de coste a 3,9 $.
- **Los gpt-5.6** (Luna, Terra, Sol) no funcionan con las herramientas del
  motor: en la prueba no contestaron nada. Confirma lo que ya se sospechaba.

De paso salió un fallo real que no era del modelo: la regla de «contesta en
el idioma del cliente» iba enterrada al final de un prompt de miles de
tokens y **los tres modelos baratos se la saltaban**; solo GPT-4.1 la
respetaba. Subida al principio del prompt, 4o mini pasa de fallar a acertar
3 de 3. O sea: parte de lo que parecía «modelo malo» era prompt mal puesto.

Los demás sitios donde se llama a OpenAI:

| Para qué | Modelo | De dónde sale |
|---|---|---|
| Atender clientes | gpt-4o-mini | `plans.modelo_ia` |
| Resumir conversación | gpt-4o-mini | `RESUMEN_MODELO_IA` |
| Asistente del panel | gpt-4o-mini | `ASISTENTE_MODELO_IA` |
| Transcribir audios | whisper-1 | escrito a fuego |
| Buscar políticas | text-embedding-3-small | escrito a fuego |

El resumen tenía `gpt-5.6-luna` escrito a fuego con el comentario «mantenemos
el estándar del proyecto», y no era el estándar de nada: era el único sitio
donde se usaba, y encima más caro (0,20/1,20 frente a 0,15/0,60).

## La caché del prompt (14-09-2026)

OpenAI cobra a mitad de precio la parte del prompt que llega repetida, pero
solo cuenta el trozo del PRINCIPIO que coincide: en cuanto algo cambia, se
acabó la caché para todo lo que viene detrás.

El bloque que cambia en cada conversación (nota del contacto, resúmenes de
conversaciones anteriores, novedades del día) estaba **en medio** del prompt,
así que dejaba fuera de la caché a las instrucciones, las etiquetas y las
reglas, que son idénticas para toda la sucursal. Ahora se guarda en
`contextoDelCliente` y se pega al final. No cambia ni una palabra de lo que
lee el modelo, solo el orden.

| | Antes | Después |
|---|---|---|
| Entrada por respuesta | ~4.800 tokens | ~4.900 tokens |
| De eso, cacheado | 0 | 3.300 (67 %) |
| Coste por respuesta | 0,00079 $ | 0,00055 $ |

Un 30 % menos sin tocar la calidad. Business a tope pasa de 3,9 $ a 2,7 $ de
coste. `ai_logs.contexto_snapshot.tokens_cacheados` lo apunta en cada
respuesta, así que se puede vigilar: si baja de golpe, alguien ha metido algo
variable al principio del prompt.

**Regla para el futuro**: lo que sea igual para toda la sucursal va arriba;
lo que cambie por conversación o por día, abajo del todo.

## La IA decía «no lo tenemos» sin mirar el catálogo (14-09-2026)

Salió al montar `probar-modelos.mjs`. Preguntando «¿cuánto cuesta cortarme el
pelo?» a un negocio que **sí** lo vende, la IA contestaba 2 de cada 4 veces
«no tengo información, consulta con una barbería», **sin llamar a
consultar_catalogo**. Se fiaba de la descripción del negocio en vez de mirar
la lista de precios. Eso es mandar un cliente a la competencia.

Añadida una instrucción explícita: nunca decir que no se ofrece algo sin
haber consultado el catálogo antes; la descripción del negocio no es la lista
completa. Pasó de 2/4 a 3/4.

El 1 de 4 que queda es culpa de los datos de la sucursal de pruebas, que se
contradicen: la ficha dice «Cafetería de barrio» y el único servicio es un
corte de pelo. El modelo se agarra a la descripción. Conviene arreglar esa
ficha, y de paso vale como aviso para clientes reales: **si la descripción
del negocio contradice al catálogo, gana la descripción**.

### Pendiente de abaratar más
- **Encoger el prompt**: la caché ya se lleva el 67 %, así que el margen que
  queda es menor de lo que parecía. La lista de etiquetas no se puede quitar
  del prompt porque la herramienta solo lleva los identificadores, no los
  nombres. Lo que queda por mirar son las definiciones de las herramientas,
  que son el bloque grande y fijo.
## Transcripción de audios (14-09-2026)

Los audios de WhatsApp pasaban por `whisper-1`, que es el modelo viejo.
Ahora usan `gpt-4o-mini-transcribe` (variable `TRANSCRIPCION_MODELO_IA`).

Probado con una nota de voz real en español, en el mismo formato que manda
WhatsApp (ogg opus) y montada igual que lo hace la app (un `File` con tipo
`audio/ogg`, no un stream):

| Modelo | Precio | Tarda | Transcripción |
|---|---|---|---|
| whisper-1 | 0,006 $/min | 2.528 ms | correcta |
| gpt-4o-mini-transcribe | 0,003 $/min | 1.244 ms | correcta |
| gpt-4o-transcribe | 0,006 $/min | 1.399 ms | correcta |

La mitad de precio y el doble de rápido, con la misma transcripción palabra
por palabra. Fuente de precios: la página de precios de OpenAI de 2026.

## La batería completa del motor y el negocio de pruebas (14-09-2026)

Jorge: «quiero que pruebes todo literalmente, que rehagas el negocio con
todo lo que necesites y arreglar cada pequeña cosa; todo a prueba de fuego».

### El negocio de pruebas ahora es coherente: Peluquería Nova
La sucursal de pruebas era una «Cafetería de barrio» que vendía cortes de
pelo. Esa contradicción hacía fallar a la IA y falseaba las pruebas.
`rehacer-negocio.mjs` (scratchpad) la convierte, **por las mismas acciones
del panel que usa Jorge**, en una peluquería de Madrid con todo lo que hay
que probar:
- Ficha: Peluquería Nova, Fuencarral 42, Europe/Madrid, EUR, tono cercano,
  horario L-V 9-14 y 16-20, sábado 9-14, domingo cerrado. La IA contesta
  siempre (`siempre_activa`) para que las pruebas no dependan de la hora; el
  caso «fuera de horario» se prueba aparte cambiándolo.
- Precios: 9 servicios reservables con distintas duraciones (corte 15 €/30
  min, tinte 45 €/90 min con 30 de espera, mechas 60 €/120, corte infantil,
  barba, lavado, keratina, un «desde 35» y un «a consultar») y 5 productos,
  uno de ellos oculto a la IA (`visible_ia=false`) para comprobar que no lo
  ofrece. El servicio «pelo» de la reserva de Jorge se renombra a «Corte de
  pelo» conservando su id.
- Agenda: activa, 2 h de antelación, cancelar hasta 24 h antes, grupos desde
  4. Tres profesionales: Carlos (horario de la sucursal, hace todo), Ana
  (martes a sábado 10-19, color y peluquería, sin barba) y Luis (solo
  mañanas, barbería). Ana está **bloqueada en la agenda** esta semana además
  de la novedad que lo dice: la novedad sola no quita huecos.
- 6 etiquetas + «Otros» de respaldo; 6 reglas de escalado con prioridades
  (reclamación alta, reacción alérgica urgente, factura baja, grupo media);
  5 políticas procesadas (cancelación 24 h y 50 %, pagos, devoluciones 14
  días, mascotas, garantía del color 7 días); 2 novedades (Ana de vacaciones,
  10 % en color); las 8 skills encendidas.
- Se conserva todo lo de Jorge: canal de WhatsApp, tienda, Jorgito con su
  conversación y su reserva.

La skill **«Hacer presupuestos» está oculta para clientes** en Superadmin
(`visible_cliente=false`), así que ningún cliente puede encenderla desde su
panel. Para la sucursal de pruebas se dio de alta a mano. Decisión pendiente
de Jorge: hacerla visible (cualquier negocio con lista de precios la quiere).

### La batería: `probar-negocio-completo.mjs`
Habla con el motor como un cliente de verdad, con el OpenAI real, y comprueba
**efectos** (filas en la base), no palabras: que la cita exista y sea de ese
día y esa hora, que el caso se abra con su prioridad, que la etiqueta sea la
que toca, que la IA quede pausada, que el saldo no se mueva cuando no debe.
42 escenarios en diez grupos: precios y catálogo, presupuestos, horario y
ubicación, agenda (pedir, ver, mover y cancelar en una sola conversación;
profesional que no hace ese servicio; antelación; día cerrado; grupo grande;
corte infantil solo con Carlos), escalado (persona, reclamación, reacción
alérgica, factura, PDF), políticas, novedades, idioma (inglés, francés) y
trato (nota del contacto «de usted»), memoria (hilo de la conversación y
conversaciones cerradas anteriores), adjuntos (nota de voz real, foto), y las
reglas del sistema (sin créditos, pausa por agente y escribir como agente,
fuera de horario y desbloqueo, contacto sin IA, ventana de 24 h).

Los mensajes se meten directamente y se llama al motor local; las respuestas
salen por el canal real de Jorge pero contra el Meta simulado
(`META_SIMULADO_ACEPTA_CUALQUIER_TOKEN=1`), así que nunca llegan a Meta ni a
un móvil, y su canal no se toca. Cada conversación nace con el candado
`ia_procesando_desde` puesto para que el reloj de producción no la conteste.

### Lo que salió y se arregló en el motor
Primera pasada: 57 bien, 17 mal. Tras separar fallos reales, pruebas mal
escritas y variación del modelo, en el motor se cambió:
- **La dirección no le llegaba a la IA.** A «¿dónde estáis?» contestaba «en
  el centro de Madrid» (lo único que decía la descripción). Ahora el prompt
  lleva nombre y dirección de la sucursal.
- **Negaba servicios sin mirar el catálogo** («¿hacéis manicura?» → «no»).
  Red de seguridad: si la respuesta niega algo y no consultó el catálogo, se
  le obliga a consultarlo y contestar de nuevo.
- **Buscar por categoría.** «Servicios de color» traía el tinte y no las
  mechas (la palabra no salía en su nombre). Si lo buscado es el nombre de
  una categoría, entran todos los de esa categoría.
- **Las novedades del día se las callaba** a veces (con «10 % en tintes»
  activo, al precio del tinte no lo mencionaba). Instrucción más fuerte y red
  de seguridad: si un aviso de hoy afecta a lo que pregunta y no lo menciona,
  se reescribe la respuesta incluyéndolo.
- **«¿Me cobráis si cancelo?» lo trataba como cancelar.** Miraba la agenda,
  veía que no había cita y contestaba «no tienes ninguna cita» sin decir
  nunca la norma de las 24 h. Dos cosas: la red de la agenda ya no actúa
  ante una pregunta de condiciones, y una red de políticas fuerza la consulta
  y reescribe la respuesta con plazos y cifras exactos.
- **Un daño o reacción tras un servicio no escalaba.** A «me pica la cabeza
  y tengo rojeces desde el tinte» contestaba «consulta con un profesional».
  La revisión de escalado salta ahora también cuando el cliente describe un
  daño (no solo cuando pide una persona), y la instrucción prohíbe consejos
  médicos.
- **Un grupo grande abría caso pero la IA seguía contestando.** Ahora la
  agenda pausa la IA al abrir caso, igual que `escalar_humano`.
- **Un PDF: decía «una persona lo revisará» sin avisar a nadie.** El caso de
  un archivo que la IA no puede leer se abre en código, con la regla
  «documento no procesable» si existe, y se pausa la IA.
- **«Voy a proceder a reprogramarla… un momento» sin hacerlo.** La revisión
  de agenda tiene ahora dos pasos con herramientas (mirar huecos y luego
  cambiar), y «proceder», «reprogramar» y «un segundo» cuentan como promesa
  sin hacer.
- **Los modelos baratos copian mal los identificadores de las citas** y luego
  «no la encuentran» para cancelar o mover. Si el cliente solo tiene una
  cita, la herramienta la usa aunque el id venga mal.
- **«Por la tarde» es desde las 15:00**, en el filtro de huecos, en la
  instrucción y en la prueba (antes 14:00 en el código y sin definir en el
  prompt).
- **El registro de herramientas usadas** (`ai_logs.contexto_snapshot.usadas`)
  solo apuntaba la primera pasada: las redes de seguridad y la agenda no
  aparecían. Ahora recoge todas.
- Al derivar, «una persona del equipo», no «un humano» ni «he escalado».

Y en la pasada de estabilidad (cada escenario dos y tres veces), lo que solo
sale una de cada tres o cuatro veces:
- **«¿Me la puedes cambiar a la última hora que tengas?» → «¿te gustaría que
  lo confirmara?»** sin cambiarla. Esa frase no dice «cita» ni «reserva» y
  la red de agenda no entraba. Ahora basta con que pida la acción (cambiar,
  mover, pasar a, adelantar, retrasar, aplazar, cancelar), con o sin tilde.
  La batería exige que la cambie en la misma respuesta.
- **Una promoción que no se decía.** La red de novedades creía que «10 % en
  tintes y mechas» ya estaba dicha porque «más» se reducía a la raíz «m» y
  «mechas» «empezaba por» ella. Las raíces de menos de 3 letras ya no valen,
  y las palabras que usó el propio cliente («tinte») no cuentan como prueba
  de que se mencionó el aviso. De paso, la ñ se conserva al comparar
  («uñas» se convertía en «unas», palabra vacía, y no se buscaba).
- **«¿Cuánto cuesta un corte?» acababa en «dime día y hora» sin precio.**
  La red del presupuesto forzaba `hacer_presupuesto` en cualquier «cuánto
  cuesta», y una vez la respuesta decía «para proceder con la reserva…», que
  la red de agenda tomaba por una promesa y reescribía sin el precio. Ahora
  el presupuesto solo se fuerza si pide un total o el precio de varias cosas
  (dos llamadas menos por pregunta de precio), «proceder» y «reprogramar»
  solo cuentan como promesa en primera persona, y la reescritura tiene que
  conservar lo que ya decía.
- **Un cambio de hora que acabó en cancelación.** Con `cancelar_cita` y
  `cambiar_cita` a mano en la revisión de agenda, a «cámbiamela a la última
  hora» el modelo una vez la canceló y el cliente se quedó sin cita. Ahora,
  si pide cambiar, `cancelar_cita` ni se le ofrece (y al revés si pide
  cancelar), y las instrucciones dicen que «la última» o «la primera» hora
  es la de la lista de `ver_huecos`. Con eso la cambia a la primera, sin
  revisión, 4 de 4 veces.
- **Una foto sin descripción guardada.** El prompt dice «SIEMPRE llama a
  guardar_descripcion_imagen», pero una de cada cinco veces el modelo se lo
  saltaba (sobre todo si además consultaba el catálogo). Sin descripción, la
  foto se vuelve a mandar a OpenAI en cada turno y el panel no sabe qué era.
  Ahora hay una red que se lo obliga (llamada forzada solo a esa
  herramienta) y, si copia mal el id y solo hay una foto, se usa esa.
- **Una nota de voz: «¿qué tipo de corte prefieres?» en vez de dar horas.**
  El modelo llamaba a ver_huecos sin el servicio, y la agenda preguntaba.
  Ahora, si no lo pasa o no cuadra, la agenda lo busca en las palabras del
  propio cliente («cortarme el pelo» → «Corte de pelo»); para eso las raíces
  de palabras entienden verbos y pronombres pegados (cortarme, cortar, corte
  → «cort»). Y la transcripción del audio ya queda en memoria para las redes
  de seguridad, que antes veían el mensaje de audio en blanco.
- **`ai_logs.contexto_snapshot.revisiones`**: qué redes de seguridad han
  saltado en cada pasada (las primeras palabras de cada «REVISIÓN:»). Sin
  esto no había forma de saber si una respuesta rara venía del modelo o de
  una revisión; con esto se encontraron las tres anteriores en minutos.
- La batería tiene `CONSERVAR=1` para dejar las conversaciones y sus
  `ai_logs` sin borrar y poder mirarlos.

Y en las baterías antiguas: las de agenda apartan los servicios reservables
del negocio real mientras corren; el canal de prueba del Meta simulado
reutiliza la fila del WhatsApp real (solo cabe uno por sucursal) y la
salvaguarda la repone; se quitaron las comprobaciones del flujo «pedir plan
para que lo apruebe superadmin», que Jorge eliminó el 13-09.

### Resultado final (14-09-2026)
Cuatro pasadas completas de la batería grande con el OpenAI real: 17 fallos
en la primera, 3 en la segunda, 6 en la tercera (una regresión por el
identificador de cita, dos redes de seguridad peleándose, el PDF sin caso y
la variación de la promoción) y **78 de 78 en la cuarta**. Después, una
pasada de estabilidad con cada escenario dos veces (`REPS=2`): 155 de 156,
y ese fallo (el «¿te gustaría que lo confirmara?») destapó los de una entre
tres o cinco veces que cuenta la lista de arriba. Cada uno se reprodujo
aparte (el escenario 3 a 6 veces seguidas, con `CONSERVAR=1` para leer las
`revisiones`), se arregló y se volvió a pasar la batería entera: 76 de 78,
77 de 79, 78 de 79 y **79 de 79 en la última**, con el catálogo, la agenda
y los adjuntos repetidos 3 a 6 veces cada uno sin fallar.

Barrido de todas las baterías antiguas contra el negocio nuevo, una detrás
de otra: whatsapp 25/25, plantillas 44/44, plantillas-versiones 32/32,
páginas de Meta 26/26, agenda 52/52, reserva pública 37/37, bloqueos 6/6,
créditos y planes 13/13, Stripe 23/23, app de Shopify 29/29,
automatizaciones 29/29, motor de automatizaciones 73/73 (el único fallo del
barrido, una plantilla rechazada que no se podía volver a enviar, está en
`incidentes-resueltos.md`) y asistente 44/44.

Coste: la cuenta de pruebas pasó de 3005 créditos (tras la recarga) a
2342 (unas 660 respuestas de la IA, contando las pasadas de estabilidad y las repeticiones de cada fallo) entre todas las pasadas; ya no hay «saldo a 7», Jorge usa esa
cuenta y se le dice la cifra.

Lo que sigue sin cerrar de este tramo está en `pendientes.md` («Esperando
una decisión de Jorge»): la skill de presupuestos oculta y la etiqueta única
por conversación.
