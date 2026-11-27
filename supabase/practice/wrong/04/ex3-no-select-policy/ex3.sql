-- 只寫了 update policy：update 要先「看得到」那一列，沒有 select policy 時默默改了 0 列
create policy "作者改自己的評論" on reviews for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
grant select on reviews to anon, authenticated;
grant update (rating, body) on reviews to authenticated;
