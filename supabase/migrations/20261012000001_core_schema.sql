-- Esquema compartido multiproyecto: toda tabla de negocio lleva project_id.
-- Valores calculados (margen, stock, totales) NO se guardan: se derivan en la aplicación.

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table project_settings (
  project_id uuid primary key references projects(id) on delete cascade,
  currency text not null default 'ARS',
  country text not null default 'Argentina',
  ml_site text not null default 'MLA',
  tax_pct numeric not null default 0,
  channels text[] not null default '{}',
  categories text[] not null default '{}',
  units text[] not null default '{}',
  pay_methods text[] not null default '{}',
  expense_categories text[] not null default '{}',
  cogs_categories text[] not null default '{}',
  costs jsonb not null default '{"logisticsPerShipment":0,"boxPerPack":0,"gncPct":0}'
);

create table suppliers (
  id text primary key, project_id uuid not null references projects(id) on delete cascade,
  name text not null, company text not null default '', phone text not null default '', email text not null default '',
  cuit text not null default '', lead_days int not null default 0, pay_terms text not null default ''
);

create table products (
  id text primary key, project_id uuid not null references projects(id) on delete cascade,
  sku text not null, name text not null, category text not null default '', brand text not null default '', unit text not null default 'unidad',
  cost numeric not null default 0, price numeric not null default 0, min_stock numeric not null default 0, max_stock numeric not null default 0,
  supplier_id text, active boolean not null default true, pack_size int, track_stock boolean not null default true,
  unique (project_id, sku)
);

create table stock_movements (
  id text primary key, project_id uuid not null references projects(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  type text not null, qty numeric not null, date date not null, reason text not null default '', ref text, unit_cost numeric
);

create table customers (
  id text primary key, project_id uuid not null references projects(id) on delete cascade,
  name text not null, company text not null default '', phone text not null default '', email text not null default '',
  city text not null default '', origin text not null default '', created_at date not null default current_date
);

create table purchases (
  id text primary key, project_id uuid not null references projects(id) on delete cascade,
  supplier_id text, date date not null, status text not null, pay_method text not null default '', shipping numeric not null default 0,
  items jsonb not null default '[]'
);

create table sales (
  id text primary key, project_id uuid not null references projects(id) on delete cascade,
  number int not null, customer_id text, date date not null, channel text not null default '', status text not null,
  pay_method text not null default '', extra_costs numeric not null default 0, items jsonb not null default '[]',
  net_amount numeric, pay_status text, ml_order_id text,
  unique (project_id, number)
);
-- Evita duplicar una orden de Mercado Libre al sincronizar (brief, sección 25).
create unique index sales_ml_order_unique on sales (project_id, ml_order_id) where ml_order_id is not null;

create table quotes (
  id text primary key, project_id uuid not null references projects(id) on delete cascade,
  number int not null, customer_id text, date date not null, valid_until date not null, status text not null,
  discount_pct numeric not null default 0, tax_pct numeric not null default 0, items jsonb not null default '[]',
  unique (project_id, number)
);

create table expenses (
  id text primary key, project_id uuid not null references projects(id) on delete cascade,
  date date not null, category text not null default '', description text not null, amount numeric not null,
  pay_method text not null default '', quantity numeric not null default 1, paid_by text not null default '', kit_stock boolean not null default false
);

create table cash_movements (
  id text primary key, project_id uuid not null references projects(id) on delete cascade,
  date date not null, type text not null, account text not null default '', concept text not null, amount numeric not null
);

create table crm_opportunities (
  id text primary key, project_id uuid not null references projects(id) on delete cascade,
  name text not null, customer_name text not null default '', origin text not null default '', value numeric not null default 0,
  stage text not null, probability int not null default 0, due_date date, next_action text not null default ''
);

-- Auditoría preparada (sin usuarios todavía: actor queda nulo).
create table audit_logs (
  id bigint generated always as identity primary key, project_id uuid references projects(id) on delete cascade,
  entity text not null, entity_id text, action text not null, before jsonb, after jsonb, actor text, at timestamptz not null default now()
);

-- Índices por proyecto (todas las consultas filtran por project_id).
create index on suppliers (project_id); create index on products (project_id); create index on stock_movements (project_id, product_id);
create index on customers (project_id); create index on purchases (project_id, date); create index on sales (project_id, date);
create index on quotes (project_id); create index on expenses (project_id, date); create index on cash_movements (project_id, date);
create index on crm_opportunities (project_id); create index on audit_logs (project_id, at);

-- RLS: se activa en todas las tablas. Sin políticas = nadie accede con claves públicas (anon/authenticated).
-- La aplicación accede solo desde el servidor con la clave de servicio, filtrando siempre por project_id.
-- Cuando existan cuentas individuales se agregan políticas por project_id.
do $$
declare t text;
begin
  for t in select unnest(array['projects','project_settings','suppliers','products','stock_movements','customers','purchases','sales','quotes','expenses','cash_movements','crm_opportunities','audit_logs'])
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
