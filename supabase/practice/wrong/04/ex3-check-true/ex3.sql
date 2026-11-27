create policy "評論公開可讀" on reviews for select to anon, authenticated using (true);
-- USING 限制了改哪幾列，WITH CHECK 卻放行任何新值：可以把評論改成別人寫的
create policy "作者改自己的評論" on reviews for update to authenticated
  using (author_id = (select auth.uid())) with check (true);
grant select on reviews to anon, authenticated;
grant update on reviews to authenticated;
