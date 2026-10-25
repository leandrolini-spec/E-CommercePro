-- Mercado Libre y cola de sincronización. Todo con "if not exists": se puede aplicar sobre una base nueva o sobre una que ya lo tiene.

create table if not exists public.ml_accounts (
  project_id uuid primary key references public.projects(id) on delete cascade,
  ml_user_id bigint not null,
  nickname text,
  site_id text,
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  scope text,
  status text not null default 'connected',
  last_error text,
  connected_at timestamptz not null default now(),
  refresh_lock_until timestamptz
);

create table if not exists public.ml_oauth_states (
  state text primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  code_verifier text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ml_resources (
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null,
  ml_id text not null,
  data jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (project_id, kind, ml_id)
);
create index if not exists ml_resources_project_id_kind_fetched_at_idx on public.ml_resources (project_id, kind, fetched_at desc);

create table if not exists public.ml_item_links (
  project_id uuid not null references public.projects(id) on delete cascade,
  ml_item_id text not null,
  product_id text not null references public.products(id) on delete cascade,
  primary key (project_id, ml_item_id)
);

create table if not exists public.sync_jobs (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  topic text not null,
  resource text not null,
  status text not null default 'pendiente',
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  source text
);
create unique index if not exists sync_jobs_pending_unique on public.sync_jobs (project_id, topic, resource) where status = 'pendiente';
create index if not exists sync_jobs_status_run_after_idx on public.sync_jobs (status, run_after);

create table if not exists public.sync_logs (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed int not null default 0,
  errors int not null default 0,
  warnings int not null default 0,
  status text not null default 'ejecutando',
  detail jsonb
);
create index if not exists sync_logs_project_id_started_at_idx on public.sync_logs (project_id, started_at desc);

-- Sin políticas: solo accede el servidor con la clave de servicio.
alter table public.ml_accounts enable row level security;
alter table public.ml_oauth_states enable row level security;
alter table public.ml_resources enable row level security;
alter table public.ml_item_links enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.sync_logs enable row level security;
