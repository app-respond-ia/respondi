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
  'usuarios', 'sucursales', 'perfil', 'audit_log', 'soporte'
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

create table superadmin_roles (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  descripcion   text,
  nivel         integer not null,
  es_propietario boolean not null default false,
  permisos      jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

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
  umbral_alerta_creditos    integer not null default 100,
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
  plan_pendiente_id  uuid references plans(id),
  id_vendedor        uuid references vendedores(id),
  forma_pago         forma_pago_enum,
  created_at         timestamptz not null default now()
);

-- Sucursales (branch). Cada organización tiene N sucursales.
create table sucursales (
  id                             uuid primary key default gen_random_uuid(),
  tenant_id                      uuid not null references organizaciones(id) on delete cascade,
  nombre                         text not null,
  direccion                      text,
  activa                         boolean not null default true,
  modo_pausa                     modo_pausa not null default 'ninguna',
  timezone                       text not null default 'America/Caracas',
  tiempo_agrupacion_seg          integer not null default 30,
  trato_contactos_modo           blacklist_modo not null default 'ignorar',
  trato_contactos_respuesta_auto text,
  moneda                         text,
  onboarding_paso                integer not null default 0,
  onboarding_completado          boolean not null default false,
  created_at                     timestamptz not null default now()
);

create table business_profiles (
  id                    uuid primary key default gen_random_uuid(),
  branch_id             uuid not null references sucursales(id) on delete cascade,
  descripcion           text,
  politicas             jsonb default '[]'::jsonb,
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
  apodo          text,
  avatar_url     text,
  rol            rol_usuario not null,
  superadmin_rol_id uuid references superadmin_roles(id),
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
  categoria     text,
  subcategoria  text,
  disponible  boolean not null default true,
  created_at  timestamptz not null default now()
);

create table categorias_precios (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizaciones(id) on delete cascade,
  branch_id   uuid not null references sucursales(id) on delete cascade,
  nombre      text not null,
  parent_id   uuid references categorias_precios(id) on delete cascade,
  orden       integer not null default 0,
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
  prioridad_default     text default 'normal',
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
  meta_user_id        text,
  calidad_mensajeria  text check (calidad_mensajeria in ('GREEN', 'YELLOW', 'RED', 'UNKNOWN')),
  calidad_actualizada_en timestamptz,
  fecha_conexion      timestamptz,
  ultima_actividad    timestamptz,
  created_at          timestamptz not null default now(),
  constraint channels_tenant_branch_tipo_key unique (tenant_id, branch_id, tipo)
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
  modo                 text check (modo in ('ignorar', 'respuesta_automatica', 'derivar')),
  respuesta_auto       text,
  trato                text default 'normal' check (trato in ('normal', 'sin_ia', 'bloqueado')),
  blacklist            boolean not null default false,
  blacklist_razon      text,
  fecha_blacklist      timestamptz,
  nota                 text,
  fecha_actualizacion  timestamptz,
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
  resumen              text,
  ia_procesando_desde  timestamptz default null,
  ia_intentos_fallidos integer not null default 0
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
  moneda      text not null default 'USD',
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
  timestamp  timestamptz not null default now(),
  entidad_id uuid
);

create table notification_preferences (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id) on delete cascade,
  tipo       text not null,
  activado   boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, tipo)
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
alter table categorias_precios enable row level security;
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
alter table notification_preferences enable row level security;
alter table plans              enable row level security;
alter table vendedores         enable row level security;
alter table error_logs         enable row level security;
alter table superadmin_roles   enable row level security;

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

create policy categorias_precios_tenant on categorias_precios for all
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
  using (
    is_super_admin()
    or (
      tenant_id = auth_tenant_id()
      and (
        auth_rol() = 'admin'
        or exists (
          select 1 from public.users u
          join public.roles_personalizados rp on rp.id = u.rol_personalizado_id
          where u.id = auth.uid() and rp.es_propietario = true
        )
        or auth_has_permission((select branch_id from public.users where id = auth.uid()), 'audit_log', 'lectura')
      )
    )
  );

create policy notif_own on notifications for all
  using (is_super_admin() or user_id = auth.uid())
  with check (is_super_admin() or user_id = auth.uid());

create policy notif_prefs_own on notification_preferences for all
  using (is_super_admin() or user_id = auth.uid())
  with check (is_super_admin() or user_id = auth.uid());

create policy plans_read on plans for select using (auth.uid() is not null);
create policy plans_super on plans for all using (is_super_admin()) with check (is_super_admin());
create policy vendedores_super on vendedores for all using (is_super_admin()) with check (is_super_admin());
create policy errors_super on error_logs for all using (is_super_admin()) with check (is_super_admin());

create policy superadmin_roles_select on superadmin_roles for select
  using (is_super_admin());
create policy superadmin_roles_write on superadmin_roles for all
  using (exists (select 1 from users u join superadmin_roles r on r.id = u.superadmin_rol_id where u.id = auth.uid() and (r.es_propietario = true or r.nivel <= 2)))
  with check (exists (select 1 from users u join superadmin_roles r on r.id = u.superadmin_rol_id where u.id = auth.uid() and (r.es_propietario = true or r.nivel <= 2)));

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
  values (v_org_id, 'Principal', true, 0, false)
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
-- 16. SISTEMA DE TICKETS (VENDEDOR ↔ SUPERADMIN)
-- ============================================================================

create table ticket_categorias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  color      text not null default '#6366f1',
  created_at timestamptz not null default now()
);

create table support_tickets (
  id             uuid primary key default gen_random_uuid(),
  vendedor_id    uuid not null references vendedores(id) on delete cascade,
  asunto         text not null,
  categoria      text, -- Deprecated, use categoria_id instead
  categoria_id   uuid references ticket_categorias(id),
  asignado_a     uuid references users(id),
  prioridad      text default 'normal',
  estatus        text not null default 'abierto',
  fecha_apertura timestamptz not null default now(),
  fecha_cierre   timestamptz,
  calificacion   integer,
  comentario_calificacion text,
  fecha_calificacion timestamptz
);

create table support_ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references support_tickets(id) on delete cascade,
  user_id    uuid references users(id),
  mensaje    text not null,
  timestamp  timestamptz not null default now()
);

alter table support_tickets enable row level security;
alter table support_ticket_messages enable row level security;

create policy tickets_select on support_tickets for select
  using (exists (select 1 from public.users where id = auth.uid() and rol = 'super_admin') or vendedor_id = (select id from vendedores where user_id = auth.uid()));
create policy tickets_insert on support_tickets for insert
  with check (is_super_admin() or vendedor_id = (select id from vendedores where user_id = auth.uid()));
create policy tickets_update on support_tickets for update
  using (is_super_admin() or vendedor_id = (select id from vendedores where user_id = auth.uid()));

create policy ticket_messages_select on support_ticket_messages for select
  using (exists (select 1 from public.users where id = auth.uid() and rol = 'super_admin') or ticket_id in (select id from support_tickets where vendedor_id = (select id from vendedores where user_id = auth.uid())));
create policy ticket_messages_insert on support_ticket_messages for insert
  with check (is_super_admin() or ticket_id in (select id from support_tickets where vendedor_id = (select id from vendedores where user_id = auth.uid())));

alter table ticket_categorias enable row level security;

create policy categorias_select on ticket_categorias for select
  using (exists (select 1 from public.users where id = auth.uid() and rol = 'super_admin'));
create policy categorias_insert on ticket_categorias for insert
  with check (exists (select 1 from public.users where id = auth.uid() and rol = 'super_admin'));
create policy categorias_update on ticket_categorias for update
  using (exists (select 1 from public.users where id = auth.uid() and rol = 'super_admin'));
create policy categorias_delete on ticket_categorias for delete
  using (exists (select 1 from public.users where id = auth.uid() and rol = 'super_admin'));

-- ============================================================================
-- 17. JOBS PROGRAMADOS (pg_cron)
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists "supabase_vault";

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
-- 18. SOPORTE A CLIENTES FINALES
-- ============================================================================

create table client_ticket_categorias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  color      text not null default '#6366f1',
  created_at timestamptz not null default now()
);

create table client_tickets (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references organizaciones(id) on delete cascade,
  branch_id      uuid references sucursales(id),
  user_id        uuid not null references users(id),
  asunto         text not null,
  categoria_id   uuid references client_ticket_categorias(id),
  prioridad      text default 'normal',
  estatus        text not null default 'abierto',
  asignado_a     uuid references users(id),
  fecha_apertura timestamptz not null default now(),
  fecha_cierre   timestamptz,
  calificacion   integer,
  comentario_calificacion text,
  fecha_calificacion timestamptz
);

create table client_ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references organizaciones(id) on delete cascade,
  ticket_id  uuid not null references client_tickets(id) on delete cascade,
  user_id    uuid references users(id),
  mensaje    text not null,
  timestamp  timestamptz not null default now()
);

create table client_ticket_notas (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references client_tickets(id) on delete cascade,
  tenant_id    uuid not null references organizaciones(id) on delete cascade,
  user_id      uuid not null references users(id),
  nota         text not null,
  visibilidad  text not null default 'privada' check (visibilidad in ('privada', 'compartida')),
  created_at   timestamptz not null default now()
);

alter table client_ticket_categorias enable row level security;
alter table client_tickets enable row level security;
alter table client_ticket_messages enable row level security;

create policy cat_cliente_select on client_ticket_categorias for select
  using (exists (select 1 from users where id = auth.uid() and rol = 'super_admin') or auth.uid() is not null);
create policy cat_cliente_insert on client_ticket_categorias for insert
  with check (exists (select 1 from users where id = auth.uid() and rol = 'super_admin'));
create policy cat_cliente_update on client_ticket_categorias for update
  using (exists (select 1 from users where id = auth.uid() and rol = 'super_admin'));
create policy cat_cliente_delete on client_ticket_categorias for delete
  using (exists (select 1 from users where id = auth.uid() and rol = 'super_admin'));

create policy client_tickets_select on client_tickets for select
  using (
    exists (select 1 from users where id = auth.uid() and rol = 'super_admin')
    or (tenant_id = auth_tenant_id() and auth_has_permission(branch_id, 'soporte', 'lectura'))
  );
create policy client_tickets_insert on client_tickets for insert
  with check (
    exists (select 1 from users where id = auth.uid() and rol = 'super_admin')
    or (tenant_id = auth_tenant_id() and auth_has_permission(branch_id, 'soporte', 'escritura'))
  );
create policy client_tickets_update on client_tickets for update
  using (
    exists (select 1 from users where id = auth.uid() and rol = 'super_admin')
    or (tenant_id = auth_tenant_id() and auth_has_permission(branch_id, 'soporte', 'escritura'))
  );

create policy client_ticket_messages_select on client_ticket_messages for select
  using (
    exists (select 1 from users where id = auth.uid() and rol = 'super_admin')
    or ticket_id in (select id from client_tickets where tenant_id = auth_tenant_id() and auth_has_permission(branch_id, 'soporte', 'lectura'))
  );
create policy client_ticket_messages_insert on client_ticket_messages for insert
  with check (
    exists (select 1 from users where id = auth.uid() and rol = 'super_admin')
    or ticket_id in (select id from client_tickets where tenant_id = auth_tenant_id() and auth_has_permission(branch_id, 'soporte', 'escritura'))
  );

alter table client_ticket_notas enable row level security;

create policy notas_cliente_select on client_ticket_notas for select
  using (
    tenant_id = auth_tenant_id() and (visibilidad = 'compartida' or user_id = auth.uid())
  );
create policy notas_cliente_insert on client_ticket_notas for insert
  with check (tenant_id = auth_tenant_id() and user_id = auth.uid());
create policy notas_cliente_delete on client_ticket_notas for delete
  using (tenant_id = auth_tenant_id() and user_id = auth.uid());

alter publication supabase_realtime add table client_tickets, client_ticket_messages;

-- ============================================================================
-- FIN DEL ESQUEMA
-- ============================================================================

-- ============================================================================
-- 15. CRONS DE NOTIFICACIONES (Módulo de Clientes)
-- ============================================================================

create or replace function check_clientes_por_vencer_y_creditos()
returns void language plpgsql security definer as $$
declare
  r_org record;
  r_admin record;
  v_pref boolean;
  v_saldo numeric;
begin
  -- Trial/organización por vencer -> notificar a los ADMINS de esa organización
  for r_org in
    select id, nombre, fecha_vencimiento, estado
    from public.organizaciones
    where estado in ('activo', 'trial')
      and fecha_vencimiento >= current_date
      and fecha_vencimiento <= current_date + 3
  loop
    for r_admin in
      select id from public.users where tenant_id = r_org.id and rol = 'admin'
    loop
      select activado into v_pref from public.notification_preferences
      where user_id = r_admin.id and tipo = 'trial_por_vencer';
      if coalesce(v_pref, true) then
        insert into public.notifications (user_id, tenant_id, tipo, titulo, cuerpo, url, entidad_id)
        values (r_admin.id, r_org.id, 'trial_por_vencer', 'Tu plan está por vencer',
          'Tu cuenta vence el ' || to_char(r_org.fecha_vencimiento, 'DD/MM/YYYY') || '. Contacta con soporte para renovar.',
          '/dashboard', r_org.id);
      end if;
    end loop;
  end loop;

  -- Créditos bajos -> notificar a ADMINS del cliente Y a todos los superadmins
  for r_org in
    select o.id, o.nombre, o.plan_id, p.creditos_mensuales, p.umbral_alerta_creditos
    from public.organizaciones o
    join public.plans p on p.id = o.plan_id
    where o.estado in ('activo', 'trial')
  loop
    select saldo into v_saldo from public.message_quotas
    where tenant_id = r_org.id order by timestamp desc limit 1;

    if v_saldo is not null and r_org.creditos_mensuales > 0 and v_saldo < r_org.umbral_alerta_creditos then
      -- Notificar a admins del cliente
      for r_admin in select id from public.users where tenant_id = r_org.id and rol = 'admin' loop
        select activado into v_pref from public.notification_preferences where user_id = r_admin.id and tipo = 'creditos_bajos';
        if coalesce(v_pref, true) then
          insert into public.notifications (user_id, tenant_id, tipo, titulo, cuerpo, url, entidad_id)
          values (r_admin.id, r_org.id, 'creditos_bajos', 'Créditos de IA casi agotados',
            'Te quedan pocos créditos de IA (' || v_saldo || ' de ' || r_org.creditos_mensuales || '). Considera ampliar tu plan.',
            '/dashboard', r_org.id);
        end if;
      end loop;
      -- Notificar a superadmins
      for r_admin in select id from public.users where rol = 'super_admin' and activo = true loop
        select activado into v_pref from public.notification_preferences where user_id = r_admin.id and tipo = 'creditos_cliente_bajos';
        if coalesce(v_pref, true) then
          insert into public.notifications (user_id, tenant_id, tipo, titulo, cuerpo, url, entidad_id)
          values (r_admin.id, r_org.id, 'creditos_cliente_bajos', 'Cliente con créditos bajos',
            'La organización "' || r_org.nombre || '" tiene pocos créditos de IA (' || v_saldo || ' de ' || r_org.creditos_mensuales || ').',
            '/superadmin/organizaciones', r_org.id);
        end if;
      end loop;
    end if;
  end loop;
end;
$$;

select cron.schedule(
  'notificar-clientes-vencer-y-creditos',
  '0 10 * * *',
  $$ select check_clientes_por_vencer_y_creditos(); $$
);

-- Casos sin resolver mucho tiempo -> notificar a superadmins
create or replace function check_casos_estancados()
returns void language plpgsql security definer as $$
declare
  r_caso record;
  r_admin record;
  v_pref boolean;
  v_ultima_actividad timestamptz;
begin
  for r_caso in
    select c.id, c.tenant_id, o.nombre as org_nombre
    from public.cases c
    join public.organizaciones o on o.id = c.tenant_id
    where c.estatus not in ('resuelto', 'cerrado')
      and c.fecha_apertura < now() - interval '24 hours'
  loop
    select max(timestamp) into v_ultima_actividad from public.case_notes where case_id = r_caso.id;
    if v_ultima_actividad is null or v_ultima_actividad < now() - interval '24 hours' then
      for r_admin in select id from public.users where rol = 'super_admin' and activo = true loop
        select activado into v_pref from public.notification_preferences where user_id = r_admin.id and tipo = 'caso_estancado';
        if coalesce(v_pref, true) then
          -- Evitar duplicados: solo notificar si no se notificó este mismo caso en las últimas 24h
          if not exists (
            select 1 from public.notifications
            where user_id = r_admin.id and tipo = 'caso_estancado' and entidad_id = r_caso.id
              and timestamp > now() - interval '24 hours'
          ) then
            insert into public.notifications (user_id, tenant_id, tipo, titulo, cuerpo, url, entidad_id)
            values (r_admin.id, r_caso.tenant_id, 'caso_estancado', 'Caso sin resolver hace tiempo',
              'Un caso de "' || r_caso.org_nombre || '" lleva más de 24h sin actividad.',
              '/superadmin/organizaciones', r_caso.id);
          end if;
        end if;
      end loop;
    end if;
  end loop;
end;
$$;

select cron.schedule(
  'notificar-casos-estancados',
  '0 11 * * *',
  $$ select check_casos_estancados(); $$
);

-- Deducción de cuota de IA
CREATE OR REPLACE FUNCTION descontar_cuota_ia(
  p_tenant_id uuid,
  p_cantidad integer,
  p_descripcion text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ultimo_saldo integer;
  v_nuevo_saldo integer;
BEGIN
  -- 1. Candado de concurrencia a nivel transaccional
  PERFORM 1 FROM public.organizaciones WHERE id = p_tenant_id FOR UPDATE;
  
  -- 2. Lectura del saldo
  SELECT saldo INTO v_ultimo_saldo
  FROM public.message_quotas
  WHERE tenant_id = p_tenant_id
  ORDER BY timestamp DESC
  LIMIT 1;

  IF v_ultimo_saldo IS NULL THEN
    v_ultimo_saldo := 0;
  END IF;

  v_nuevo_saldo := v_ultimo_saldo - p_cantidad;

  -- 3. Deducción de cuota
  INSERT INTO public.message_quotas (
    tenant_id, tipo, cantidad, saldo, descripcion
  ) VALUES (
    p_tenant_id, 'debito', p_cantidad, v_nuevo_saldo, p_descripcion
  );

  RETURN v_nuevo_saldo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.descontar_cuota_ia(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descontar_cuota_ia(uuid, integer, text) TO service_role, postgres;

-- Disparador del Webhook IA
CREATE OR REPLACE FUNCTION disparar_webhook_ia()
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
  r record;
  req_id bigint;
  v_secret text;
BEGIN
  -- Lectura segura del Vault
  SELECT decrypted_secret INTO v_secret 
  FROM vault.decrypted_secrets 
  WHERE name = 'cron_webhook_secret' LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'El secreto cron_webhook_secret no está configurado en Vault';
  END IF;

  -- Selección de conversaciones candidatas
  FOR r IN
    SELECT 
      c.id as conversation_id,
      s.tiempo_agrupacion_seg
    FROM public.conversations c
    JOIN public.sucursales s ON s.id = c.branch_id
    WHERE c.estado = 'activa'
      AND c.ia_pausada = false
      AND (c.ia_procesando_desde IS NULL OR c.ia_procesando_desde < now() - interval '2 minutes')
      -- Condición 1: Ya pasó el tiempo de espera desde el último mensaje
      AND c.fecha_ultimo_mensaje < now() - (s.tiempo_agrupacion_seg || ' seconds')::interval
      -- Condición 2: El último mensaje absoluto de la conversación es del cliente
      AND (
        SELECT remitente 
        FROM public.messages m 
        WHERE m.conversation_id = c.id 
        ORDER BY m.timestamp DESC, m.id DESC 
        LIMIT 1
      ) = 'cliente'
  LOOP
    -- Bloqueo inmediato anti-condición de carrera
    UPDATE public.conversations 
    SET ia_procesando_desde = now() 
    WHERE id = r.conversation_id;

    -- Petición segura a Vercel con pg_net y URL de producción real
    SELECT net.http_post(
        url := 'https://respondi.vercel.app/api/ai/process',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_secret
        ),
        body := json_build_object('conversation_id', r.conversation_id)::jsonb
    ) INTO req_id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.disparar_webhook_ia() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disparar_webhook_ia() TO service_role, postgres;

-- Programación del cron del Agrupador (cada 10 segundos)
SELECT cron.schedule('disparador-ia-agrupador', '10 seconds', 'SELECT disparar_webhook_ia();');

-- ============================================================================
-- PLANTILLAS DE WHATSAPP
-- ============================================================================

-- Función genérica para el trigger de updated_at (si no existe)
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizaciones(id) on delete cascade,
  branch_id uuid not null references sucursales(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  nombre text not null check (nombre ~ '^[a-z0-9_]+$'),
  contenido text not null,
  idioma text not null default 'es_ES',
  categoria text not null check (categoria in ('marketing', 'utilidad', 'autenticacion')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo_rechazo text,
  meta_template_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_templates_channel_nombre_idioma_key unique (channel_id, nombre, idioma)
);

create trigger update_whatsapp_templates_updated_at
  before update on whatsapp_templates
  for each row
  execute function update_updated_at_column();

alter table whatsapp_templates enable row level security;

create policy whatsapp_templates_tenant on whatsapp_templates for all
  using (is_super_admin() or tenant_id = auth_tenant_id())
  with check (is_super_admin() or tenant_id = auth_tenant_id());

-- ==============================================================================
-- [NUEVO] TAREA DE RESUMEN DE INACTIVIDAD (>24H)
-- ==============================================================================
CREATE OR REPLACE FUNCTION disparar_webhook_resumen_ia()
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
  r record;
  req_id bigint;
  v_secret text;
BEGIN
  -- Lectura segura del Vault
  SELECT decrypted_secret INTO v_secret 
  FROM vault.decrypted_secrets 
  WHERE name = 'cron_webhook_secret' LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'El secreto cron_webhook_secret no está configurado en Vault';
  END IF;

  -- Selección de conversaciones inactivas > 24h
  FOR r IN
    SELECT id 
    FROM public.conversations
    WHERE estado = 'activa'
      AND fecha_ultimo_mensaje < now() - interval '24 hours'
      AND (fecha_ultimo_resumen IS NULL OR fecha_ultimo_resumen < fecha_ultimo_mensaje)
      AND (ia_procesando_desde IS NULL OR ia_procesando_desde < now() - interval '2 minutes')
  LOOP
    -- Bloqueo inmediato anti-condición de carrera
    UPDATE public.conversations 
    SET ia_procesando_desde = now() 
    WHERE id = r.id;

    -- Petición segura a Vercel con pg_net
    SELECT net.http_post(
        url := 'https://respondi.vercel.app/api/ai/summarize',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_secret
        ),
        body := json_build_object('conversation_id', r.id)::jsonb
    ) INTO req_id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.disparar_webhook_resumen_ia() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disparar_webhook_resumen_ia() TO service_role, postgres;

SELECT cron.schedule('job_resumen_inactividad', '*/30 * * * *', 'SELECT disparar_webhook_resumen_ia();');
