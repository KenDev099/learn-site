-- INSERT 沒有「既有的列」可以檢查，只能寫 WITH CHECK
create policy "新增訂單" on orders for insert to authenticated using (customer_id = (select auth.uid()));
grant insert on orders to authenticated;
