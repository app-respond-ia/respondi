-- Agenda (12-09-2026), segunda parte: reservas para cualquier negocio. Solo
-- añade: tablas nuevas y columnas nuevas con valor por defecto.
--
-- El modelo, en tres piezas que se combinan:
--   · RECURSOS: lo que se ocupa (un peluquero, una mesa, una sala, una
--     máquina). Cada uno con capacidad, zona, su horario y sus bloqueos.
--   · SERVICIOS: lo que se reserva. Son los artículos de la lista de precios
--     marcados como reservables, que ganan duración, tiempos extra, huecos
--     internos, qué recursos necesitan, aforo, etc.
--   · CITAS: quién, qué, cuándo y en qué recursos. La ocupación real de cada
--     recurso va aparte (citas_recursos), porque con huecos internos no
--     coincide con la cita (el tinte: aplicar, esperar libre, aclarar).
--
-- El blindaje: dos citas no pueden ocupar el mismo recurso a la misma hora.
-- Lo impone la base de datos (restricción EXCLUDE), no el código, así que
-- aunque dos conversaciones pidan el mismo hueco en el mismo segundo, solo
-- una entra. Las clases con aforo comparten hueco (mismo `grupo`) y se
-- cuentan dentro de un candado en `reservar_cita`.

-- ---------------------------------------------------------------------------
-- 1. Ajustes de la agenda, uno por sucursal
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_ajustes (
  branch_id uuid PRIMARY KEY REFERENCES public.sucursales (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  activa boolean NOT NULL DEFAULT false,
  -- 'servicios' (peluquería, clínica, taller...) o 'restaurante' (mesas y turnos)
  modo text NOT NULL DEFAULT 'servicios' CHECK (modo IN ('servicios', 'restaurante')),
  -- Cada cuántos minutos empieza un hueco
  paso_minutos int NOT NULL DEFAULT 15 CHECK (paso_minutos IN (5, 10, 15, 20, 30, 60)),
  antelacion_minima_minutos int NOT NULL DEFAULT 120 CHECK (antelacion_minima_minutos >= 0),
  antelacion_maxima_dias int NOT NULL DEFAULT 60 CHECK (antelacion_maxima_dias BETWEEN 1 AND 365),
  max_citas_activas_por_cliente int NOT NULL DEFAULT 3 CHECK (max_citas_activas_por_cliente BETWEEN 1 AND 50),
  -- Si la IA (o el enlace) confirma directamente o deja la cita pendiente
  confirmacion text NOT NULL DEFAULT 'automatica' CHECK (confirmacion IN ('automatica', 'manual')),
  -- A partir de cuántas personas se considera grupo grande (va a una persona)
  grupo_grande_desde int NOT NULL DEFAULT 8 CHECK (grupo_grande_desde BETWEEN 2 AND 500),
  -- Hasta cuántas horas antes puede cancelar o mover el cliente
  cancelacion_horas int NOT NULL DEFAULT 24 CHECK (cancelacion_horas BETWEEN 0 AND 720),
  -- Restaurante: minutos de cortesía antes de dar la mesa por libre
  tiempo_cortesia_minutos int NOT NULL DEFAULT 15 CHECK (tiempo_cortesia_minutos BETWEEN 0 AND 120),
  -- Restaurante: turnos [{nombre, inicio, fin, ultima_entrada}] y duración
  -- según comensales [{hasta_personas, minutos}]
  turnos jsonb NOT NULL DEFAULT '[]'::jsonb,
  duracion_por_comensales jsonb NOT NULL DEFAULT '[]'::jsonb,
  aforo_por_turno int CHECK (aforo_por_turno IS NULL OR aforo_por_turno > 0),
  -- Restaurante: se pueden juntar mesas para grupos
  combinar_mesas boolean NOT NULL DEFAULT true,
  -- Lo que el negocio quiere que la IA sepa al reservar (en cristiano)
  instrucciones_ia text,
  -- Enlace público de reserva (tramo 3): el trozo de dirección y si está activo
  enlace_publico text,
  enlace_activo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agenda_ajustes_enlace_unico ON public.agenda_ajustes (lower(enlace_publico)) WHERE enlace_publico IS NOT NULL;
COMMENT ON TABLE public.agenda_ajustes IS 'Ajustes de la agenda de reservas de cada sucursal.';

-- ---------------------------------------------------------------------------
-- 2. Recursos: lo que se ocupa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recursos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.sucursales (id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 80),
  tipo text NOT NULL DEFAULT 'persona' CHECK (tipo IN ('persona', 'mesa', 'sala', 'equipo', 'otro')),
  -- Cuánta gente cabe: una persona atiende a 1; una mesa de 4, de 2 a 4
  capacidad_min int NOT NULL DEFAULT 1 CHECK (capacidad_min >= 1),
  capacidad_max int NOT NULL DEFAULT 1 CHECK (capacidad_max >= capacidad_min),
  zona text,
  color text,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  -- Si no tiene horario propio, usa el de la sucursal
  usa_horario_sucursal boolean NOT NULL DEFAULT true,
  -- ¿Se puede elegir desde el enlace público y por la IA? (una mesa no se elige)
  elegible boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recursos_branch ON public.recursos (branch_id, activo);
COMMENT ON TABLE public.recursos IS 'Lo que se ocupa al reservar: personas, mesas, salas, equipos.';

-- Horario propio de un recurso (solo si no usa el de la sucursal)
CREATE TABLE IF NOT EXISTS public.recursos_horarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.sucursales (id) ON DELETE CASCADE,
  recurso_id uuid NOT NULL REFERENCES public.recursos (id) ON DELETE CASCADE,
  dia_semana int NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  apertura time NOT NULL,
  cierre time NOT NULL,
  orden int NOT NULL DEFAULT 0,
  CHECK (cierre > apertura)
);
CREATE INDEX IF NOT EXISTS idx_recursos_horarios_recurso ON public.recursos_horarios (recurso_id);

-- Bloqueos: vacaciones, festivos, averías. Sin recurso = toda la sucursal.
CREATE TABLE IF NOT EXISTS public.agenda_bloqueos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.sucursales (id) ON DELETE CASCADE,
  recurso_id uuid REFERENCES public.recursos (id) ON DELETE CASCADE,
  desde timestamptz NOT NULL,
  hasta timestamptz NOT NULL,
  motivo text,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hasta > desde)
);
CREATE INDEX IF NOT EXISTS idx_agenda_bloqueos_branch ON public.agenda_bloqueos (branch_id, desde);

-- Qué recursos pueden hacer cada servicio. Sin filas para un servicio =
-- cualquier recurso del tipo que pide.
CREATE TABLE IF NOT EXISTS public.recursos_servicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.sucursales (id) ON DELETE CASCADE,
  recurso_id uuid NOT NULL REFERENCES public.recursos (id) ON DELETE CASCADE,
  precio_id uuid NOT NULL REFERENCES public.price_list (id) ON DELETE CASCADE,
  UNIQUE (recurso_id, precio_id)
);
CREATE INDEX IF NOT EXISTS idx_recursos_servicios_precio ON public.recursos_servicios (precio_id);

-- Restaurante: mesas que se pueden juntar (la 3 y la 4 hacen una de 8)
CREATE TABLE IF NOT EXISTS public.recursos_combinaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.sucursales (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  recurso_ids uuid[] NOT NULL CHECK (array_length(recurso_ids, 1) >= 2),
  capacidad_min int NOT NULL CHECK (capacidad_min >= 1),
  capacidad_max int NOT NULL CHECK (capacidad_max >= capacidad_min),
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recursos_combinaciones_branch ON public.recursos_combinaciones (branch_id);

-- ---------------------------------------------------------------------------
-- 3. Servicios: la lista de precios gana lo que hace falta para reservar
-- ---------------------------------------------------------------------------
ALTER TABLE public.price_list
  ADD COLUMN IF NOT EXISTS reservable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duracion_minutos int CHECK (duracion_minutos IS NULL OR duracion_minutos BETWEEN 5 AND 1440),
  ADD COLUMN IF NOT EXISTS tiempo_antes_minutos int NOT NULL DEFAULT 0 CHECK (tiempo_antes_minutos BETWEEN 0 AND 240),
  ADD COLUMN IF NOT EXISTS tiempo_despues_minutos int NOT NULL DEFAULT 0 CHECK (tiempo_despues_minutos BETWEEN 0 AND 240),
  -- Tramos en los que el recurso queda libre dentro del servicio:
  -- [{ "desde_minuto": 30, "minutos": 30 }]
  ADD COLUMN IF NOT EXISTS huecos_internos jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Qué tipo de recurso ocupa (null = el que haya) y cuántos a la vez
  ADD COLUMN IF NOT EXISTS tipo_recurso text CHECK (tipo_recurso IS NULL OR tipo_recurso IN ('persona', 'mesa', 'sala', 'equipo', 'otro')),
  ADD COLUMN IF NOT EXISTS recursos_necesarios int NOT NULL DEFAULT 1 CHECK (recursos_necesarios BETWEEN 1 AND 10),
  -- Clases y grupos: cuántas personas comparten el mismo hueco (null = individual)
  ADD COLUMN IF NOT EXISTS aforo int CHECK (aforo IS NULL OR aforo BETWEEN 1 AND 1000),
  ADD COLUMN IF NOT EXISTS precio_por_persona boolean NOT NULL DEFAULT false,
  -- Añadidos que puede pedir el cliente: [{ "nombre": "Con lavado", "precio": 5, "minutos": 10 }]
  ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Si es distinto del de la sucursal
  ADD COLUMN IF NOT EXISTS cancelacion_horas int CHECK (cancelacion_horas IS NULL OR cancelacion_horas BETWEEN 0 AND 720),
  ADD COLUMN IF NOT EXISTS confirmacion text CHECK (confirmacion IS NULL OR confirmacion IN ('automatica', 'manual')),
  ADD COLUMN IF NOT EXISTS reservable_online boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_price_list_reservable ON public.price_list (branch_id) WHERE reservable = true;

-- ---------------------------------------------------------------------------
-- 4. Citas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.citas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.sucursales (id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts (id) ON DELETE SET NULL,
  conversation_id uuid,
  servicio_id uuid REFERENCES public.price_list (id) ON DELETE SET NULL,
  -- Copia del nombre y el precio en el momento de reservar (si luego cambian, la cita no)
  servicio_nombre text NOT NULL,
  inicio timestamptz NOT NULL,
  fin timestamptz NOT NULL,
  personas int NOT NULL DEFAULT 1 CHECK (personas >= 1),
  estado text NOT NULL DEFAULT 'confirmada'
    CHECK (estado IN ('pendiente', 'confirmada', 'en_curso', 'completada', 'no_presentado', 'cancelada_cliente', 'cancelada_negocio')),
  origen text NOT NULL DEFAULT 'panel' CHECK (origen IN ('ia', 'panel', 'enlace')),
  -- Las clases con aforo comparten grupo (servicio + hora); el resto, ninguno
  grupo text,
  -- Cómo localizar al cliente para recordatorios, aunque no haya contacto aún
  nombre_cliente text,
  telefono text,
  email text,
  notas text,
  peticiones text,
  extras jsonb NOT NULL DEFAULT '[]'::jsonb,
  precio_estimado numeric,
  moneda text,
  -- La llave secreta del cliente para cambiar o cancelar desde el enlace
  token_gestion text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  -- Qué avisos han salido ya ({"recordatorio_24h": "...fecha..."})
  avisos jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Restaurante: cuándo llegó, para el tiempo de cortesía
  llegada_en timestamptz,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (fin > inicio)
);
CREATE INDEX IF NOT EXISTS idx_citas_branch_inicio ON public.citas (branch_id, inicio);
CREATE INDEX IF NOT EXISTS idx_citas_contacto ON public.citas (contact_id);
CREATE INDEX IF NOT EXISTS idx_citas_grupo ON public.citas (branch_id, grupo) WHERE grupo IS NOT NULL;
COMMENT ON TABLE public.citas IS 'Reservas de la agenda: quién, qué servicio, cuándo, en qué estado.';

-- La ocupación real de cada recurso. Es aquí donde la base de datos impide
-- solapar: mismo recurso, tiempos que se cruzan y grupos distintos → rechazo.
-- (Las citas individuales llevan su propio id como grupo, así que siempre
-- chocan entre sí; las plazas de una misma clase llevan el mismo grupo y
-- pueden convivir.)
CREATE TABLE IF NOT EXISTS public.citas_recursos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.sucursales (id) ON DELETE CASCADE,
  cita_id uuid NOT NULL REFERENCES public.citas (id) ON DELETE CASCADE,
  recurso_id uuid NOT NULL REFERENCES public.recursos (id) ON DELETE CASCADE,
  desde timestamptz NOT NULL,
  hasta timestamptz NOT NULL,
  grupo text NOT NULL,
  CHECK (hasta > desde),
  CONSTRAINT citas_recursos_sin_solape EXCLUDE USING gist (
    recurso_id WITH =,
    tstzrange(desde, hasta, '[)') WITH &&,
    grupo WITH <>
  )
);
CREATE INDEX IF NOT EXISTS idx_citas_recursos_cita ON public.citas_recursos (cita_id);
CREATE INDEX IF NOT EXISTS idx_citas_recursos_branch_desde ON public.citas_recursos (branch_id, desde);

-- Lo que le ha pasado a cada cita (creada, movida, cancelada, no vino...)
CREATE TABLE IF NOT EXISTS public.citas_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.sucursales (id) ON DELETE CASCADE,
  cita_id uuid NOT NULL REFERENCES public.citas (id) ON DELETE CASCADE,
  cambio text NOT NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Quién: 'ia', 'panel', 'enlace' o 'sistema'
  origen text NOT NULL DEFAULT 'sistema',
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_citas_historial_cita ON public.citas_historial (cita_id);

-- ---------------------------------------------------------------------------
-- 5. Reservar y mover, de una pieza (solo el servidor de la app)
-- ---------------------------------------------------------------------------
-- p: { tenant_id, branch_id, contact_id, conversation_id, servicio_id,
--      servicio_nombre, inicio, fin, personas, estado, origen, grupo, aforo,
--      nombre_cliente, telefono, email, notas, peticiones, extras,
--      precio_estimado, moneda, creado_por,
--      ocupacion: [{ recurso_id, desde, hasta }] }
-- Devuelve { id } o { error: 'ocupado' | 'aforo' }.
CREATE OR REPLACE FUNCTION public.reservar_cita(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_ocup jsonb;
  v_grupo text := p->>'grupo';
  v_aforo int := NULLIF(p->>'aforo', '')::int;
  v_personas int := coalesce(NULLIF(p->>'personas', '')::int, 1);
  v_ocupadas int;
BEGIN
  -- Las clases con aforo: se cuenta dentro de un candado por clase, para que
  -- dos reservas a la vez no pasen las dos
  IF v_aforo IS NOT NULL AND v_grupo IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_grupo));
    SELECT coalesce(sum(personas), 0) INTO v_ocupadas
      FROM public.citas
     WHERE branch_id = (p->>'branch_id')::uuid
       AND grupo = v_grupo
       AND estado IN ('pendiente', 'confirmada', 'en_curso');
    IF v_ocupadas + v_personas > v_aforo THEN
      RETURN jsonb_build_object('error', 'aforo', 'libres', greatest(v_aforo - v_ocupadas, 0));
    END IF;
  END IF;

  INSERT INTO public.citas (
    tenant_id, branch_id, contact_id, conversation_id, servicio_id, servicio_nombre,
    inicio, fin, personas, estado, origen, grupo, nombre_cliente, telefono, email,
    notas, peticiones, extras, precio_estimado, moneda, creado_por
  ) VALUES (
    (p->>'tenant_id')::uuid,
    (p->>'branch_id')::uuid,
    NULLIF(p->>'contact_id', '')::uuid,
    NULLIF(p->>'conversation_id', '')::uuid,
    NULLIF(p->>'servicio_id', '')::uuid,
    coalesce(p->>'servicio_nombre', 'Reserva'),
    (p->>'inicio')::timestamptz,
    (p->>'fin')::timestamptz,
    v_personas,
    coalesce(NULLIF(p->>'estado', ''), 'confirmada'),
    coalesce(NULLIF(p->>'origen', ''), 'panel'),
    v_grupo,
    NULLIF(p->>'nombre_cliente', ''),
    NULLIF(p->>'telefono', ''),
    NULLIF(p->>'email', ''),
    NULLIF(p->>'notas', ''),
    NULLIF(p->>'peticiones', ''),
    coalesce(p->'extras', '[]'::jsonb),
    NULLIF(p->>'precio_estimado', '')::numeric,
    NULLIF(p->>'moneda', ''),
    NULLIF(p->>'creado_por', '')::uuid
  ) RETURNING id INTO v_id;

  FOR v_ocup IN SELECT * FROM jsonb_array_elements(coalesce(p->'ocupacion', '[]'::jsonb)) LOOP
    INSERT INTO public.citas_recursos (tenant_id, branch_id, cita_id, recurso_id, desde, hasta, grupo)
    VALUES (
      (p->>'tenant_id')::uuid,
      (p->>'branch_id')::uuid,
      v_id,
      (v_ocup->>'recurso_id')::uuid,
      (v_ocup->>'desde')::timestamptz,
      (v_ocup->>'hasta')::timestamptz,
      coalesce(v_grupo, v_id::text)
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_id);
EXCEPTION
  WHEN exclusion_violation THEN
    RETURN jsonb_build_object('error', 'ocupado');
END;
$$;

-- Mover una cita: se suelta la ocupación vieja y se coge la nueva en la misma
-- transacción; si la nueva choca, no se pierde la vieja.
-- p: { cita_id, inicio, fin, grupo, aforo, personas, ocupacion: [...] }
CREATE OR REPLACE FUNCTION public.mover_cita(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid := (p->>'cita_id')::uuid;
  v_cita public.citas%ROWTYPE;
  v_ocup jsonb;
  v_grupo text := p->>'grupo';
  v_aforo int := NULLIF(p->>'aforo', '')::int;
  v_ocupadas int;
BEGIN
  SELECT * INTO v_cita FROM public.citas WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'no existe');
  END IF;

  IF v_aforo IS NOT NULL AND v_grupo IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_grupo));
    SELECT coalesce(sum(personas), 0) INTO v_ocupadas
      FROM public.citas
     WHERE branch_id = v_cita.branch_id AND grupo = v_grupo AND id <> v_id
       AND estado IN ('pendiente', 'confirmada', 'en_curso');
    IF v_ocupadas + v_cita.personas > v_aforo THEN
      RETURN jsonb_build_object('error', 'aforo', 'libres', greatest(v_aforo - v_ocupadas, 0));
    END IF;
  END IF;

  DELETE FROM public.citas_recursos WHERE cita_id = v_id;
  UPDATE public.citas
     SET inicio = (p->>'inicio')::timestamptz,
         fin = (p->>'fin')::timestamptz,
         grupo = v_grupo,
         actualizado_en = now()
   WHERE id = v_id;

  FOR v_ocup IN SELECT * FROM jsonb_array_elements(coalesce(p->'ocupacion', '[]'::jsonb)) LOOP
    INSERT INTO public.citas_recursos (tenant_id, branch_id, cita_id, recurso_id, desde, hasta, grupo)
    VALUES (
      v_cita.tenant_id, v_cita.branch_id, v_id,
      (v_ocup->>'recurso_id')::uuid,
      (v_ocup->>'desde')::timestamptz,
      (v_ocup->>'hasta')::timestamptz,
      coalesce(v_grupo, v_id::text)
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_id);
EXCEPTION
  WHEN exclusion_violation THEN
    RETURN jsonb_build_object('error', 'ocupado');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reservar_cita(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mover_cita(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reservar_cita(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mover_cita(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Quién ve y quién toca (RLS). Ver: cualquiera de la sucursal. Cambiar:
--    con permiso de escritura en "Agenda".
-- ---------------------------------------------------------------------------
ALTER TABLE public.agenda_ajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recursos_horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_bloqueos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recursos_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recursos_combinaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas_recursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas_historial ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agenda_ajustes', 'recursos', 'recursos_horarios', 'agenda_bloqueos', 'recursos_servicios', 'recursos_combinaciones', 'citas', 'citas_recursos', 'citas_historial'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_ver ON public.%I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_ver ON public.%I FOR SELECT USING (
        (SELECT is_super_admin())
        OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales()))
      )$p$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_cambiar ON public.%I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_cambiar ON public.%I FOR ALL USING (
        (SELECT is_super_admin())
        OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())
            AND auth_puede(branch_id, 'agenda', 'escritura'))
      ) WITH CHECK (
        (SELECT is_super_admin())
        OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales())
            AND auth_puede(branch_id, 'agenda', 'escritura'))
      )$p$, t, t);
  END LOOP;
END $$;
