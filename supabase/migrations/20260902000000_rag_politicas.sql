-- 1. Habilitar extensión pgvector
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- 2. Tabla policy_sources
create table policy_sources (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references organizaciones(id) on delete cascade,
  branch_id        uuid not null references sucursales(id) on delete cascade,
  nombre           text not null,
  tipo_origen      text not null, -- 'archivo' o 'texto_manual'
  ruta_archivo     text,
  texto_manual     text,
  estado           text not null default 'procesando',
  procesando_desde timestamptz,
  intentos_fallidos integer not null default 0,
  error_msg        text,
  activa           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- RLS para policy_sources
alter table policy_sources enable row level security;

create policy "Lectura policy_sources"
  on policy_sources for select
  using (is_super_admin() or branch_id in (select id from sucursales where tenant_id = auth_tenant_id()));

create policy "Escritura policy_sources admin"
  on policy_sources for all
  using (is_super_admin() or (branch_id in (select id from sucursales where tenant_id = auth_tenant_id()) and auth_is_admin()))
  with check (is_super_admin() or (branch_id in (select id from sucursales where tenant_id = auth_tenant_id()) and auth_is_admin()));

-- 3. Tabla policy_fragments
create table policy_fragments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references organizaciones(id) on delete cascade,
  branch_id        uuid not null references sucursales(id) on delete cascade,
  source_id        uuid not null references policy_sources(id) on delete cascade,
  contenido        text not null,
  embedding        vector(1536),
  posicion_orden   integer not null default 0,
  activa           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- RLS para policy_fragments
alter table policy_fragments enable row level security;

create policy "Lectura policy_fragments"
  on policy_fragments for select
  using (is_super_admin() or branch_id in (select id from sucursales where tenant_id = auth_tenant_id()));

-- (No se requiere política de escritura para el cliente. El backend, al usar service_role o saltar RLS, será quien escriba aquí)

-- 4. Función RPC para búsqueda vectorial
CREATE OR REPLACE FUNCTION match_fragmentos_politicas (
  query_embedding vector(1536),
  match_branch_id uuid,
  match_limit int
) RETURNS TABLE (
  id uuid,
  contenido text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.contenido,
    1 - (f.embedding <=> query_embedding) AS similarity
  FROM policy_fragments f
  WHERE f.branch_id = match_branch_id
    AND f.activa = true
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

-- 5. Función de CRON (Mismo patrón de seguridad que el resto)
CREATE OR REPLACE FUNCTION cron_procesar_politicas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
    r RECORD;
    bearer_token text;
BEGIN
    -- Leer secreto desde Vault
    SELECT secret INTO bearer_token FROM vault.decrypted_secrets WHERE name = 'cron_webhook_secret';

    FOR r IN (
        SELECT id FROM policy_sources
        WHERE estado = 'procesando'
        AND (procesando_desde IS NULL OR procesando_desde < now() - interval '5 minutes')
        AND intentos_fallidos < 3
    ) LOOP
        -- 1. BLOQUEO PRIMERO
        UPDATE policy_sources
        SET procesando_desde = now()
        WHERE id = r.id;

        -- 2. LLAMADA POSTERIOR
        PERFORM net.http_post(
            url := 'https://respondi.vercel.app/api/ai/process-policy',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || bearer_token
            ),
            body := jsonb_build_object('sourceId', r.id)
        );
    END LOOP;
END;
$$;

-- Blindaje función cron
REVOKE ALL ON FUNCTION cron_procesar_politicas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cron_procesar_politicas() TO service_role, postgres;

-- 6. Programar el CRON (Se ejecuta cada minuto)
SELECT cron.schedule('cron_procesar_politicas_job', '* * * * *', 'SELECT cron_procesar_politicas();');
