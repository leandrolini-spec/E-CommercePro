create table if not exists public.tn_accounts (
  project_id uuid primary key references public.projects(id) on delete cascade,
  store_id bigint not null,
  store_name text,
  access_token_enc text not null,
  scope text,
  status text not null default 'connected',
  last_error text,
  connected_at timestamptz not null default now()
);
create table if not exists public.tn_oauth_states (
  state text primary key,
  project_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.tn_accounts enable row level security;
alter table public.tn_oauth_states enable row level security;

create table if not exists public.tn_resources (
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null,
  tn_id text not null,
  data jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (project_id, kind, tn_id)
);
create table if not exists public.tn_item_links (
  project_id uuid not null references public.projects(id) on delete cascade,
  tn_product_id text not null,
  product_id text not null,
  primary key (project_id, tn_product_id)
);
alter table public.tn_resources enable row level security;
alter table public.tn_item_links enable row level security;

alter table public.project_settings add column if not exists company jsonb not null default '{}'::jsonb;
alter table public.project_settings add column if not exists brand jsonb not null default '{}'::jsonb;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

alter table public.shipments add column if not exists eta date;
alter table public.shipments add column if not exists carrier text not null default '';

-- Índices de claves foráneas que faltaban (aviso del asesor de rendimiento de Supabase).
create index if not exists inbox_messages_project_idx on public.inbox_messages (project_id);
create index if not exists ml_item_links_product_idx on public.ml_item_links (product_id);
create index if not exists ml_oauth_states_project_idx on public.ml_oauth_states (project_id);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id);

-- Vista liviana de las conversaciones de Mercado Libre (solo lo que usa el CRM, ~60 % menos de datos) con la fecha del último mensaje.
create or replace view public.ml_conversations_compact with (security_invoker = true) as
select c.project_id, c.ml_id,
  (select max(m->'message_date'->>'created') from jsonb_array_elements(coalesce(c.data->'messages','[]'::jsonb)) m) as last_at,
  jsonb_build_object('messages', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m->'id', 'from', m->'from', 'text', m->'text',
      'message_date', jsonb_build_object('created', m->'message_date'->'created', 'received', m->'message_date'->'received', 'read', m->'message_date'->'read'),
      'message_resources', m->'message_resources'))
    from jsonb_array_elements(coalesce(c.data->'messages','[]'::jsonb)) m), '[]'::jsonb)) as data
from public.ml_resources c where c.kind = 'conversation';
revoke all on public.ml_conversations_compact from anon, authenticated;
grant select on public.ml_conversations_compact to service_role;

alter table sales add column if not exists welcomed boolean not null default false;
alter table sales add column if not exists welcomed_at date;
alter table sales add column if not exists refunded_at date;
alter table sales add column if not exists welcome_sent_at date;
alter table sales add column if not exists welcome_by text;
alter table sales add column if not exists refund_done_at date;
alter table sales add column if not exists waiting_hidden boolean not null default false;
