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
