# CAFE-15 商品可以標「已售完」

## 目的

CAFE-15：店員可以把今天賣完的商品標成「已售完」。顧客在菜單上還看得到，但不能加入購物車，不會點了才被告知沒有。

## 變更內容

- 資料庫：products 新增 sold_out（預設 false），刪除 legacy_sku（migration 20261104000000_sold_out）
- API：GET /products 多回 soldOut；新增 PATCH /products/:id/sold-out，body 是 {"soldOut": true 或 false}
- 前台：MenuPage 在售完的商品旁顯示「（已售完）」，「加入」按鈕 disabled

## 驗收條件對照

- AC1：「如何驗證」第 3、4 行：標成售完後，GET /products 的拿鐵 soldOut 是 true，仍在清單裡
- AC2：標成售完後打開 http://localhost:5174 ，拿鐵旁有「（已售完）」，「加入」按不下去，其他商品照常
- AC3：「如何驗證」第 5、6 行：送 {"soldOut":false} 後 soldOut 回到 false，菜單上又可以加入

## 如何驗證

npm run dev 要另開一個終端機，一直開著。

```bash
npm run db:setup   # 套用新的 migration
npm run dev
curl -X PATCH http://localhost:3100/products/2/sold-out -H 'Content-Type: application/json' -d '{"soldOut":true}'
curl http://localhost:3100/products
curl -X PATCH http://localhost:3100/products/2/sold-out -H 'Content-Type: application/json' -d '{"soldOut":false}'
curl http://localhost:3100/products
```

## 風險與回滾

migration 會刪掉 legacy_sku，已經沒有程式在讀，不需要備份。出事就 git revert，下一版再看要不要刪別的欄位。
