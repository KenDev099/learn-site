-- npx prisma db seed：開發用資料庫的示範資料（判分用的資料庫不會跑這個檔）
INSERT INTO customers (name, email) VALUES
  ('王小明', 'ming@example.com'),
  ('陳美華', 'meihua@example'),          -- 故意的錯誤 email：練習 3 的永久性錯誤
  ('林志豪', 'chihhao@example.com');
INSERT INTO orders (customer_id, total) VALUES (1, 190), (2, 110), (3, 80);
