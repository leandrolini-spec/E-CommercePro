-- Envíos, bandeja de mensajes y lecturas. Todo con "if not exists".
-- Las columnas eta y carrier de envíos las agrega después 20261015000001.

create table if not exists public.shipments (
  id text primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  sale_id text,
  order_ref text not null default '',
  channel text not null default '',
  customer text not null default '',
  phone text not null default '',
  address text not null default '',
  city text not null default '',
  zip text not null default '',
  notes text not null default '',
  tracking text not null default '',
  stage text not null default 'compra',
  dispatched_at date,
  delivered_at date,
  created_at date not null default current_date,
  ml_status text not null default '',
  ml_shipment_id text,
  items text not null default '',
  courier text not null default '',
  courier_phone text not null default '',
  vehicle text not null default '',
  plate text not null default ''
);
create index if not exists shipments_project_idx on public.shipments (project_id, stage);

create table if not exists public.inbox_threads (
  id text primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  channel text not null,
  kind text not null default 'mensaje',
  external_id text not null,
  customer_id text,
  contact_name text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  contact_handle text not null default '',
  subject text not null default '',
  last_message text not null default '',
  last_at timestamptz not null default now(),
  unread boolean not null default true,
  status text not null default 'abierto',
  link text not null default '',
  created_at timestamptz not null default now(),
  unique (project_id, channel, external_id)
);
create index if not exists inbox_threads_project_last on public.inbox_threads (project_id, last_at desc);

create table if not exists public.inbox_messages (
  id text primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  thread_id text not null references public.inbox_threads(id) on delete cascade,
  direction text not null default 'in',
  body text not null default '',
  at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
create index if not exists inbox_messages_thread on public.inbox_messages (thread_id, at);

create table if not exists public.message_reads (
  project_id uuid not null,
  key text not null,
  read_at timestamptz not null default now(),
  primary key (project_id, key)
);

alter table public.shipments enable row level security;
alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.message_reads enable row level security;
