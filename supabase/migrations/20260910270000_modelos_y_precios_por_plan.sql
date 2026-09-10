-- Asigna a cada plan un modelo verificado y su precio real.
--
-- Los precios salen de la lista de OpenAI que pasó Jorge (10-09-2026) y los
-- modelos de una prueba real contra la API con las herramientas que usa el
-- motor (etiquetar, escalar, consultar horario y catálogo):
--
--   gpt-4.1-nano   $0,10 / $0,40   funciona
--   gpt-4o-mini    $0,15 / $0,60   funciona
--   gpt-4.1        $2,00 / $8,00   funciona
--   gpt-5.6-luna   $0,20 / $1,20   RECHAZA las herramientas salvo que se le
--                                  pase reasoning_effort:'none'
--   gpt-5.6-terra  $2,00 / $12,00  igual que Luna
--   gpt-5.6-sol    $5,00 / $30,00  igual que Luna
--   gpt-6-astra    $10,00 / $50,00 no admite ni reasoning_effort:'none'
--
-- La familia gpt-5.6 y gpt-6 queda fuera a propósito hasta tocar el motor.
-- Aparte del trabajo, en la prueba consumieron el doble de tokens de entrada
-- (159 frente a 75) para la misma pregunta, así que su coste real por
-- respuesta es peor de lo que sugiere su precio por token.
--
-- Escala: cuanto más alto el plan, mejor el modelo. El cliente sigue pagando
-- 1 crédito por respuesta en todos.

UPDATE public.plans SET
  modelo_ia = 'gpt-4.1-nano',
  precio_input_usd_millon = 0.10,
  precio_output_usd_millon = 0.40
WHERE nombre = 'Trial';

UPDATE public.plans SET
  modelo_ia = 'gpt-4o-mini',
  precio_input_usd_millon = 0.15,
  precio_output_usd_millon = 0.60
WHERE nombre = 'Starter';

-- Pro y Business comparten modelo de momento: entre gpt-4o-mini y gpt-4.1 no
-- hay ningún modelo con precio confirmado para poner en medio. Cuando se
-- quiera diferenciar, gpt-4.1-mini es el candidato: está verificado que
-- funciona, solo falta su precio.
UPDATE public.plans SET
  modelo_ia = 'gpt-4.1',
  precio_input_usd_millon = 2.00,
  precio_output_usd_millon = 8.00
WHERE nombre IN ('Pro', 'Business');
