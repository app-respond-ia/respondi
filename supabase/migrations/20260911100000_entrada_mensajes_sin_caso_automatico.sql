-- Entrada de mensajes: deja de abrir un caso por cada mensaje, y pone la fecha
-- del último mensaje también en las conversaciones nuevas.
--
-- `resolve_incoming_message_context` es lo primero que se ejecuta cuando entra
-- un WhatsApp (la llama /api/n8n/incoming-message). Tenía dos fallos, los dos
-- demostrados entrando por esa misma puerta:
--
-- 1. Abría SIEMPRE un caso `pendiente`, vacío, sin descripción. Eso rompía el
--    modelo que el resto de la aplicación ya daba por hecho — un caso es una
--    tarea para una persona, y el chat tiene su propio botón para crearlo
--    cuando un agente decide intervenir —, y arrastraba cuatro efectos:
--      · la bandeja de casos del agente se llenaba de un caso por conversación;
--      · al escalar, la IA reutilizaba ese caso vacío y el motivo se perdía, así
--        que el agente veía «Sin descripción…» también en los escalados reales;
--      · el resumen de 24 h no cerraba nunca la conversación (había un caso
--        pendiente), de modo que la IA nunca tenía memoria de clientes pasados;
--      · el aviso diario de «caso sin resolver» saltaba con casos que nadie
--        tenía que atender.
--
-- 2. Al crear una conversación NUEVA no ponía `fecha_ultimo_mensaje` (solo lo
--    hacía al reutilizar una existente). El cron de la IA filtra justamente por
--    esa fecha, así que el PRIMER mensaje de un cliente nuevo no se contestaba
--    nunca: la IA solo reaccionaba a partir del segundo.
--
-- Se mantiene el mismo contrato de salida. `case_id` pasa a ser el caso ABIERTO
-- de esa conversación si lo hay (o null): nadie lo usa hoy —la ruta de n8n solo
-- devuelve `message_id`—, pero así el valor sigue significando algo.
--
-- Los casos siguen abriéndose donde deben: al escalar la IA, fuera de horario
-- si la sucursal lo tiene activado, al quedarse sin créditos, por el trato del
-- contacto, tras tres fallos seguidos de la IA, o a mano desde el chat.

CREATE OR REPLACE FUNCTION public.resolve_incoming_message_context(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_canal tipo_canal,
  p_identificador_canal text,
  p_nombre_contacto text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact_id uuid;
  v_conversation_id uuid;
  v_case_id uuid;
  v_ia_pausada boolean;
BEGIN
  INSERT INTO contacts (tenant_id, canal, identificador_canal, nombre)
  VALUES (p_tenant_id, p_canal, p_identificador_canal, p_nombre_contacto)
  ON CONFLICT (tenant_id, canal, identificador_canal)
  DO UPDATE SET
    nombre = COALESCE(contacts.nombre, EXCLUDED.nombre)
  RETURNING id INTO v_contact_id;

  -- La fecha va ya en el INSERT: sin ella, una conversación recién creada
  -- nunca entra en el filtro del cron de la IA.
  INSERT INTO conversations (tenant_id, branch_id, contact_id, canal, estado, ia_pausada, fecha_ultimo_mensaje)
  VALUES (p_tenant_id, p_branch_id, v_contact_id, p_canal, 'activa', false, now())
  ON CONFLICT (tenant_id, branch_id, contact_id, canal) WHERE estado = 'activa'
  DO UPDATE SET
    fecha_ultimo_mensaje = now()
  RETURNING id, ia_pausada INTO v_conversation_id, v_ia_pausada;

  -- Ya NO se abre un caso aquí. Solo se informa del abierto, si lo hay.
  SELECT id INTO v_case_id
  FROM cases
  WHERE conversation_id = v_conversation_id
    AND estatus IN ('pendiente', 'atendiendo')
  ORDER BY fecha_apertura DESC
  LIMIT 1;

  RETURN json_build_object(
    'contact_id', v_contact_id,
    'conversation_id', v_conversation_id,
    'case_id', v_case_id,
    'ia_pausada', v_ia_pausada
  );
END;
$$;

-- CREATE OR REPLACE conserva los permisos existentes, pero se dejan escritos
-- para que el estado quede explícito en el historial: solo el servidor (con
-- service_role) puede llamarla.
REVOKE EXECUTE ON FUNCTION public.resolve_incoming_message_context(uuid, uuid, tipo_canal, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolve_incoming_message_context(uuid, uuid, tipo_canal, text, text) TO service_role;
