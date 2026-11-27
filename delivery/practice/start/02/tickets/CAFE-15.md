# CAFE-15 商品可以標「已售完」

- 提出：店長
- 負責：阿哲（程式已經寫好，在 changes/CAFE-15.patch），PR 由你開

下午常常有商品賣完，顧客點了才被告知沒有。店員要能把今天賣完的商品標成售完；菜單上還看得到，但不能點。

## 驗收條件

- AC1：Given 拿鐵（id 2）還在賣，When 店員送出 PATCH /products/2/sold-out，body {"soldOut":true}，Then GET /products 裡拿鐵的 soldOut 是 true，拿鐵仍然在清單裡。
- AC2：Given 拿鐵已標成售完，When 顧客打開菜單，Then 拿鐵旁邊顯示「（已售完）」，它的「加入」按鈕不能按；其他商品不受影響。
- AC3：Given 拿鐵已標成售完，When 店員送出 {"soldOut":false}，Then GET /products 裡拿鐵的 soldOut 是 false，菜單上又可以加入。
