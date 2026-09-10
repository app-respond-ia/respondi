-- Abarata el cron que dispara a la IA y baja su frecuencia.
--
-- El cron `disparador-ia-agrupador` corría cada 10 segundos (~8.600 veces al
-- día). No se puede convertir en algo puramente reactivo: su trabajo no es
-- "detectar que llega un mensaje", sino "esperar a que el cliente lleve N
-- segundos sin escribir" (`sucursales.tiempo_agrupacion_seg`, 30 por defecto)
-- para agrupar varios mensajes seguidos en una sola respuesta. Esperar un
-- silencio es, por definición, comprobar cada cierto tiempo.
--
-- Lo que sí se puede es que cada comprobación cueste lo mínimo y hacerlas
-- menos a menudo:
--
-- 1. Índice parcial que cubre exactamente el filtro del cron. Hoy la consulta
--    hace un recorrido completo de `conversations`; con 5 conversaciones da
--    igual (0,24 ms), pero crece con el número de conversaciones activas.
--    El índice lo deja acotado a las que de verdad son candidatas.
--
-- 2. Cada 20 segundos en vez de cada 10: la mitad de ejecuciones. El cliente
--    nota poco: con la ventana de agrupación por defecto de 30 segundos, la
--    IA arrancaba entre los segundos 30 y 40, y ahora arranca entre el 30 y
--    el 50.
--
-- Queda pendiente para cuando haya tráfico real: guardar en `conversations`
-- quién escribió el último mensaje, para quitar la subconsulta que hoy se
-- ejecuta una vez por conversación candidata. No se hace ahora porque obliga
-- a poner un disparador en la inserción de mensajes, que es el camino más
-- caliente de la aplicación, y no compensa el riesgo por un problema que
-- todavía no existe.

CREATE INDEX IF NOT EXISTS idx_conversations_candidatas_ia
  ON public.conversations (fecha_ultimo_mensaje)
  WHERE estado = 'activa'
    AND ia_pausada = false
    AND motivo_bloqueo IS NULL;

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'disparador-ia-agrupador'),
  schedule := '20 seconds'
);
