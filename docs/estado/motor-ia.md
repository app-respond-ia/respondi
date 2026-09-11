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

## RAG de políticas del negocio
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
`conversations.resumen` — no se genera tras cada respuesta. Pendiente
como pieza futura: tarea periódica que lo genera cuando una
conversación lleva 24h sin actividad.

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
