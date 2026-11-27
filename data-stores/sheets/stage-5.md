---
title: 資料儲存選型 階段 5：分析、規模與期末專題
subtitle: 第 13～15 課一頁圖解：OLTP 與 OLAP、欄式儲存、增量 ETL、DynamoDB 的 key 設計、期末專題的結帳、worker 與故障演練
cols: 3
theme: shadcn
課程: 資料儲存選型 第 13～15 課
---
報表先在 PostgreSQL 裡解決，量測證明撐不住才搬到欄式資料庫；DynamoDB 用查詢彈性換擴展性，設計從存取模式表開始。期末專題把四種儲存組起來：核心流程只同步依賴記錄系統（加上有退路的 Redis），衍生資料走 outbox。[回 資料儲存選型 學習地圖](../index.html)

## A 報表離開 OLTP 之前的四步 {span=2}
| 步驟 | 解決什麼 | 資料新鮮度 | 代價 |
|---|---|---|---|
| 1. `EXPLAIN (ANALYZE, BUFFERS)`、補索引 | 只需要讀少量列卻全表掃描 | 即時 | 幾乎沒有 |
| 2. 物化檢視 | 固定報表每次重算同樣的彙總 | 上次 REFRESH | `REFRESH … CONCURRENTLY` 需要唯一索引 |
| 3. 讀副本 | 報表搶主資料庫的資源 | 落後幾毫秒到幾秒 | 長查詢可能被取消；`hot_standby_feedback` 有代價 |
| 4. 分析型資料庫 | 單台 PostgreSQL 掃不動 | 看 ETL 多久跑一次 | 多一套系統、搬資料、自己顧一致性 |

長報表在主資料庫上會搶資源、擋 VACUUM、沖掉快取、佔住連線。量到約 5,000 萬列再考慮分析型資料庫；報表專用帳號設 `statement_timeout`。

## B 欄式儲存為什麼掃得快
| | 列式（PostgreSQL） | 欄式（DuckDB、ClickHouse） |
|---|---|---|
| 掃描只用幾欄 | warn 整列都讀 | ok 只讀需要的欄、壓縮率高 |
| 讀單筆、改單筆 | ok 快 | no 單筆寫入與更新慢，要大批寫入 |

- DuckDB 在程序內執行：`read_csv`／`read_parquet` 直接查檔案，`COPY … TO (FORMAT parquet, PARTITION_BY …)` 匯出分區檔。
- 金額指定 DECIMAL；`getRowObjectsJson()` 把 BIGINT、DECIMAL 轉成字串。
- 報表 SQL：日期用半開區間；每組前 N 名用 `ROW_NUMBER` 加決勝欄位；p95 說清楚是 `quantile_cont` 還是 `quantile_disc`。
- ClickHouse 的效能取決於 ORDER BY（稀疏主鍵）、按月分區與大批寫入；時序資料一定要有保留期與降採樣。

## C 增量 ETL：水位線與它的坑
```flow TB
[讀水位線] -> [keyset 取下一批：id 大於水位線]
[keyset 取下一批：id 大於水位線] -> [同一個交易：冪等寫入加更新水位線]
[同一個交易：冪等寫入加更新水位線] -> {這批滿了?}
{這批滿了?} -> [讀水位線]: 是
{這批滿了?} -> *追上了: 否
```
```callout warn 水位線看不到晚提交與被刪除的資料
序號在 INSERT 時就取得，交易可能晚一點才提交，id 比水位線小就永遠漏掉。正式環境用回溯重疊或 CDC；刪除要用軟刪除或 CDC。
```

## D DynamoDB：只能照 key 查 {span=2}
| 讀法 | 要給什麼 | 用在 |
|---|---|---|
| GetItem | 完整的 PK 加 SK | ok 已知是哪一筆 |
| Query | 完整的 PK，SK 可加範圍條件 | ok 大部分的列表查詢 |
| Scan | 什麼都不用給 | no 整張表讀過，幾乎不該出現在線上 API |

沒有 JOIN 與任意 WHERE；FilterExpression 在讀出來之後才篩，讀取量照算。設計從存取模式表開始：single-table 用前綴（`CUSTOMER#`、`ORDER#`）區分實體，一起讀的資料放進同一個 item collection。SK 是字串，數字補零、時間用 ISO。

## E GSI、熱分區與唯一性
```kv cols=1
GSI: 用另一組屬性重新組織資料；最終一致；沒有索引屬性的 item 不會進去（稀疏索引）
條件放進 key: 例如 SK 開頭放狀態，不是讀完再篩
分區上限: 每秒 3,000 RCU、1,000 WCU；依日期或低基數的 key 會變熱分區
寫入分片: 計算出來的後綴，讀取時平行查 N 片、合併後重新排序
唯一性: `attribute_not_exists` 條件寫入；多個 item 用 TransactWriteItems（最多 100 個動作）
冪等: 條件失敗時檢查是不是自己的重送
```
存取模式常變、需要臨時報表、規模還小時不要選 DynamoDB。DynamoDB Local 能測 API，但不模擬限流。

## F 期末專題：先寫 ADR {span=2}
| 資料 | 儲存 | 記錄系統 | 重建方式 | 可接受遺失 |
|---|---|---|---|---|
| 訂單、品項、商品、庫存、熱銷度 | PostgreSQL | ok 是 | 從備份還原 | no 否 |
| 購物車 | Redis | no 否 | 不重建，顧客重新加入 | ok 只影響體驗 |
| 限流計數、冪等結果 | Redis | no 否 | 不重建；冪等由資料庫 UNIQUE 兜底 | ok |
| 菜單搜尋索引 | Elasticsearch | no 否 | 從 products 全量重建後切換別名 | ok 重建期間品質下降 |
| 收據檔案 | 物件儲存 | no 否 | 由訂單重新產生 | ok |

專題的估算：每天約 3,000 筆訂單，PostgreSQL 一台撐得住；搜尋與收據另外放是為了功能與成本。這張表決定哪些要演練還原、哪些要寫重建工具、故障時誰受影響。

## G 結帳的五道關卡與 worker
```flow TB
[1. 限流：INCR] -> [2. Redis 冪等] -> [3. 資料庫冪等] -> [4. 讀購物車] -> *[5. 一個交易]
[5. 一個交易] --> [outbox 事件] --> [worker：至少一次]
```
交易裡：`ON CONFLICT (idempotency_key) DO NOTHING`、條件式扣庫存、outbox；交易裡不呼叫 ES、S3，清購物車在 COMMIT 之後、失敗只記 log。

| 處理器 | 冪等寫法 |
|---|---|
| 熱銷度 → ES | 寫目前的值加外部版本號，409 算成功 |
| 收據 → 物件儲存 | 固定的物件 key，重做就是覆蓋 |
| 寫回 receipt_key | 跟 processed_at 在同一個交易 |
| 失敗時 | 記 attempts，不標記完成；SKIP LOCKED 讓多個 worker 並行 |

## H 故障的預期行為與 runbook {span=3}
| 故障 | 結帳 | 恢復後 |
|---|---|---|
| Elasticsearch 掛掉 | ok 照常，不碰 ES | outbox 累積的事件自動補上 |
| 物件儲存掛掉 | ok 照常 | worker 重試後補上；漏掉的由對帳找出 |
| Redis 被清空 | ok 照常，資料庫 UNIQUE 擋重複下單 | 不用處理；購物車消失是 ADR 已接受的 |
| PostgreSQL 掛掉 | no 回 503，不能下單 | 記錄系統沒有降級，只能靠高可用與還原 |

- `rebuild-search`：處理別名不存在的情況，一個請求切換。
- `find-missing-receipts`：對照物件儲存，把事件排回 outbox，讓冪等的 worker 修。
- outbox 延遲告警：最舊一筆未處理事件等了多久。

```callout info 維運成本跟著儲存的數量成長
能用 PostgreSQL 做到的，就要有理由才多加一種。演練常抓到的是逾時沒設：每個 client 自己設逾時，並確認核心路徑上沒有同步呼叫它們。
```
