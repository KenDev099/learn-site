---
title: PostgreSQL 階段 10：資深必備｜上線與維運
subtitle: 第 34～37 課一頁圖解：零停機 migration、分割表、連線與監控、備份與複寫
cols: 3
theme: shadcn
課程: PostgreSQL 第 34～37 課
對照課文: 2026-11-14
---
上線之後，每個 DDL 都要先算鎖、每條連線都要算預算、每份備份都要演練過。先量、再拆成小步驟，出事時才停得短、掉得少。[回 PostgreSQL 學習地圖](../index.html)

## A 每個 DDL 先問兩件事 {span=2}
拿什麼鎖？要做多少事（只改目錄、掃全表，還是重寫表）？用 `pg_locks` 與 `pg_relation_filenode()` 自己量：filenode 變了就是重寫。

| DDL | 鎖 | 要做的事 | 大表上 |
|---|---|---|---|
| ADD COLUMN（可 NULL、沒有預設值） | ACCESS EXCLUSIVE | 只改目錄 | ok 瞬間 |
| ADD COLUMN … DEFAULT 'pos'、DEFAULT now() | ACCESS EXCLUSIVE | 只改目錄（fast default） | ok 瞬間 |
| ADD COLUMN … DEFAULT gen_random_uuid() | ACCESS EXCLUSIVE | 重寫表 | no 危險 |
| ALTER COLUMN … TYPE bigint | ACCESS EXCLUSIVE | 重寫表和索引 | no 危險 |
| SET NOT NULL、ADD CONSTRAINT … CHECK | ACCESS EXCLUSIVE | 掃全表 | no 危險 |
| ADD FOREIGN KEY | 兩張表都 SHARE ROW EXCLUSIVE | 掃全表 | no 擋寫入 |
| CREATE INDEX | SHARE | 掃全表、排序 | no 擋寫入 |
| RENAME、DROP COLUMN | ACCESS EXCLUSIVE | 只改目錄 | warn 瞬間，但用舊名稱的程式會壞 |
| VALIDATE CONSTRAINT、CREATE INDEX CONCURRENTLY | SHARE UPDATE EXCLUSIVE | 掃全表 | ok 慢，但讀寫照常 |

```callout warn 瞬間完成的 DDL 也要 lock_timeout
它會排在長查詢後面，再擋住後面所有人。每個 DDL 在交易裡 `SET LOCAL lock_timeout`，收到 55P03 就等一下重試；一個交易只放一個 DDL。lock_timeout 管不到掃表、重寫的時間。
```

## B 把危險的變更拆成小步驟
```flow TB
[ADD CONSTRAINT … NOT VALID] -> [分批回填舊資料]: 瞬間；新寫入立刻被檢查
[分批回填舊資料] -> *[VALIDATE CONSTRAINT]: 每批一個交易、依 id 挑列、可續跑
```
- CHECK、外鍵、NOT NULL（18 起）都可以 NOT VALID 再 VALIDATE。NOT ENFORCED 是另一回事：新舊資料都不檢查，也不能 VALIDATE。
- NOT NULL … NOT VALID 期間，舊的 NULL 列被任何 UPDATE 改到也會 23502。順序：先部署「寫入一定會填新欄位」的程式 → NOT VALID → 緊接著回填 → VALIDATE。
- `CREATE INDEX CONCURRENTLY` 不能在交易裡（25001）：讓 migration 工具不包這個檔案的交易。失敗會留下 INVALID 索引，健康檢查查 `pg_index.indisvalid`。唯一約束用 `UNIQUE USING INDEX` 升級。
- 一句 UPDATE 回填整張表：長交易、膨脹、WAL 暴增、replica 落後。

```timeline h
① expand | ADD COLUMN mobile＋同步 trigger | 舊版讀寫 phone
② 回填 | 分批 UPDATE … SET mobile = phone | 舊版讀寫 phone
③ 部署 v2 | 新版讀寫 mobile | 舊版逐台下線
*④ contract | DROP TRIGGER、DROP COLUMN phone | 舊版已全部下線
```

## C 分割表什麼時候值得（選修第 35 課）
```flow TB
*[orders：PARTITION BY RANGE (ordered_at)] -> [orders_2026_10]: 10/1 ≤ t < 11/1
[orders：PARTITION BY RANGE (ordered_at)] -> [orders_2026_11]: 11/1 ≤ t < 12/1
[orders：PARTITION BY RANGE (ordered_at)] -> [orders_default]: 其他都放這裡
```
| 值得做 | 代價 |
|---|---|
| ok 要定期刪舊資料：DROP 整個分區，不產生死版本 | warn 主鍵和唯一約束必須包含分割鍵 |
| ok 查詢幾乎只看某段時間，而且表很大 | warn 不帶分割鍵的查詢要查每個分區 |
| ok 維護可以一個分區一個分區做 | warn 要提前建好未來的分區；分區太多有規劃與鎖的成本 |

RANGE 含下限、不含上限，timestamptz 邊界寫時區（+08）；LIST 依清單；HASH 平均分散。沒有分區收的列得到 23514；DEFAULT 是安全網，要保持幾乎是空的。現有的一般表不能直接改成分割表。

## D 分區修剪、資料保留與 BRIN（選修第 35 課）
| 條件寫法 | 結果 |
|---|---|
| `ordered_at >= '…10-01' AND ordered_at < '…10-08'` | ok 只讀需要的分區 |
| `ordered_at::date = …`、`date_trunc('day', ordered_at)` | no 每個分區都掃 |
| `<= 23:59:59` 或 `<= 下一天` | no 漏掉或多算邊界上的資料 |

| 操作 | 父表的鎖 | 注意 |
|---|---|---|
| DROP TABLE 分區、DETACH PARTITION | ACCESS EXCLUSIVE | 配 lock_timeout 並重試 |
| DETACH … CONCURRENTLY | SHARE UPDATE EXCLUSIVE | 不能在交易裡；有 DEFAULT 分區時不能用 |
| ATTACH PARTITION | SHARE UPDATE EXCLUSIVE（被掛上的表與 DEFAULT 分區是 ACCESS EXCLUSIVE） | 先加和範圍相同的 CHECK，就不用掃新表（DEFAULT 仍要掃）；用 `(LIKE orders)` 建表 |

- 父表索引不擋寫入：`CREATE INDEX … ON ONLY` 父表，每個分區 CONCURRENTLY，再 `ALTER INDEX … ATTACH PARTITION`。
- BRIN 只記每段資料頁的最小～最大值，極小；只適合 `pg_stats.correlation` 接近 1 的依時間 append 資料。
- 大表主鍵：bigint 或 `uuidv7()`（18）寫在索引右邊；隨機 uuid 一直頁分裂、索引變大。

## E 連線預算與 pooler {span=2}
```flow LR
[App 實例 × pool max] -> *pooler: 很多客戶連線
pooler -> [(PostgreSQL)]: 少量伺服器連線
[migration、維運、自己登入] -> [(PostgreSQL)]: 直連，max_connections 留位置
```
每條連線一個程序、各有記憶體；同時在做事的連線超過硬體能處理的量，吞吐量反而下降。起點公式 (CPU 核心數 × 2) + 有效磁碟數，再用壓力測試調。連線數 = 實例數（用擴展上限）× pool max，超過就加 pooler 或縮小 pool，不是調大 max_connections。pooler 最常用 transaction 模式：每個交易結束就換人用伺服器連線。存在連線上的東西因此都不可靠。

| transaction 模式下 | 結果 | 改成 |
|---|---|---|
| `SET` | no 設定留在伺服器連線上，漏給下一個客戶 | `SET LOCAL`、`set_config(…, true)` |
| `LISTEN` | no 下一個交易可能不在那條連線 | 直連或 session 模式 |
| session 級 advisory lock | no 鎖跟著連線留下 | `pg_try_advisory_xact_lock` |
| WITH HOLD cursor、SQL 的 PREPARE | no 存在連線上 | 分頁查詢；驅動程式協定層的預備陳述式 |

## F 角色、護欄與健康檢查
| 角色 | 誰用 | 權限 |
|---|---|---|
| migrator | 部署時跑 migration | 擁有所有表 |
| app_user | API、worker | 只讀寫資料；不是擁有者，RLS 對它有效 |
| report_reader | 報表、資料分析 | 只能 SELECT |

- `GRANT … ON ALL TABLES` 只管現有的表；之後的表用 `ALTER DEFAULT PRIVILEGES FOR ROLE migrator`。
- 護欄設在角色上：`ALTER ROLE app_user SET statement_timeout = '5s'`，登入時套用，SET ROLE 不載入；越具體的層級越優先，交易裡 `SET LOCAL` 放寬。沒寫單位當毫秒。
- 連線用 `sslmode=verify-full`、SCRAM-SHA-256，加 `application_name`。
- 記憶體：shared_buffers 約 RAM 25%；work_mem 要乘上連線數與步驟數估。先量測，一次改一個。

| 指標 | 怎麼查 |
|---|---|
| 連線使用率 | `pg_stat_activity` 筆數 ÷ max_connections |
| 最長交易、idle in transaction | `now() - xact_start`、`now() - state_change` |
| 命中率、暫存檔、死結 | `pg_stat_database`，兩次取樣相減 |
| 沒用的索引 | `idx_scan = 0`，但主鍵、唯一索引不能刪 |
| wraparound 年齡 | `age(datfrozenxid)` |

只看 CPU 不夠：長交易、等鎖、連線滿了，CPU 都可能很閒。

## G 備份：先定 RPO 與 RTO {span=2}
| 方案 | RPO（掉多少） | RTO（停多久） | 救得了誤刪 |
|---|---|---|---|
| 每天 02:00 pg_dump | 最多 24 小時 | 資料大時好幾小時（要重建索引） | warn 可以，但只能回到 02:00 |
| 實體備份＋WAL 封存（PITR） | 幾分鐘以內 | 還原備份＋重播 WAL | ok 回到誤刪前一刻 |
| 非同步串流複寫＋自動故障轉移 | 可能掉最後幾筆 | 幾十秒 | no |
| 同步複寫＋自動故障轉移 | 不掉已提交的資料 | 幾十秒 | no |

```timeline h
02:00 | 基礎備份
WAL 1 … WAL n | 連續封存 | 斷掉一個就只能還原到那裡
*18:10 | 誤刪 | recovery_target_xid，inclusive = off
之後 | 正常寫入 | 所以還原到另一台，再補回缺的列
```
- WAL 先記帳再改資料：COMMIT 時 WAL 進磁碟就算數，當機後從 checkpoint 重播。fsync 在正式環境絕對不能關。
- pg_dump：一致快照、可跨大版本、可只還原部分表，但還原慢；pg_basebackup：還原快、只能同大版本，17 起有增量備份。
- 補回原本的 id 用 `INSERT … OVERRIDING SYSTEM VALUE SELECT …`。
- archive_command 只能在真的成功時回傳 0；監控 `pg_stat_archiver`。備份放在別的區域，定期還原演練。

## H 複寫、replication slot 與故障轉移
```flow LR
primary -> [sent_lsn] -> [write_lsn] -> [flush_lsn] -> *[replay_lsn：查得到了]
```
- 串流複寫預設非同步；同步複寫由 `synchronous_commit` 決定 COMMIT 等到哪一步（remote_apply 最強、延遲最大）。唯一的同步 replica 掛掉，寫入全部卡住。
- 落後量用 `pg_wal_lsn_diff` 算到 replay_lsn。寫完要立刻讀的查詢走 primary。
- replication slot 替 replica 保留 WAL；沒人用的 slot 會塞滿磁碟。設 `max_slot_wal_keep_size` 或 18 的 `idle_replication_slot_timeout`。
- 自動故障轉移靠 Patroni 或雲端 Multi-AZ，要防 split-brain；App 要能重連、整個交易重試。
- 邏輯複寫只複寫指定的表、可跨版本，但不複寫 DDL 與序號。

```callout err replica 救不了誤刪
DELETE 也是 WAL 裡的變更，幾毫秒後 replica 上的資料也沒了。複寫防機器壞掉，備份防資料被改壞，兩者都要。
```
