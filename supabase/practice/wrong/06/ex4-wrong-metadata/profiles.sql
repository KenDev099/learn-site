-- 練習 4：註冊時自動建立 profiles 的一列。照正式專案的寫法寫 public.、auth.users（判分時測試會換成這一題專屬的名字）
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default ''
);
alter table public.profiles enable row level security;
create policy "看自己的 profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
grant select on public.profiles to authenticated;

-- 觸發它的是 Auth 服務的資料庫角色（supabase_auth_admin），它沒有 profiles 的權限：用 security definer 以函式擁有者的身分執行，
-- 所以 search_path 鎖成空的，裡面每個名字都寫完整（schema.表名）
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_app_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
