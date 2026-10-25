-- Columnas que se sumaron después del esquema base. Todo con "if not exists".

-- Productos: kits, publicaciones por canal, tipo, stock ilimitado y descripción.
alter table public.products add column if not exists components jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists listings jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists kind text not null default 'venta';
alter table public.products add column if not exists unlimited boolean not null default false;
alter table public.products add column if not exists description text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_kind_check') then
    alter table public.products add constraint products_kind_check check (kind = any (array['venta','componente','consumible']));
  end if;
end $$;

-- Clientes: datos completos y agenda.
alter table public.customers add column if not exists nickname text not null default '';
alter table public.customers add column if not exists address text not null default '';
alter table public.customers add column if not exists doc text not null default '';
alter table public.customers add column if not exists notes text not null default '';
alter table public.customers add column if not exists is_full boolean not null default false;
alter table public.customers add column if not exists agenda_off boolean not null default false;

-- Proveedores: directorio.
alter table public.suppliers add column if not exists contact_name text not null default '';
alter table public.suppliers add column if not exists category text not null default '';
alter table public.suppliers add column if not exists address text not null default '';
alter table public.suppliers add column if not exists city text not null default '';
alter table public.suppliers add column if not exists website text not null default '';
alter table public.suppliers add column if not exists notes text not null default '';

-- Gastos y presupuestos.
alter table public.expenses add column if not exists kind text not null default '';
alter table public.quotes add column if not exists shipping numeric not null default 0;
alter table public.quotes add column if not exists customer_name text not null default '';
alter table public.quotes add column if not exists notes text not null default '';
alter table public.quotes add column if not exists customer_phone text not null default '';
alter table public.quotes add column if not exists customer_email text not null default '';
alter table public.quotes add column if not exists share_token text not null default '';

-- Etapas de envío configurables por empresa.
alter table public.project_settings add column if not exists shipment_stages jsonb not null default
  '[{"id":"compra","name":"Compra","color":"#7c3aed"},{"id":"empaquetado","name":"Empaquetado","color":"#f59e0b"},{"id":"en_viaje","name":"En viaje","color":"#2563eb"},{"id":"entregado","name":"Entregado","color":"#16a34a"},{"id":"no_entregado","name":"No se entregó","color":"#dc2626"},{"id":"volvio","name":"Volvió a depósito","color":"#64748b"}]'::jsonb;

-- Retiros e inversiones de los socios.
create table if not exists public.partner_advances (
  id text primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  date date not null,
  partner text not null,
  amount numeric not null check (amount > 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  kind text not null default 'retiro' check (kind = any (array['retiro','inversion']))
);
create index if not exists partner_advances_project_id_date_idx on public.partner_advances (project_id, date);
alter table public.partner_advances enable row level security;
