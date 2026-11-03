-- WhatsApp y Meta: la cuenta de WhatsApp de cada empresa, el registro de lo que se envía, el consentimiento de los clientes
-- y la cuenta publicitaria de Meta con su gasto diario. Se puede aplicar más de una vez ("if not exists").
-- Las plantillas y los avisos automáticos de cada negocio se guardan en su configuración (project_settings), no en tablas aparte.

-- Una cuenta de WhatsApp (número de la API oficial de Meta) por empresa. El token va cifrado (src/core/crypto.ts).
create table if not exists public.whatsapp_accounts (
  project_id uuid primary key references public.projects(id) on delete cascade,
  phone_number_id text not null,
  waba_id text not null,
  display_phone text,
  token_enc text not null,
  status text not null default 'connected',
  last_error text,
  connected_at timestamptz not null default now()
);
create unique index if not exists whatsapp_accounts_phone_idx on public.whatsapp_accounts (phone_number_id);

-- Todo lo que sale por la API (respuestas y avisos). La clave de idempotencia evita mandar dos veces el mismo aviso.
create table if not exists public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  idempotency_key text not null,
  thread_id text,
  to_phone text not null,
  kind text not null check (kind in ('reply', 'template')),
  template_name text,
  body text,
  wamid text,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  unique (project_id, idempotency_key)
);
create index if not exists whatsapp_outbox_project_idx on public.whatsapp_outbox (project_id, created_at desc);

-- Quién aceptó recibir mensajes de la empresa (y quién pidió la baja).
create table if not exists public.whatsapp_consents (
  project_id uuid not null references public.projects(id) on delete cascade,
  phone text not null,
  opted_in boolean not null default true,
  source text,
  updated_at timestamptz not null default now(),
  primary key (project_id, phone)
);

-- Cuenta publicitaria de Meta (solo lectura) y su gasto por día y campaña.
create table if not exists public.meta_ad_accounts (
  project_id uuid primary key references public.projects(id) on delete cascade,
  ad_account_id text not null,
  token_enc text not null,
  status text not null default 'connected',
  last_error text,
  last_sync_at timestamptz,
  connected_at timestamptz not null default now()
);
create table if not exists public.meta_ad_spend (
  project_id uuid not null references public.projects(id) on delete cascade,
  day date not null,
  campaign_id text not null,
  campaign_name text not null,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  currency text not null default 'ARS',
  primary key (project_id, day, campaign_id)
);

-- Sin políticas: solo accede el servidor con la clave de servicio.
alter table public.whatsapp_accounts enable row level security;
alter table public.whatsapp_outbox enable row level security;
alter table public.whatsapp_consents enable row level security;
alter table public.meta_ad_accounts enable row level security;
alter table public.meta_ad_spend enable row level security;
