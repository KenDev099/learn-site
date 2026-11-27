---
title: PostgreSQL 階段 6：效能
subtitle: 第 20～21 課一頁圖解：索引、B-tree、複合索引、EXPLAIN、掃描與 JOIN 方式、統計資訊
cols: 3
theme: shadcn
課程: PostgreSQL 第 20～21 課
對照課文: 2026-11-14
---
沒有索引，資料庫只能全表掃描；索引是另外存的一份排好序的目錄。要知道索引有沒有用上，就用 EXPLAIN 問規劃器打算怎麼做。[回 PostgreSQL 學習地圖](../index.html)

## A 有沒有索引，差在哪裡 {span=2}
```flow LR
[WHERE customer_id = 42] -> {有可用的索引?}
{有可用的索引?} -> [Seq Scan：10 萬筆一筆一筆看]: 沒有
{有可用的索引?} -> [B-tree：根 → 中間 → 葉]: 有
[B-tree：根 → 中間 → 葉] -> *[直接拿那幾列]: 10 萬筆約 3 層
```
這課 10 萬筆訂單的示範：沒有索引時，計畫寫著 `Rows Removed by Filter: 99980`：為了找 20 筆，看了 10 萬筆。建 `CREATE INDEX ON orders (customer_id)` 之後變成 `Bitmap Index Scan on orders_customer_id_idx`，Execution Time 通常從幾毫秒降到零點零幾毫秒。索引另外存，表本身不重排，可以建很多個，也可以 `DROP INDEX` 刪掉，資料不受影響。

## B B-tree 用得上與用不上
| 條件 | B-tree | 為什麼 |
|---|---|---|
| `=`、`<`、`BETWEEN` | ok | 值已經排好序 |
| `ORDER BY` | ok | 照索引的順序讀 |
| `LIKE '王%'` | ok | 等於從「王」開始的一段範圍 |
| `lower(name) = …`、`total * 2 > 500` | no | 索引排的是欄位原本的值 |
| `LIKE '%明'` | no | 排序幫不上 |
| `status = 'paid'`（六成的列） | warn 會選 Seq Scan | 反正要讀大半張表，全表掃描比較快 |

```callout ok 讓欄位保持「裸的」
`ordered_at::date = '2026-03-01'` 改成 `ordered_at >= '2026-03-01' AND ordered_at < '2026-03-02'`；一定要用函式時，建表達式索引 `CREATE INDEX ON customers (lower(name))`。
```
這頁用 C 排序規則；正式伺服器用 en_US.UTF-8 這類排序規則時，`LIKE '王%'` 要建 `(name text_pattern_ops)`。

## C 複合索引的欄位順序
`(status, ordered_at)` 像電話簿：先按第一欄排，第一欄相同再按第二欄排。
| 條件 | 用得上嗎 |
|---|---|
| `status` | ok |
| `status` 加 `ordered_at` | ok |
| 只有 `ordered_at` | warn 幫助很小 |

最左前綴原則：`=` 比對的欄位放前面，範圍條件的欄位放後面。「我的訂單」`WHERE customer_id = 42 ORDER BY ordered_at DESC LIMIT 20`，一個 `(customer_id, ordered_at)` 同時幫上篩選、排序和分頁。
```callout info PostgreSQL 18 的 skip scan
第一欄只有少數幾種值時，資料庫可以每種值各跳進去找一次，只查 `ordered_at` 也可能用上索引。但這比專門的索引慢，設計時仍照最左前綴想。
```

## D 誰會自動建索引，代價是什麼
| 欄位 | 自動建索引 |
|---|---|
| 主鍵 | ok `customers_pkey`、`orders_pkey` |
| UNIQUE 約束、`CREATE UNIQUE INDEX` | ok 同時擋掉重複的值 |
| 外鍵 | no 自己建；JOIN、刪除父表資料都會用到 |

外鍵欄位如果已經是某個複合索引的第一欄（像 `order_items` 主鍵的 `order_id`），就不用再建；只查 `product_id` 時主鍵索引幫不上。
```callout warn 索引不是免費的
每次 INSERT、UPDATE、DELETE 都要改每一個相關的索引：8 個索引，新增一列就要寫 9 個地方。索引的大小常常跟表差不多。為實際會跑、而且慢的查詢建，不要先猜；8 列的 `products` 不需要額外的索引。
```

## E 計畫是一棵樹，由內往外讀 {span=2}
```flow LR
[① Seq Scan on orders] -> [④ Hash Join]
[② Seq Scan on customers] -> [③ Hash]
[③ Hash] -> [④ Hash Join]
[④ Hash Join] -> *[⑤ Sort]: 第一行最後完成
```
```kv cols=1
cost=0.00..1986.00: 估計成本，前面是吐出第一列之前、後面是全部做完；相對單位，不是毫秒
rows=20: 估計這一步輸出幾列
width=26: 每列平均幾個 bytes，通常不用管
Filter: 每讀一列就檢查，不符合就丟掉
```
縮排越深越早執行；每一層的 cost 都包含底下所有子節點，所以最上面那一行就是整句查詢的估計成本。

## F 四種掃描方式
| 名稱 | 做法 | 什麼時候出現 |
|---|---|---|
| Seq Scan | 從頭到尾讀整張表 | 沒有可用的索引，或要讀大部分的列 |
| Index Scan | 在索引找到位置，一列一列回表拿 | 只要少數幾列，例如用主鍵查一筆 |
| Index Only Scan | 盡量只讀索引；沒被 VACUUM 標記為全部可見的頁才回表（Heap Fetches） | 需要的欄位全在索引裡 |
| Bitmap Heap Scan | 配合 Bitmap Index Scan，先把位置記成地圖，再照表的存放順序讀回 | 不只幾筆、又不到大部分 |

看到 Seq Scan 不一定有問題：小表、或要讀大部分資料時它最快。要找的是「大表、只要少數幾列、卻在 Seq Scan」。

## G JOIN 的三種做法
| 名稱 | 白話 | 適合 |
|---|---|---|
| Nested Loop | 拿一張訂單去找會員卡，兩層迴圈 | 外層只有少數幾列，內層有索引 |
| Hash Join | 先把一邊放進 hash 表，另一邊逐列去對 | 兩邊都很多列、沒有事先排好序，最常見 |
| Merge Join | 兩邊都按編號排好，像拉拉鍊同時往下對 | 兩邊都已經排好序，或查詢本來就要排序 |

你不需要指定 JOIN 做法；規劃器依成本決定，資料量或設定不同就可能換。你要看得懂它選了什麼。

## H 查詢變慢時的檢查步驟 {span=2}
```flow TB
(EXPLAIN ANALYZE 那句慢查詢) -> [找 actual time 乘上 loops 最大的那層]
[找 actual time 乘上 loops 最大的那層] -> [大表 Seq Scan、Rows Removed by Filter 很大]: 缺索引
[找 actual time 乘上 loops 最大的那層] -> [估計 rows 跟實際差 10 倍以上]: 統計資訊過時
[大表 Seq Scan、Rows Removed by Filter 很大] -> [建索引]
[估計 rows 跟實際差 10 倍以上] -> [ANALYZE 表名]
[建索引] -> *[再跑一次，確認計畫真的換了]
[ANALYZE 表名] -> *[再跑一次，確認計畫真的換了]
```
| 指令 | 做什麼 | 注意 |
|---|---|---|
| `EXPLAIN` | 只規劃、不執行 | ok 很慢的查詢也能馬上看計畫 |
| `EXPLAIN ANALYZE` | 真的執行，附上 actual time、rows、loops、Buffers | warn 對 UPDATE、DELETE 會真的改資料，包在 BEGIN … ROLLBACK 裡 |
| `ANALYZE 表名` | 重新抽樣計算統計資訊 | ok 大量匯入後手動跑一次；autovacuum 平常會自動做 |

本機只有幾十筆資料時規劃器幾乎都選 Seq Scan，要在資料量接近正式環境的 staging 看計畫。修慢查詢的 PR 附上改之前和改之後的 EXPLAIN ANALYZE。
