-- Precio de los tokens por plan, para poder calcular el margen real.
--
-- El modelo de negocio es: 1 crédito de Respondi = 1 respuesta de la IA, sea
-- cual sea el modelo. Lo que cambia entre planes es QUÉ modelo se usa (los
-- caros solo en los planes altos), no cuántos créditos gasta el cliente.
--
-- Eso significa que el margen depende del modelo: una respuesta de gpt-4o
-- cuesta bastante más que una de gpt-4o-mini, pero el cliente paga lo mismo,
-- un crédito. Hasta ahora el precio estaba fijo en el código
-- (`PRICING` en generarRespuesta.ts: 0,20 y 1,20 por millón de tokens),
-- así que en cuanto el modelo pasó a ser configurable por plan, el coste
-- estimado que se guarda en `ai_logs` dejó de ser fiable para cualquier plan
-- que no usara ese modelo.
--
-- Se guardan junto a `modelo_ia`, en el propio plan. Si dos planes usan el
-- mismo modelo hay que poner el mismo precio en los dos; se acepta esa
-- duplicación a cambio de no montar un catálogo de modelos aparte, que
-- llevaría su propia pantalla de gestión.
--
-- Los valores por defecto son los que estaban en el código. Hay que
-- revisarlos con la lista de precios real de OpenAI antes de fiarse de los
-- informes de consumo.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS precio_input_usd_millon numeric NOT NULL DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS precio_output_usd_millon numeric NOT NULL DEFAULT 1.20;

COMMENT ON COLUMN public.plans.precio_input_usd_millon IS
  'Coste en USD por millón de tokens de entrada del modelo de este plan. Solo para calcular el margen, no afecta a lo que paga el cliente.';
COMMENT ON COLUMN public.plans.precio_output_usd_millon IS
  'Coste en USD por millón de tokens de salida del modelo de este plan.';
