自己把服務跑起來（在 learn/node/practice/work/26 執行）：

1. 資料庫：在 learn/node/practice 執行 docker compose up -d --wait，然後
   node --env-file=../../.env examples/setup.ts          # 把咖啡店資料和這課的表放進 coffee 資料庫（會整個重建）

2. 假的供應商（另開一個終端機）：
   node examples/fake-supplier.ts                        # 聽 4000 port；MODE=slow、MODE=503 模擬上游出問題

3. 服務：
   SUPPLIER_URL=http://localhost:4000 node --env-file=../../.env main.ts

4. 試試看（再開一個終端機）：
   curl -i localhost:3000/menu?limit=2
   curl -i -X POST localhost:3000/orders -H 'content-type: application/json' \
     -H 'idempotency-key: try-1' -d '{"customerId":1,"items":[{"productId":2,"quantity":1}]}'
   curl -N localhost:3000/orders/9/events               # 另一個終端機 PATCH 這張訂單，看事件進來
   curl -i -X PATCH localhost:3000/orders/9 -H 'content-type: application/json' -d '{"status":"brewing"}'
   curl -i localhost:3000/menu/2/restock
   按 Ctrl+C 看優雅關機的 log
