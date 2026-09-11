-- El plan Pro pasa a gpt-4.1-mini (11-09-2026). Pro y Business compartían
-- gpt-4.1 porque entre gpt-4o-mini (Starter) y gpt-4.1 no había ningún modelo
-- con precio confirmado. Precio oficial de OpenAI para gpt-4.1-mini (nivel
-- estándar): 0,40 $ por millón de tokens de entrada y 1,60 $ de salida.
-- Queda: Trial gpt-4.1-nano · Starter gpt-4o-mini · Pro gpt-4.1-mini ·
-- Business gpt-4.1. Pendiente que se decidió con Jorge ("hazlo tú").
UPDATE public.plans
SET modelo_ia = 'gpt-4.1-mini',
    precio_input_usd_millon = 0.40,
    precio_output_usd_millon = 1.60
WHERE nombre = 'Pro';
