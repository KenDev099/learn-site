create policy "評論公開可讀" on reviews for select to anon, authenticated using (true);

create policy "作者改自己的評論" on reviews for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

grant select on reviews to anon, authenticated;
grant update (rating, body) on reviews to authenticated;
