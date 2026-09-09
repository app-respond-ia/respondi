# Estado — Motor de IA (Respondi)

Ver `docs/arquitectura.md` para el diseño de fondo (jerarquía de
pausa, herramientas, RAG). Aquí va el estado real de construcción.

## Modelo
OpenAI GPT-5.6 Luna (no Anthropic/Claude) — decisión tomada tras
comparar costes.

## Jerarquía de pausa/horario — estado
Reescrita la lógica de horario en `route.ts` (Fase 1) para separar el
horario real del negocio (consultable por la IA bajo demanda) del
horario en que responde la IA (3 modos: `mismo_negocio`/
`personalizado`/`siempre_activa`). **En producción, pero sin la misma
ronda de pruebas reales escenario-por-escenario que sí se hizo para
el resto de la jerarquía** — ver `docs/estado/pendientes.md`,
Prioridad 2.

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

## Pendiente — Bloqueado por falta de credenciales
Toda prueba real end-to-end del motor de IA (créditos incluidos) está
bloqueada por falta de `OPENAI_API_KEY` — ver
`docs/estado/pendientes.md`, Prioridad 2 (Fase 0).

## Sueltos relacionados (ver `docs/estado/pendientes.md`)
- Auditoría completa de FKs faltantes en el esquema (ej.
  price_list/categorias_precios ya corregido; confirmar
  skills/skills_globales)
- Ronda de pruebas rigurosa escenario-por-escenario de toda la
  jerarquía de pausa/horario, antes de tener clientes reales
