-- 練習 1：收據的 bucket 與權限。照正式專案的寫法寫 'receipts'（判分時測試會換成這一題專屬的 bucket 名稱）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 2097152, array['image/png', 'image/jpeg']);

-- 顧客：路徑是 <user_id>/<檔名>，第一層資料夾要是自己的 id
create policy "收據：顧客上傳到自己的資料夾" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "收據：顧客讀自己的" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- upsert 覆蓋舊檔是 UPDATE：USING 管「能改哪些舊的列」、WITH CHECK 管「改完的列」
create policy "收據：顧客覆蓋自己的" on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 店員：角色放在只有伺服器改得到的 app_metadata（第 5 課）
create policy "收據：店員讀全部" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'staff');
