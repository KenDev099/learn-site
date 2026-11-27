---
title: PostgreSQL 階段 8：資深必備｜查詢效能
subtitle: 第 27～29 課一頁圖解：索引設計、keyset 分頁、GIN 與搜尋、統計資訊、generic plan、慢查詢
cols: 3
theme: shadcn
課程: PostgreSQL 第 27～29 課
對照課文: 2026-11-14
---
依查詢的形狀設計索引，依運算子選索引種類，依量測結果決定先修哪一句。每一步都用 EXPLAIN ANALYZE 證明，不靠感覺。[回 PostgreSQL 學習地圖](../index.html)

## A 一條查詢要問四件事 {span=2}
`SELECT id, ordered_at, total FROM orders WHERE customer_id = 42 AND status = 'paid' ORDER BY ordered_at DESC LIMIT 5`
| 問題 | 這句的答案 |
|---|---|
| 等號欄位 | `customer_id`、`status` |
| 範圍欄位 | 沒有 |
| 排序 | `ordered_at DESC`，只要前 5 筆（Top-N） |
| 回傳欄位 | `id`、`ordered_at`、`total` |

| 索引 | 結果 |
|---|---|
| `(customer_id)` | no 回表讀顧客 42 的 3,005 筆、過濾、再 Sort |
| `(ordered_at, customer_id)` | warn 從最新往回讀，等號條件不能縮小範圍，快慢看運氣 |
| `(customer_id, status)` | warn 少了排序欄位，還是要 Sort |
| `(customer_id, status, ordered_at DESC)` | ok Sort 消失，Buffers 只有個位數 |

等號欄位在前，範圍或排序欄位在後：前面的欄位固定之後，後面那一欄在這一段裡已經排好，讀 5 筆就停。兩個單欄索引用 Bitmap AND 合併，得到的位置沒有順序，還是要 Sort。
```callout info PostgreSQL 18 的 skip scan
第一欄沒條件時，對第一欄的每個值各跳進索引找一次，看 Index Searches。只在第一欄種類很少時划算（5 間分店可以，5,000 位顧客不行），設計時仍以最左前綴為準。
```

## B Keyset 分頁取代 OFFSET
```sql
WHERE (ordered_at, id) < (上一頁最後一筆的 ordered_at, id)
ORDER BY ordered_at DESC, id DESC
LIMIT 20
```
| 情況 | OFFSET | keyset |
|---|---|---|
| 越後面的頁 | no `OFFSET 20000` 先讀 20,000 筆再丟掉 | ok 每頁一樣快 |
| 翻頁期間有新資料 | no 重複或漏掉 | ok 不受影響 |
| 直接跳到第 37 頁 | ok | no 只能一頁接一頁 |

`id` 是同分決勝欄位，同一時間的訂單才不會被跳過或重複。索引 `(ordered_at DESC, id DESC)` 的方向要和 ORDER BY 一致。API 把最後一筆編碼成 `nextCursor`，格式被亂改時回 400。

## C 部分、運算式、覆蓋索引
| 種類 | 例子 | 要注意 |
|---|---|---|
| 部分索引 | `(ordered_at) WHERE status = 'pending'`：又小、寫入其他狀態也不用動它（這課示範資料：16 kB，`(status, ordered_at)` 要 960 kB） | warn 查詢要推得出索引條件；generic plan 看不到 `$1` 的值，條件要寫成常數 |
| 部分唯一索引 | `UNIQUE (phone) WHERE deleted_at IS NULL` | ok 只有未刪除的會員不能重複 |
| 運算式索引 | `UNIQUE (lower(email))` | warn 查詢要寫同一個運算式；只能用 IMMUTABLE，`ordered_at::date` 會得到 42P17 |
| 覆蓋索引 | `(customer_id) INCLUDE (total)` | warn INCLUDE 欄位不能當搜尋條件；Heap Fetches 高代表可見性地圖還沒被 VACUUM 設好 |

`ordered_at::date` 要改成把時區寫死：`((ordered_at AT TIME ZONE 'Asia/Taipei')::date)`；只查某一天時，範圍條件配一般索引就夠。

## D 索引的成本與可以刪的索引
每個索引都讓寫入變慢、佔空間；幫常被更新的欄位（例如 status）建索引，這些 UPDATE 就不能走 HOT。這課的示範：同樣 2 萬多筆付款，寫進有 5 個索引的表，寫入時間約好幾倍、總大小將近 3 倍。看到慢查詢，先想能不能調整既有的索引。
| 索引（看 `pg_stat_user_indexes.idx_scan`） | 可以刪嗎 |
|---|---|
| 被涵蓋：`(order_id)` 是 `(order_id, paid_at DESC)` 的開頭 | ok 就算 idx_scan 不是 0 也可以 |
| `idx_scan = 0` 的一般索引 | warn 先確認統計沒剛重設、沒漏掉月底報表、replica 上的查詢不算在內 |
| `idx_scan = 0` 的唯一索引、主鍵 | no 每次 INSERT 都在檢查重複 |

正式環境的大表上 `CREATE INDEX` 會擋住寫入（第 34 課）。

## E GIN：元素出現在哪些列 {span=2}
```flow LR
[一列商品：tags = 季節限定、外送] -> [GIN：季節限定 → 50, 100, 350 …]: 拆成元素
[一列商品：tags = 季節限定、外送] -> [GIN：外送 → 7, 14, 21, 350 …]
[查詢：tags 含有季節限定] -> *[GIN：季節限定 → 50, 100, 350 …]: 直接取出列編號
```
| 寫法 | 用上 GIN |
|---|---|
| `tags @> ARRAY['季節限定']` | ok Bitmap Index Scan |
| `'季節限定' = ANY (tags)` | no Seq Scan，結果一樣 |
| `options @> '{"milk":"oat"}'` | ok |
| `options ->> 'milk' = 'oat'` | no 改寫成 `@>`，或另建運算式 B-tree |

索引能不能用看運算子，不是語意。JSONB 預設 `jsonb_ops` 支援 `@>`、`?` 等；`jsonb_path_ops` 只支援 `@>`、`@?`、`@@`，比較小（這課的資料上約一半大）。
```callout warn GIN 讀得快、寫得慢
一列有 3 個標籤就要改 3 個地方。fastupdate 先放進待處理清單，等 VACUUM、自動 ANALYZE 或超過 `gin_pending_list_limit`（預設 4MB）時再整理，碰上整理的那次寫入會突然變慢。適合讀很多、改得少的欄位。
```

## F 搜尋工具怎麼選
| 需求 | 工具 |
|---|---|
| 完全相等、範圍、開頭文字 | B-tree |
| JSONB 包含、陣列含有某元素 | GIN |
| 英文關鍵字、詞形變化、相關度排序 | 全文檢索：STORED tsvector 欄位加 GIN |
| 容忍錯字、三個字以上的子字串 | pg_trgm（GIN 或 GiST） |
| 中文斷詞、同義詞、分面、大流量 | 搜尋引擎，用 outbox 或 CDC 同步 |

- 使用者輸入交給 `websearch_to_tsquery`；`to_tsquery` 遇到格式錯會報 42601。
- 內建解析器不會中文斷詞，「燕麥奶拿鐵」整串是一個詞。
- `ILIKE '%黑糖珍%'` 能走 trigram 索引；「拿鐵」只有兩個字，抽不出 trigram，還是 Seq Scan。
- 條件寫 `name % $1`，不要寫 `similarity(name, $1) > 0.3`。

```callout err 產生欄位沒寫 STORED
PostgreSQL 18 起產生欄位預設 VIRTUAL，不能建索引：`0A000 indexes on virtual generated columns are not supported`。
```

## G 先量測，再看估計 {span=2}
```flow LR
[① pg_stat_statements 量測] -> [② 挑總成本最高的] -> [③ EXPLAIN ANALYZE] -> [④ 索引、統計或改寫] -> *[⑤ 再量測，跟基準比]
```
正式環境依 `total_exec_time`（次數 × 平均）排序：每次 0.3 毫秒、一天一百萬次的查詢，比每次 2 秒、一天兩次的更值得修。`pg_stat_statements_reset()` 之前先存下基準。

規劃器用 `pg_stats` 估列數：等號條件查最常見值（MCV），例如這課資料的 `status = 'pending'`：0.01 × 30000 = 300 列；範圍條件查直方圖。多個條件預設互不相關、選擇率直接相乘。
| `city = '台北市' AND district = '台北市第1區'` | 估計列數 |
|---|---|
| 獨立性假設：20000 × 1/4 × 1/20 | no 250，實際 1000 |
| `CREATE STATISTICS … (dependencies) ON city, district` 後 `ANALYZE` | ok 接近 1000 |

建複合索引或提高單欄統計目標都改不了這個估計。

## H 計畫選錯或結果錯的常見原因 {span=3}
| 症狀 | 原因 | 修法 |
|---|---|---|
| psql 手動跑很快，App 前幾次快、之後某些參數變慢 | 預備陳述式前五次 custom plan，之後可能改用 generic plan；`EXPLAIN EXECUTE` 出現 `$1` | 局部 `SET LOCAL plan_cache_mode = force_custom_plan`，不要全域改 |
| `Sort Method: external merge  Disk` | `work_mem` 不夠（預設 4MB），每個排序或雜湊步驟、每條連線各自使用 | 只在報表交易 `SET LOCAL work_mem`，比 `Memory` 數字大一點；不要全域調成 1GB |
| `NOT IN (子查詢)` 一筆都不回、不報錯 | 子查詢有 NULL | `NOT EXISTS`，計畫是 Anti Join |
| 每組前 N 筆（每位顧客最近 3 筆） | `row_number() OVER (PARTITION BY …)` 要先把每一組所有的列排好 | `LATERAL` 配「分組欄位＋排序欄位」索引，讀到 N 筆就停 |
| CTE 的條件推不進去 | `AS MATERIALIZED` | PostgreSQL 12 起預設內嵌；沒有理由不要寫 |
| 跨欄位 `OR` 變成整表掃描 | 其中一邊沒有索引 | 兩邊都有索引才有 BitmapOr；或拆成 UNION |

```callout ok 讓慢查詢當下留下證據
`log_min_duration_statement = '500ms'` 把慢的 SQL 寫進 log，`auto_explain` 連計畫一起寫；`auto_explain.log_analyze = on` 每句都要多花時間量測，門檻不要設太低。log 裡可能有 email、電話等參數值，保存要符合個資規定。PostgreSQL 18 起 EXPLAIN ANALYZE 預設包含 BUFFERS，比較讀取頁數比比較時間穩定。
```
