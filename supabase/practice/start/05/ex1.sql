-- 練習 1：分店店員只看得到自己分店的訂單，也看得到同分店的同事名單。
-- 測試已經建好 stores、orders（store_id 有索引）；store_members 由你建：
create table public.store_members (
  store_id integer not null references public.stores (id),
  user_id uuid not null,
  role text not null default 'staff',
  primary key (store_id, user_id)
);
create index store_members_user_id_idx on public.store_members (user_id);

-- 要做到：
--   1. 兩張表都開 RLS；authenticated 能讀（grant select），anon 不行
--   2. store_members：看得到「自己所屬分店」的所有成員（同事）
--   3. orders：看得到自己所屬分店的訂單
--   4. 「我屬於哪些分店」寫成 private.my_store_ids() 函式（security definer、set search_path = ''），
--      只讓 authenticated 執行；policy 呼叫它
-- 表名照正式專案寫 public.xxx、函式寫 private.xxx（判分時會換成這一題的 schema）
