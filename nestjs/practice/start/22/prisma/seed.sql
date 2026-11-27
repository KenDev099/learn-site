-- npx prisma db seed：開發用資料庫的示範資料（判分用的資料庫不會跑這個檔）
INSERT INTO products (name, price) VALUES ('美式咖啡', 80), ('拿鐵', 110), ('卡布奇諾', 110);
INSERT INTO orders (total) VALUES (190), (110);
