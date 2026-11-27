---
title: PostgreSQL 階段 9：資深必備｜並發與正確性
subtitle: 第 30～33 課一頁圖解：MVCC 與 VACUUM、隔離等級與 UPSERT、鎖、工作佇列
cols: 3
theme: shadcn
課程: PostgreSQL 第 30～33 課
對照課文: 2026-11-14
---
每次修改都留下舊版本，每個指令都拿鎖。知道版本何時能清、快照何時拍、誰在等誰，才能讓規則在並發下仍然成立。[回 PostgreSQL 學習地圖](../index.html)

## A UPDATE 不會原地改
```flow LR
[UPDATE 拿鐵改成 115] -> [舊版本 (0,2)]: xmax 填上自己的交易編號
[UPDATE 拿鐵改成 115] -> *[新版本 (0,7)]: xmin 是自己的交易編號
```
```kv cols=1
ctid: 這個版本的位置（第幾頁, 第幾格）
xmin: 建立這個版本的交易編號
xmax: 刪除或鎖住這個版本的交易編號；0 代表沒有
```
- DELETE 只填 xmax；ROLLBACK 不改回頁面，只讓寫出的版本永遠無效。
- 快照記下哪些交易已完成：xmin 已提交、xmax 未提交（或沒有）的版本才看得到。所以 `count(*)` 要逐列檢查，只要估計值就看 `pg_class.reltuples`。

```callout ok HOT 更新不碰索引
被改的欄位不在任何索引裡，而且同一頁還有空間放新版本。更新密集的表把 fillfactor 降到 70～90；常被更新的欄位不要隨手建索引。
```

## B 死版本為什麼清不掉 {span=2}
```flow LR
*[最舊的進行中交易或快照] -> [清理界線 xmin horizon]: 決定
[清理界線 xmin horizon] -> [之後才被刪掉的版本]: 一律不能清
[之後才被刪掉的版本] -> [VERBOSE：dead but not yet removable]
```
| 元兇 | 怎麼查 | 處理與預防 |
|---|---|---|
| 跑很久的查詢 | `pg_stat_activity`，state = 'active'、xact_start 很早 | 報表放唯讀副本；`statement_timeout` |
| idle in transaction | state = 'idle in transaction' | 修程式，交易裡不等外部 API；`idle_in_transaction_session_timeout`、`transaction_timeout`（17 起） |
| 遺忘的 prepared transaction | `pg_prepared_xacts` | COMMIT／ROLLBACK PREPARED；`max_prepared_transactions` 維持預設 0 |
| 沒人用的 replication slot | `pg_replication_slots` | 確認接收端不在了再刪除 |

只要有一個，整個資料庫所有表的死版本都清不掉。正式環境依 `age(backend_xmin)` 由大到小排，排第一的通常就是元兇。

| | VACUUM | VACUUM FULL |
|---|---|---|
| 做什麼 | 死版本的空間標成可重用，更新可見性地圖 | 把整張表重寫成新檔案 |
| 檔案大小 | 幾乎不變，只截掉表尾的空頁 | 縮到剛好 |
| 鎖 | ok SHARE UPDATE EXCLUSIVE，讀寫照常 | no ACCESS EXCLUSIVE，全部擋住 |

autovacuum 的門檻是 50 + 0.2 × reltuples（有上限、可每表覆寫，大表例如 `autovacuum_vacuum_scale_factor = 0.01`）。它也負責凍結，防止交易編號 wraparound，監控 `age(relfrozenxid)`。不要關掉 autovacuum。

## C 隔離等級擋住哪些異常
| 等級 | 髒讀 | 不可重複讀 | 幻讀 | 寫入偏差 |
|---|---|---|---|---|
| READ COMMITTED（預設） | ok 不會 | no 可能 | no 可能 | no 可能 |
| REPEATABLE READ | ok 不會 | ok 不會 | ok 不會（標準允許，PostgreSQL 不會） | no 可能 |
| SERIALIZABLE | ok 不會 | ok 不會 | ok 不會 | ok 不會 |

- READ COMMITTED 每一句拍新快照；REPEATABLE READ、SERIALIZABLE 在交易裡第一句非交易控制的 SQL 拍一張，不是 BEGIN 那一刻。
- READ COMMITTED 的 UPDATE 遇到別人正在改的列，等對方提交後用最新版本重新檢查 WHERE。所以同一列的條件式原子更新安全；條件讀的是別人的列時就不夠。

## D 寫入偏差與 40001 重試 {span=2}
```sequence
阿明 -> DB: 數 A 店值班 = 2，把自己改成下班
小美 -> DB: 數 A 店值班 = 2，把自己改成下班
note 阿明, 小美: REPEATABLE READ：兩人改不同的列，都成功，A 店沒人值班
== 改用 SERIALIZABLE ==
阿明 -> DB: 同樣的步驟，SSI 記下 SIReadLock（不擋人）
小美 -> DB: 同樣的步驟
DB --> 小美: 40001 序列化失敗
小美 -> DB: ROLLBACK，從 BEGIN 重試：新快照只剩 1 人，不下班
```
SIReadLock 只是紀錄、不擋人；在 `pg_locks` 怎麼看是選讀。

```callout warn 重試整個交易
收到 40001 或 40P01 就 ROLLBACK，從 BEGIN 重做並重新讀取；中止的交易裡每一句都是 25P02。重試要有上限、有退避。會被重試的交易裡不寄信、不扣款。只讀的長報表用 `SERIALIZABLE READ ONLY DEFERRABLE`。
```

## E 有就更新、沒有就新增
| 寫法 | 兩個請求同時新增同一個 key |
|---|---|
| 先 SELECT 查有沒有，再 INSERT | no 23505 或重複兩張卡 |
| `INSERT … ON CONFLICT (customer_id) DO UPDATE` | ok 等對方結束：提交就改做 UPDATE，回滾就新增 |
| `MERGE` | warn 直接得到唯一約束錯誤；適合單一程序的批次同步 |

- `EXCLUDED` 是這次想新增、但撞到的那一列。`DO NOTHING` 跳過的列不在 RETURNING 裡：0 列代表已存在。
- 欄位沒有唯一約束得到 42P10；DO UPDATE 同一句裡 key 重複得到 21000。
- 18 起 `RETURNING old.*, new.*` 分辨新增或更新。IDENTITY 會跳號，不要期待連號。

| 情境 | 做法 |
|---|---|
| 計數器、扣庫存、加點數 | `UPDATE … SET x = x - n WHERE x >= n` |
| 讀出來在程式裡判斷再寫同一列 | `SELECT … FOR UPDATE` |
| 唯一、存在性 | 唯一約束＋`ON CONFLICT` |
| 跨多列的規則 | 鎖住共同的父列，或 SERIALIZABLE＋重試 |
| 同一時間只能一個人做 | advisory lock |

## F 每個指令拿什麼鎖
| 指令 | 表級鎖 |
|---|---|
| `SELECT` | ACCESS SHARE |
| `SELECT … FOR UPDATE`／`FOR SHARE` | ROW SHARE |
| `INSERT`、`UPDATE`、`DELETE` | ROW EXCLUSIVE |
| VACUUM、ANALYZE、`CREATE INDEX CONCURRENTLY`、VALIDATE CONSTRAINT | SHARE UPDATE EXCLUSIVE |
| `CREATE INDEX` | SHARE |
| CREATE TRIGGER、ADD FOREIGN KEY | SHARE ROW EXCLUSIVE |
| `REFRESH MATERIALIZED VIEW CONCURRENTLY` | EXCLUSIVE |
| 大多數 ALTER TABLE、DROP、TRUNCATE、VACUUM FULL、一般 REFRESH | ACCESS EXCLUSIVE |

```callout info 衝突表的三句話
讀只怕 ACCESS EXCLUSIVE。寫入怕 SHARE 以上，所以一般 CREATE INDEX 擋寫不擋讀。SHARE 和自己不衝突，SHARE UPDATE EXCLUSIVE 和自己衝突。
```
列鎖由強到弱：FOR UPDATE、FOR NO KEY UPDATE（沒改鍵的 UPDATE）、FOR SHARE、FOR KEY SHARE（外鍵檢查）。改顧客名字不會擋住幫他下單；只改非鍵欄位就寫 `FOR NO KEY UPDATE`。在交易裡查 `pg_locks WHERE pid = pg_backend_pid()` 自己量。

## G 誰在等誰 {span=2}
```timeline h
14:00:00 | 月報表 SELECT orders | 持有 ACCESS SHARE，要跑 2 分鐘
*14:00:10 | ALTER TABLE orders ADD COLUMN | 排隊等 ACCESS EXCLUSIVE
14:00:11 起 | App 的 SELECT | 和報表不衝突，卻排在 ALTER 後面
14:02:00 | 報表結束 | ALTER 幾毫秒完成，後面一口氣放行
```
| 設定（預設 0） | 管什麼 | 超過時 |
|---|---|---|
| `lock_timeout` | 單次等鎖 | 那一句失敗 55P03 |
| `statement_timeout` | 單一句的總時間（含等鎖） | 那一句失敗 57014 |
| `idle_in_transaction_session_timeout` | 交易開著卻沒在執行 | 斷開連線 |
| `transaction_timeout`（17 起） | 整個交易 | 斷開連線 |

DDL 前 `SET LOCAL lock_timeout`，失敗稍後重試。死結由 PostgreSQL 偵測，一方得到 40P01：多列依主鍵排序再鎖、交易要短、重試整個交易；調大 `deadlock_timeout` 只會更晚發現。

| 根源（擋住別人、自己沒被擋） | 處理 |
|---|---|
| active 的長查詢 | `pg_cancel_backend(pid)`：那一句失敗 |
| idle in transaction | warn `pg_terminate_backend(pid)`：交易回滾、鎖放開；cancel 沒用 |
| prepared transaction（pid 是 NULL） | 從 `pg_prepared_xacts` 找 gid，ROLLBACK PREPARED |

用 `pg_stat_activity` 加 `pg_blocking_pids(pid)` 從受害者往上追。最老的交易不一定是根源。先存證、確認它是誰，再動手。

## H 用 PostgreSQL 做工作佇列 {span=3}
```flow LR
[下單 API] -> [(同一個交易：orders＋outbox)]
[(同一個交易：orders＋outbox)] -> *relay: SKIP LOCKED 取出未送的
relay -> [訊息系統]: 送出
relay -> [標記 published_at]: 送出之後
```
```sql
UPDATE jobs SET status = 'running', …
WHERE id IN (
  SELECT id FROM jobs WHERE …取件條件… ORDER BY … LIMIT n
  FOR UPDATE SKIP LOCKED)
RETURNING id, kind, payload;
```
| 問題 | 做法 |
|---|---|
| 多個 worker 搶同一件 | `FOR UPDATE SKIP LOCKED`：跳過被鎖的列，不重複、不互等；只用在佇列，不用在報表 |
| 取件交易太長 | 只標記 running 和寫租約就提交，工作在交易外做 |
| worker 當掉 | 租約 `locked_until`，回收過期仍是 running 的工作 |
| 一直失敗 | 退避（例如 2 的 attempts 次方秒），超過 max_attempts 改成 dead，並設告警 |
| 排程只能跑一份 | `pg_try_advisory_xact_lock(hashtextextended('daily-report', 0))`，拿不到就跳過 |
| worker 多久查一次 | LISTEN／NOTIFY 只在提交時送、沒人聽就消失，只當提示，仍要定期輪詢 |
| 寫資料庫和送訊息只成功一半 | outbox：事件和訂單寫在同一個交易，由 relay 送出 |

```callout warn 佇列只保證 at-least-once
處理要冪等；outbox 的消費端依事件 id 去重。經過 transaction 模式的連線池時，用交易級 advisory lock，LISTEN 用直連的專用連線。jobs 用部分索引 `WHERE status = 'queued'` 支撐取件。
```
