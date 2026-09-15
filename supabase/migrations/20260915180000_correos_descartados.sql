-- 15-09-2026. Correos que llegan al buzón del negocio y la IA NO contesta
-- (avisos de plataformas, publicidad, internos, solo en copia, remitentes
-- marcados). Quedan apuntados para que el negocio los vea en Canales y pueda
-- «tratarlos como cliente» si el filtro se equivoca.

create table if not exists public.correos_descartados (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizaciones(id) on delete cascade,
  branch_id uuid not null references public.sucursales(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  de text not null,
  nombre text,
  asunto text,
  texto text,
  adjuntos integer not null default 0,
  message_id text,
  referencias text[] not null default '{}',
  motivo text not null,
  recibido_en timestamptz not null default now(),
  tratado_en timestamptz
);

create index if not exists correos_descartados_canal_idx on public.correos_descartados (channel_id, recibido_en desc);
-- El mismo correo no se apunta dos veces (si la lectura se repite)
create unique index if not exists correos_descartados_unico on public.correos_descartados (channel_id, message_id) where message_id is not null;

alter table public.correos_descartados enable row level security;

create policy correos_descartados_ver on public.correos_descartados
  for select using (
    (select is_super_admin()) or (
      tenant_id = (select auth_tenant_id()) and branch_id in (select auth_sucursales())
    )
  );

-- Marcar como tratado o borrar: quien puede tocar los canales
create policy correos_descartados_cambiar on public.correos_descartados
  for all using (
    (select is_super_admin()) or (
      tenant_id = (select auth_tenant_id()) and branch_id in (select auth_sucursales())
      and auth_puede(branch_id, 'canales', 'escritura')
    )
  );

-- Se limpian solos: a los 60 días no aportan nada
create or replace function public.limpiar_correos_descartados()
returns void language sql security definer set search_path = public as $$
  delete from public.correos_descartados where recibido_en < now() - interval '60 days';
$$;
revoke execute on function public.limpiar_correos_descartados() from public, anon, authenticated;
