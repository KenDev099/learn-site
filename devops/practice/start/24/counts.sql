-- 各表的列數，印出一行 JSON。backup.sh 用它寫 manifest，restore-drill.sh 用它比對還原結果
-- 執行：docker exec -i ld-24-db psql -XAtq -U postgres -d cafe < counts.sql
SELECT json_build_object(
  'customers',   (SELECT count(*) FROM customers),
  'products',    (SELECT count(*) FROM products),
  'orders',      (SELECT count(*) FROM orders),
  'order_items', (SELECT count(*) FROM order_items)
);
