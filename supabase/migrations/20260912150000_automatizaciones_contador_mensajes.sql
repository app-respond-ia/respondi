-- Freno de seguridad del motor de automatizaciones: cuántos mensajes ha
-- mandado cada ejecución. Con esto se puede poner un tope diario por sucursal
-- y que una automatización mal configurada no acribille a los clientes ni
-- dispare la factura de Meta.
ALTER TABLE public.automatizaciones_ejecuciones
  ADD COLUMN IF NOT EXISTS mensajes_enviados smallint NOT NULL DEFAULT 0;

-- Para contar deprisa los de hoy en una sucursal
CREATE INDEX IF NOT EXISTS idx_automatizaciones_ejecuciones_mensajes
  ON public.automatizaciones_ejecuciones (branch_id, created_at)
  WHERE mensajes_enviados > 0;
