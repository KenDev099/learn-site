# ADR-001：咖啡店的資料儲存組合

- 狀態：已採納
- 日期：2026-11-01

## 背景

線上點餐上線後，尖峰（早上 8 點）每秒約 20 次結帳、200 次菜單搜尋，每天約 3,000 筆訂單，每筆附一份約 2 KB 的電子收據。團隊 3 位工程師，沒有專職 DBA。需求：訂單不能遺失、不能重複；搜尋要能打錯字、用「拿鐵 燕麥」這類關鍵字找到商品；收據要保存 7 年。

## 決定

PostgreSQL 是唯一的記錄系統；Redis、Elasticsearch 只放可以丟掉、可以重建的衍生資料；收據檔案放物件儲存，PostgreSQL 只記 key。跨儲存的更新一律經過 outbox，由 worker 非同步完成。

| 資料 | 儲存 | 記錄系統 | 重建方式 | 可接受遺失 |
|---|---|---|---|---|
| 訂單、品項（orders、order_items） | PostgreSQL | 是 | 從備份還原（每日全量＋WAL 歸檔，可還原到任一時間點） | 否 |
| 商品、庫存、熱銷度（products） | PostgreSQL | 是 | 從備份還原 | 否 |
| 購物車 | Redis（hash，TTL 7 天） | 否 | 不重建，顧客重新加入 | 是：只影響體驗，產品已同意 |
| 限流計數、冪等結果 | Redis | 否 | 不重建；冪等由 orders.idempotency_key UNIQUE 兜底 | 是 |
| 菜單搜尋索引 | Elasticsearch（別名 menu） | 是 | rebuild-search：從 products 全量匯入新索引後切換別名 | 是：重建約 1 分鐘，期間改用 PostgreSQL ILIKE 查詢 |
| 電子收據檔案 | S3（receipts/年/月/訂單id.txt） | 否 | find-missing-receipts：由訂單重新產生並上傳 | 是：可由訂單重新產生 |

## 替代方案

- 只用 PostgreSQL：搜尋用全文檢索＋pg_trgm、購物車放表裡。商品只有幾十項時這樣就夠，但產品要求同義詞與相關性排序，ES 在這一點較省工；購物車寫入頻繁，放 Redis 不佔資料庫連線。
- 訂單放 MongoDB：文件模型彈性，但訂單需要跨表交易、外鍵與報表 JOIN，PostgreSQL 較適合。
- 收據存 bytea：備份與複寫跟著變大變慢（第 12 課），不採用。

## 後果

- 好處：核心的結帳只依賴 PostgreSQL 與 Redis；ES、S3 故障時仍可下單，之後由 outbox 補上。
- 代價：要維運四種儲存，每一種都要有監控、容量計畫與升級流程；搜尋與收據是最終一致，可能落後幾秒到幾分鐘。
- 必須提供：rebuild-search、find-missing-receipts 兩份 runbook，與「最舊未處理 outbox 事件的年齡」告警。

## 重新評估的條件

- 商品數仍在 200 項以下、搜尋需求沒有長出同義詞與相關性時，評估移除 Elasticsearch，改用 PostgreSQL 全文檢索。
- 尖峰結帳超過每秒 500 次，或 PostgreSQL CPU 長期超過 70%：評估讀副本、分割表。
- Redis 記憶體使用超過上限 70%，或出現 noeviction 寫入錯誤。
