-- Etapa 1 · Empresas y usuarios.
-- Qué usuario pertenece a qué empresa, y a qué empresa pertenece cada cuenta de WhatsApp o Instagram.
-- Se puede aplicar más de una vez ("if not exists").

-- Un usuario pertenece a una sola empresa (la clave es el usuario). Varias personas pueden compartir empresa.
create table if not exists public.project_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);
create index if not exists project_members_project_idx on public.project_members (project_id);

-- Cada cuenta de un canal (id del número de WhatsApp, id de la cuenta de Instagram) pertenece a una sola empresa.
create table if not exists public.channel_accounts (
  channel text not null check (channel in ('whatsapp', 'instagram')),
  external_id text not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel, external_id)
);
create index if not exists channel_accounts_project_idx on public.channel_accounts (project_id);

-- Las notificaciones de Mercado Libre llegan con el id de usuario de ML y se busca la empresa por ahí.
create index if not exists ml_accounts_ml_user_idx on public.ml_accounts (ml_user_id);

-- Sin políticas: solo accede el servidor con la clave de servicio. Las claves públicas no ven nada.
alter table public.project_members enable row level security;
alter table public.channel_accounts enable row level security;
