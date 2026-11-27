-- 課程共用的咖啡店資料（跟 PostgreSQL 課第 25 課一致）。所有練習的測試只讀這四張表、不改它們。
-- 要寫入、建表、寫 policy 的練習，各自在判分專用的 schema t_<slug> 裡做（helpers/supa.ts）。

create table public.customers (
  id integer generated always as identity primary key,
  name text not null,
  phone text,
  city text
);

create table public.products (
  id integer generated always as identity primary key,
  name text not null,
  price integer not null check (price > 0)
);

create table public.orders (
  id integer generated always as identity primary key,
  customer_id integer not null references public.customers (id),
  ordered_at timestamptz not null,
  total integer not null
);
create index orders_customer_id_idx on public.orders (customer_id);

create table public.order_items (
  order_id integer not null references public.orders (id),
  product_id integer not null references public.products (id),
  quantity integer not null check (quantity > 0),
  unit_price integer not null,
  primary key (order_id, product_id)
);
create index order_items_product_id_idx on public.order_items (product_id);

-- 每張表都開 RLS：沒有 policy 的角色一列都看不到
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- 菜單是公開資料：任何人（anon、authenticated）都能讀，不能改
create policy "菜單公開可讀" on public.products for select to anon, authenticated using (true);
grant select on public.products to anon, authenticated;

-- 顧客、訂單只開放給 service_role（後台與測試用）；第 4 課起在自己的 schema 裡練 policy
grant select on public.customers, public.orders, public.order_items to service_role;
