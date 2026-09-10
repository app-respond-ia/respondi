-- Migration: consolidar el ajuste "abrir caso fuera de horario" en una sola columna
--
-- business_profiles tenía DOS columnas para el mismo concepto:
--   - abrir_caso_fuera_horario -> la única que lee el motor de IA
--     (src/app/api/ai/process/route.ts), escrita solo por el onboarding.
--   - caso_fuera_horario       -> escrita por perfil-sucursal y por el alta
--     de sucursal, pero que NO lee nadie.
--
-- Efecto del bug: el toggle "Abrir caso automáticamente fuera de horario"
-- del panel de cliente no tenía ningún efecto real. El código ya se ha
-- migrado para escribir y leer siempre abrir_caso_fuera_horario.
--
-- Este backfill recupera la intención del usuario que se estaba perdiendo:
-- si el panel había guardado true pero la columna que lee la IA estaba en
-- false, se traslada ese true a la columna correcta.
--
-- Comprobado antes de escribir esta migración: 6 filas en total, 0
-- divergentes, 0 con intención perdida. Hoy es un no-op; se ejecuta igual
-- por seguridad e idempotencia, por si alguna fila cambia entre medias.
--
-- NO se elimina caso_fuera_horario todavía: queda para una migración
-- posterior, una vez verificado en producción que todo funciona bien
-- contra la columna correcta.

UPDATE business_profiles
SET abrir_caso_fuera_horario = true
WHERE caso_fuera_horario = true
  AND abrir_caso_fuera_horario = false;
