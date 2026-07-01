-- ============================================================================
-- RESPONDI · Esquema de base de datos para Supabase (PostgreSQL)
-- Versión consolidada: anteproyecto v2.0 + migraciones "organizaciones"
-- ============================================================================
--
-- Cómo usar este archivo:
--   1. Abre tu proyecto en Supabase → SQL Editor.
--   2. Pega TODO este script y ejecútalo de una vez.
--   3. Crea el primer usuario super-admin desde Authentication, y luego
--      inserta su fila en public.users con rol 'super_admin'.
--
-- Principios (del anteproyecto):
--   - Todos los IDs son UUID.
--   - Multi-tenant: casi todas las tablas llevan tenant_id (= organizaciones.id).
--   - RLS activo en todas las tablas. El super-admin tiene bypass.
--   - La tabla de usuarios se enlaza con auth.users de Supabase.
-- ============================================================================

-- Extensión para generar UUIDs
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. TIPOS ENUM
-- ============================================================================

create type estado_organizacion as enum ('trial', 'activo', 'vencido', 'suspendido');
create type rol_usuario        as enum ('super_admin', 'admin', 'usuario');
create type seccion_permiso as enum (
  'casos', 'conversaciones', 'chats', 'novedades', 'blacklist',
  'skills', 'precios', 'reglas', 'etiquetas', 'canales',
  'usuarios', 'sucursales', 'perfil', 'audit_log'
);
create type nivel_permiso as enum ('ninguno', 'lectura', 'escritura');
create type alcance_permiso as enum ('todos', 'propios');
create type modo_pausa         as enum ('apagada', 'automatica', 'ninguna');
create type tipo_canal         as enum ('instagram', 'whatsapp', 'facebook');
create type metodo_canal       as enum ('whaticket', 'meta_oficial');
create type estado_canal       as enum ('activo', 'pendiente', 'desconectado', 'error');
create type tipo_novedad       as enum ('horario', 'stock', 'promo', 'evento', 'otro');
create type estado_conv        as enum ('activa', 'cerrada');
create type remitente_msg      as enum ('cliente', 'ia', 'agente');
create type tipo_caso          as enum ('normal', 'fallo_llm', 'fallo_entrega', 'blacklist_sugerida');
create type estatus_caso       as enum ('pendiente', 'atendiendo', 'resuelto', 'cerrado');
create type blacklist_modo     as enum ('ignorar', 'respuesta_automatica', 'derivar');
create type tipo_comision      as enum ('recurrente', 'puntual');
create type tipo_movimiento    as enum ('abono', 'debito');
create type estado_pago        as enum ('pendiente', 'confirmado', 'fallido');
create type forma_pago_enum    as enum ('transferencia', 'efectivo', 'bizum', 'tdc');
create type origen_error       as enum ('n8n', 'api_meta', 'llm', 'db', 'cron');
create type resultado_ia       as enum ('respondio','abrio_caso','fuera_horario','blacklist','pausa','sin_cuota','fallo');

-- ============================================================================
-- 2. TABLAS GLOBALES (sin tenant_id · solo super-admin)
-- ============================================================================

create table plans (
  id                        uuid primary key default gen_random_uuid(),
  nombre                    text not null,
  precio_usd                numeric(10,2) not null default 0,
  creditos_diarios_trial    integer,
  creditos_mensuales        integer,
  canales_max               integer not null default 1,
  sucursales_max            integer not null default 1,
  usuarios_max              integer,
  modelo_ia                 text not null default 'gpt-4o-mini',
  dias_retencion_mensajes   integer not null default 30,
  precio_credito_adicional  numeric(10,4) not null default 0,
  precio_sucursal_extra     numeric(10,2) default 0,
  activo                    boolean not null default true,
  created_at                timestamptz not null default now()
);

create table vendedores (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  email               text unique,
  datos_fiscales      text,
  porcentaje_comision numeric(5,2) not null default 0,
  tipo_comision       tipo_comision not null default 'recurrente',
  activo              boolean not null default true,
  created_at          timestamptz not null default now()
);

-- ============================================================================
-- 3. ORGANIZACIONES Y ESTRUCTURA
-- ============================================================================

-- Organización = tenant. tenant_id de las demás tablas apunta aquí.
create table organizaciones (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  plan_id            uuid references plans(id),
  estado             estado_organizacion not null default 'trial',
  fecha_inicio       date not null default current_date,
  fecha_vencimiento  date,
  trial_activo       boolean not null default true,
  id_vendedor        uuid references vendedores(id),
  forma_pago         forma_pago_enum,
  created_at         timestamptz not null default now()
);

-- Sucursales (branch). Cada organización tiene N sucursales.
create table sucursales (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references organizaciones(id) on delete cascade,
  nombre                   text not null,
  direccion                text,
  activa                   boolean not null default true,
  modo_pausa               modo_pausa not null default 'ninguna',
  timezone                 text not null default 'America/Caracas',
  tiempo_agrupacion_seg    integer not null default 30,
  blacklist_modo           blacklist_modo not null default 'ignorar',
  blacklist_respuesta_auto text,
  -- Nuevas columnas de onboarding trasladadas
  onboarding_paso          integer not null default 1,
  onboarding_completado    boolean not null default false,
  created_at               timestamptz not null default now()
);

create table business_profiles (
  id                    uuid primary key default gen_random_uuid(),
  branch_id             uuid not null references sucursales(id) on delete cascade,
  descripcion           text,
  politicas             text,
  servicios             text,
  idioma_base           text default 'es',
  tono                  text,
  disclaimer_texto      text,
  msg_fuera_horario     text,
  msg_cuota_agotada     text,
  msg_pausa_automatica  text,
  created_at            timestamptz not null default now()
);

create table business_hours (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references sucursales(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  apertura   time,
  cierre     time,
  cerrado    boolean not null default false
);

-- ============================================================================
-- 4. USUARIOS Y ASIGNACIONES
-- ============================================================================

create table users (
  id             uuid primary key references auth.users(id) on delete cascade,
  tenant_id      uuid references organizaciones(id) on delete cascade,  -- null para super_admin
  branch_id      uuid references sucursales(id),                        -- null para admin
  email          text not null,
  nombre         text,
  rol            rol_usuario not null,
  activo         boolean not null default true,
  invitacion_aceptada boolean not null default false,
  fecha_creacion timestamptz not null default now()
);

-- Relación N:M entre usuarios y sucursales (ej. operarios/agentes asignados a múltiples branches)
create table user_branches (
  user_id   uuid not null references users(id) on delete cascade,
  branch_id uuid not null references sucursales(id) on delete cascade,
  primary key (user_id, branch_id)
);

-- Permisos granulares por usuario, sucursal y sección
create table user_permissions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  branch_id  uuid not null references sucursales(id) on delete cascade,
  seccion    seccion_permiso not null,
  nivel      nivel_permiso not null default 'ninguno',
  alcance    alcance_permiso,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, branch_id, seccion)
);

-- ============================================================================
-- 5. CONFIGURACIÓN DE IA
-- ============================================================================

create table skills (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizaciones(id) on delete cascade,
  branch_id   uuid not null references sucursales(id) on delete cascade,
  nombre      text not null,
  descripcion text,
  activo      boolean not null default true,
  orden       integer not null default 0,
  configuracion jsonb,
  created_at  timestamptz not null default now()
);

create table price_list (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizaciones(id) on delete cascade,
  branch_id   uuid not null references sucursales(id) on delete cascade,
  nombre      text not null,
  tipo        text not null default 'producto' check (tipo in ('producto', 'servicio')),
  precio      numeric(12,2),
  precio_tipo text not null default 'exacto',
  moneda      text not null default 'USD',
  descripcion text,
  disponible  boolean not null default true,
  created_at  timestamptz not null default now()
);

create table daily_updates (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references organizaciones(id) on delete cascade,
  branch_id              uuid not null references sucursales(id) on delete cascade,
  user_id                uuid references users(id),
  tipo                   tipo_novedad not null,
  descripcion            text not null,
  fecha_vigencia_inicio  timestamptz not null default now(),
  fecha_vigencia_fin     timestamptz,
  activo                 boolean not null default true,
  created_at             timestamptz not null default now()
);

create table case_rules (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references organizaciones(id) on delete cascade,
  branch_id             uuid not null references sucursales(id) on delete cascade,
  nombre                text not null,
  descripcion_intencion text,
  tipo_caso             text,
  activa                boolean not null default true,
  es_plantilla          boolean not null default false,
  created_at            timestamptz not null default now()
);

create table message_categories (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references organizaciones(id) on delete cascade,
  branch_id            uuid not null references sucursales(id) on delete cascade,
  nombre               text not null,
  descripcion_intencion text,
  color                text default 'slate',
  activa               boolean not null default true,
  es_plantilla         boolean not null default false,
  orden                integer not null default 0,
  created_at           timestamptz not null default now()
);

-- ============================================================================
-- 6. CANALES
-- ============================================================================

create table channels (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references organizaciones(id) on delete cascade,
  branch_id           uuid references sucursales(id) on delete cascade,
  tipo                tipo_canal not null,
  metodo              metodo_canal not null default 'whaticket',
  estado              estado_canal not null default 'pendiente',
  identificador_externo text,
  fecha_conexion      timestamptz,
  ultima_actividad    timestamptz,
  created_at          timestamptz not null default now()
);

-- ============================================================================
-- 7. CONTACTOS Y CONVERSACIONES
-- ============================================================================

create table contacts (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references organizaciones(id) on delete cascade,
  canal                tipo_canal not null,
  identificador_canal  text not null,
  nombre               text,
  blacklist            boolean not null default false,
  blacklist_razon      text,
  fecha_blacklist      timestamptz,
  fecha_primer_contacto timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

create table conversations (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references organizaciones(id) on delete cascade,
  branch_id            uuid references sucursales(id),
  contact_id           uuid not null references contacts(id) on delete cascade,
  canal                tipo_canal not null,
  estado               estado_conv not null default 'activa',
  ia_pausada           boolean not null default false,
  atendida_por         uuid references users(id),
  fecha_inicio         timestamptz not null default now(),
  fecha_ultimo_mensaje timestamptz,
  fecha_cierre         timestamptz,
  resumen              text
);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references organizaciones(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  remitente       remitente_msg not null,
  contenido       text,
  timestamp       timestamptz not null default now(),
  tokens_input    integer,
  tokens_output   integer,
  modelo_ia       text,
  entregado       boolean default true,
  agrupado        boolean default false,
  es_ultimo_agrupado boolean default false
);

create table conversation_tags (
  conversation_id uuid not null references conversations(id) on delete cascade,
  category_id     uuid not null references message_categories(id) on delete cascade,
  aplicada_por    text default 'ia',
  created_at      timestamptz not null default now(),
  primary key (conversation_id, category_id)
);

-- ============================================================================
-- 8. CASOS
-- ============================================================================

create table cases (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references organizaciones(id) on delete cascade,
  branch_id       uuid references sucursales(id),
  contact_id      uuid references contacts(id),
  conversation_id uuid references conversations(id),
  agente_id       uuid references users(id),
  tipo            tipo_caso not null default 'normal',
  descripcion     text,
  producto_id     uuid references price_list(id),
  prioridad       text default 'normal',
  estatus         estatus_caso not null default 'pendiente',
  fecha_apertura  timestamptz not null default now(),
  fecha_cierre    timestamptz,
  sla_horas       integer
);

create table case_notes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references organizaciones(id) on delete cascade,
  case_id    uuid not null references cases(id) on delete cascade,
  user_id    uuid references users(id),
  nota       text not null,
  timestamp  timestamptz not null default now()
);

-- ============================================================================
-- 9. CRÉDITOS Y FACTURACIÓN
-- ============================================================================

create table message_quotas (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references organizaciones(id) on delete cascade,
  tipo                tipo_movimiento not null,
  cantidad            integer not null,
  saldo               integer not null,
  descripcion         text,
  referencia_pago_id  uuid,
  timestamp           timestamptz not null default now()
);

create table billing (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizaciones(id) on delete cascade,
  plan_id     uuid references plans(id),
  importe_usd numeric(10,2) not null,
  forma_pago  forma_pago_enum,
  estado      estado_pago not null default 'pendiente',
  fecha       timestamptz not null default now(),
  notas       text,
  id_vendedor uuid references vendedores(id)
);

-- ============================================================================
-- 10. LOGS Y AUDITORÍA
-- ============================================================================

create table ai_logs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid references organizaciones(id) on delete cascade,
  branch_id          uuid references sucursales(id),
  message_id         uuid references messages(id),
  modelo_ia          text,
  tokens_input       integer,
  tokens_output      integer,
  costo_estimado_usd numeric(12,6),
  contexto_snapshot  jsonb,
  resultado          resultado_ia,
  timestamp          timestamptz not null default now()
);

create table error_logs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references organizaciones(id) on delete set null,
  origen      origen_error not null,
  descripcion text,
  stacktrace  text,
  resuelto    boolean not null default false,
  timestamp   timestamptz not null default now()
);

create table audit_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references organizaciones(id) on delete cascade,
  user_id         uuid references users(id),
  accion          text not null,
  tabla_afectada  text,
  registro_id     uuid,
  valor_anterior  jsonb,
  valor_nuevo     jsonb,
  timestamp       timestamptz not null default now()
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references organizaciones(id) on delete cascade,
  user_id    uuid references users(id),
  tipo       text,
  titulo     text,
  cuerpo     text,
  leida      boolean not null default false,
  timestamp  timestamptz not null default now()
);

-- ============================================================================
-- 11. ÍNDICES (rendimiento en consultas frecuentes)
-- ============================================================================

create index idx_sucursales_tenant      on sucursales(tenant_id);
create index idx_users_tenant           on users(tenant_id);
create index idx_user_branches_uid      on user_branches(user_id);
create index idx_user_branches_bid      on user_branches(branch_id);
create index idx_skills_branch          on skills(branch_id);
create index idx_price_branch           on price_list(branch_id);
create index idx_updates_branch_activo  on daily_updates(branch_id, activo);
create index idx_rules_branch           on case_rules(branch_id);
create index idx_categories_branch      on message_categories(branch_id);
create index idx_channels_tenant        on channels(tenant_id);
create index idx_contacts_tenant_canal  on contacts(tenant_id, canal, identificador_canal);
create index idx_conv_tenant_estado     on conversations(tenant_id, estado);
create index idx_conv_contact           on conversations(contact_id);
create index idx_messages_conv          on messages(conversation_id, timestamp);
create index idx_cases_tenant_estatus   on cases(tenant_id, estatus);
create index idx_cases_agente           on cases(agente_id);
create index idx_quotas_tenant_ts       on message_quotas(tenant_id, timestamp desc);
create index idx_audit_tenant_ts        on audit_log(tenant_id, timestamp desc);
create index idx_errors_resuelto_ts     on error_logs(resuelto, timestamp desc);
create index idx_user_permissions_user_branch  on user_permissions(user_id, branch_id);
create index idx_user_permissions_branch_seccion on user_permissions(branch_id, seccion);

-- ============================================================================
-- 12. FUNCIONES AUXILIARES PARA RLS
-- ============================================================================

create or replace function auth_tenant_id()
returns uuid language sql stable security definer as $$
  select tenant_id from public.users where id = auth.uid()
$$;

create or replace function auth_rol()
returns rol_usuario language sql stable security definer as $$
  select rol from public.users where id = auth.uid()
$$;

create or replace function auth_is_admin()
returns boolean language sql stable security definer as $$
  select coalesce(
    (select rol in ('super_admin', 'admin') from public.users where id = auth.uid()),
    false
  )
$$;

create or replace function auth_has_permission(
  p_branch_id uuid,
  p_seccion   seccion_permiso,
  p_nivel     nivel_permiso
) returns boolean language plpgsql stable security definer as $$
declare
  v_rol rol_usuario;
  v_nivel nivel_permiso;
begin
  select rol into v_rol from public.users where id = auth.uid();
  if v_rol in ('super_admin', 'admin') then return true; end if;
  select nivel into v_nivel from public.user_permissions
  where user_id = auth.uid() and branch_id = p_branch_id and seccion = p_seccion;
  if v_nivel is null then return false; end if;
  if p_nivel = 'ninguno' then return true;
  elsif p_nivel = 'lectura' then return v_nivel in ('lectura', 'escritura');
  elsif p_nivel = 'escritura' then return v_nivel = 'escritura';
  end if;
  return false;
end;
$$;

create or replace function is_super_admin()
returns boolean language sql stable security definer as $$
  select coalesce((select rol = 'super_admin' from public.users where id = auth.uid()), false)
$$;

-- ============================================================================
-- 13. ACTIVAR RLS EN TODAS LAS TABLAS
-- ============================================================================

alter table organizaciones       enable row level security;
alter table sucursales         enable row level security;
alter table business_profiles  enable row level security;
alter table business_hours     enable row level security;
alter table users              enable row level security;
alter table user_branches      enable row level security;
alter table user_permissions   enable row level security;
alter table skills             enable row level security;
alter table price_list         enable row level security;
alter table daily_updates      enable row level security;
alter table case_rules         enable row level security;
alter table message_categories enable row level security;
alter table channels           enable row level security;
alter table contacts           enable row level security;
alter table conversations      enable row level security;
alter table messages           enable row level security;
alter table conversation_tags  enable row level security;
alter table cases              enable row level security;
alter table case_notes         enable row level security;
alter table message_quotas     enable row level security;
alter table billing            enable row level security;
alter table ai_logs            enable row level security;
alter table audit_log          enable row level security;
alter table notifications      enable row level security;
alter table plans              enable row level security;
alter table vendedores         enable row level security;
alter table error_logs         enable row level security;

-- ============================================================================
-- 14. POLÍTICAS RLS
-- ============================================================================

-- organizaciones
create policy organizaciones_select on organizaciones for select
  using (is_super_admin() or id = auth_tenant_id());
create policy organizaciones_super_all on organizaciones for all
  using (is_super_admin()) with check (is_super_admin());

-- sucursales
create policy sucursales_tenant on sucursales for all
  using (is_super_admin() or tenant_id = auth_tenant_id())
  with check (is_super_admin() or tenant_id = auth_tenant_id());

-- business_profiles
create policy bprofiles_tenant on business_profiles for all
  using (is_super_admin() or branch_id in (select id from sucursales where tenant_id = auth_tenant_id()))
  with check (is_super_admin() or branch_id in (select id from sucursales where tenant_id = auth_tenant_id()));

create policy bhours_tenant on business_hours for all
  using (is_super_admin() or branch_id in (select id from sucursales where tenant_id = auth_tenant_id()))
  with check (is_super_admin() or branch_id in (select id from sucursales where tenant_id = auth_tenant_id()));

-- users
create policy users_tenant on users for select
  using (is_super_admin() or tenant_id = auth_tenant_id() or id = auth.uid());
create policy users_admin_manage on users for all
  using (is_super_admin() or (tenant_id = auth_tenant_id() and auth_rol() = 'admin'))
  with check (is_super_admin() or (tenant_id = auth_tenant_id() and auth_rol() = 'admin'));

-- user_branches
create policy user_branches_access on user_branches for all
  using (is_super_admin() or user_id = auth.uid() or branch_id in (select id from sucursales where tenant_id = auth_tenant_id()))
  with check (is_super_admin() or user_id = auth.uid() or branch_id in (select id from sucursales where tenant_id = auth_tenant_id()));

-- user_permissions
create policy user_permissions_select on user_permissions for select
  using (is_super_admin() or user_id = auth.uid() or branch_id in (select id from sucursales where tenant_id = auth_tenant_id()));
create policy user_permissions_admin on user_permissions for all
  using (is_super_admin() or (branch_id in (select id from sucursales where tenant_id = auth_tenant_id()) and auth_is_admin()))
  with check (is_super_admin() or (branch_id in (select id from sucursales where tenant_id = auth_tenant_id()) and auth_is_admin()));

-- settings
create policy skills_tenant on skills for all
  using (is_super_admin() or tenant_id = auth_tenant_id())
  with check (is_super_admin() or tenant_id = auth_tenant_id());

create policy price_tenant on price_list for all
  using (is_super_admin() or tenant_id = auth_tenant_id())
  with check (is_super_admin() or tenant_id = auth_tenant_id());

create policy updates_select on daily_updates for select
  using (is_super_admin() or tenant_id = auth_tenant_id());
create policy updates_write on daily_updates for all
  using (is_super_admin() or (tenant_id = auth_tenant_id() and (auth_rol() = 'admin' or auth_has_permission(branch_id, 'novedades', 'escritura'))))
  with check (is_super_admin() or (tenant_id = auth_tenant_id() and (auth_rol() = 'admin' or auth_has_permission(branch_id, 'novedades', 'escritura'))));

create policy rules_tenant on case_rules for all
  using (is_super_admin() or tenant_id = auth_tenant_id())
  with check (is_super_admin() or tenant_id = auth_tenant_id());

create policy categories_tenant on message_categories for all
  using (is_super_admin() or tenant_id = auth_tenant_id())
  with check (is_super_admin() or tenant_id = auth_tenant_id());

create policy channels_tenant on channels for all
  using (is_super_admin() or tenant_id = auth_tenant_id())
  with check (is_super_admin() or tenant_id = auth_tenant_id());

create policy contacts_tenant on contacts for all
  using (is_super_admin() or tenant_id = auth_tenant_id())
  with check (is_super_admin() or tenant_id = auth_tenant_id());

create policy conversations_tenant on conversations for all
  using (is_super_admin() or tenant_id = auth_tenant_id())
  with check (is_super_admin() or tenant_id = auth_tenant_id());

create policy messages_tenant on messages for all
  using (is_super_admin() or tenant_id = auth_tenant_id())
  with check (is_super_admin() or tenant_id = auth_tenant_id());

create policy convtags_tenant on conversation_tags for all
  using (is_super_admin() or conversation_id in (select id from conversations where tenant_id = auth_tenant_id()))
  with check (is_super_admin() or conversation_id in (select id from conversations where tenant_id = auth_tenant_id()));

create policy cases_select on cases for select
  using (is_super_admin() or (tenant_id = auth_tenant_id() and (auth_rol() = 'admin' or auth_has_permission(branch_id, 'casos', 'lectura'))));
create policy cases_write on cases for all
  using (is_super_admin() or (tenant_id = auth_tenant_id() and (auth_rol() = 'admin' or auth_has_permission(branch_id, 'casos', 'escritura'))))
  with check (is_super_admin() or tenant_id = auth_tenant_id());

create policy notes_select on case_notes for select
  using (is_super_admin() or tenant_id = auth_tenant_id());
create policy notes_insert on case_notes for insert
  with check (is_super_admin() or tenant_id = auth_tenant_id());

create policy quotas_tenant on message_quotas for select
  using (is_super_admin() or tenant_id = auth_tenant_id());

create policy billing_tenant on billing for select
  using (is_super_admin() or tenant_id = auth_tenant_id());

create policy ailogs_tenant on ai_logs for select
  using (is_super_admin() or tenant_id = auth_tenant_id());

create policy audit_tenant on audit_log for select
  using (is_super_admin() or (tenant_id = auth_tenant_id() and (auth_rol() = 'admin' or auth_has_permission((select branch_id from public.users where id = auth.uid()), 'audit_log', 'lectura'))));

create policy notif_own on notifications for all
  using (is_super_admin() or user_id = auth.uid())
  with check (is_super_admin() or user_id = auth.uid());

create policy plans_read on plans for select using (auth.uid() is not null);
create policy plans_super on plans for all using (is_super_admin()) with check (is_super_admin());
create policy vendedores_super on vendedores for all using (is_super_admin()) with check (is_super_admin());
create policy errors_super on error_logs for all using (is_super_admin()) with check (is_super_admin());

-- ============================================================================
-- 15. RPC PARA REGISTRO DE TRIAL ATÓMICO (SECURITY DEFINER)
-- ============================================================================

create or replace function create_trial_account(
  p_user_id uuid,
  p_email text,
  p_nombre text,
  p_org_nombre text
) returns void language plpgsql security definer as $$
declare
  v_org_id uuid;
  v_sucursal_id uuid;
begin
  -- 1. Crear organización
  insert into public.organizaciones (nombre, estado, trial_activo, fecha_inicio, fecha_vencimiento)
  values (p_org_nombre, 'trial', true, current_date, current_date + interval '14 days')
  returning id into v_org_id;

  -- 2. Crear sucursal con datos base del onboarding
  insert into public.sucursales (tenant_id, nombre, activa, onboarding_paso, onboarding_completado)
  values (v_org_id, 'Principal', true, 1, false)
  returning id into v_sucursal_id;

  -- 3. Crear usuario (Admin del tenant)
  insert into public.users (id, tenant_id, branch_id, email, nombre, rol, invitacion_aceptada)
  values (p_user_id, v_org_id, v_sucursal_id, p_email, p_nombre, 'admin', true);

  -- 4. Asignar sucursal al usuario en user_branches
  insert into public.user_branches (user_id, branch_id)
  values (p_user_id, v_sucursal_id);

  -- 5. Crear cuota inicial (100 créditos)
  insert into public.message_quotas (tenant_id, tipo, cantidad, saldo, descripcion)
  values (v_org_id, 'abono', 100, 100, 'Cuota inicial trial');
end;
$$;

-- ============================================================================
-- 16. JOBS PROGRAMADOS (pg_cron)
-- ============================================================================

create extension if not exists pg_cron;

select cron.schedule(
  'archivar-novedades-caducadas',
  '*/15 * * * *',
  $$
  update daily_updates
  set activo = false
  where activo = true
    and fecha_vigencia_fin is not null
    and fecha_vigencia_fin < now();
  $$
);

-- ============================================================================
-- FIN DEL ESQUEMA
-- ============================================================================
