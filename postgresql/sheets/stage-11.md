---
title: PostgreSQL 階段 11：資深必備｜資料建模與期末專題
subtitle: 第 38～39 課一頁圖解：軟刪除、稽核、時間區間、多租戶、上線前審查與事故演練
cols: 3
theme: shadcn
課程: PostgreSQL 第 38～39 課
對照課文: 2026-11-14
---
規則交給資料庫的約束、trigger、RLS 來守，不靠程式記得檢查。出事時照同一個順序處理：量測、找根本原因、只改一處、再量測、補上告警或測試。[回 PostgreSQL 學習地圖](../index.html)

## A 軟刪除：不真的刪除
- 只在 `deleted_at` 記下刪除時間：可以復原、保留關聯。每個查詢都要排除已刪除的，用 view 或 RLS 集中過濾。
- 外鍵只檢查那一列存在：新訂單照樣掛得上已刪除的會員，`ON DELETE CASCADE` 也不會觸發。
- 個資要求刪除時，標記不算刪除：去識別化，或改用封存表（`DELETE … RETURNING` 配 CTE 搬走）。

| 未刪除會員的手機不能重複 | 結果 |
|---|---|
| `UNIQUE (phone)` | no 刪除帳號的人的手機永遠不能再註冊 |
| `UNIQUE (phone, deleted_at)` | no NULL 彼此不相等，擋不住重複 |
| 部分唯一索引 `… WHERE deleted_at IS NULL` | ok 只在未刪除的列之間要求不重複 |

## B 稽核：任何來源的修改都記到 {span=2}
```flow LR
[app_user UPDATE products] -> *[trigger 函式 SECURITY DEFINER]: 以擁有者的權限執行
[trigger 函式 SECURITY DEFINER] -> [(audit_log)]: TG_OP、to_jsonb(OLD/NEW)
[app_user UPDATE products] --> [(audit_log)]: 沒有任何權限，寫不進也改不了
```
- 寫在 trigger 裡，直接下 SQL 或別的服務改資料也有紀錄。`TG_OP`、`TG_TABLE_NAME`、`to_jsonb(OLD)`、`to_jsonb(NEW)`，表加欄位也不必改稽核表。
- 誰改的：後端在每個交易開頭 `set_config('app.user_id', …, true)`，函式讀 `current_setting('app.user_id', true)`；背景工作也給固定名稱。

```callout err SECURITY DEFINER 一定要固定 search_path
沒列出來的 pg_temp 排在最前面，呼叫者建一張同名暫存表就能把紀錄導走。寫 `SET search_path = public, pg_temp`，pg_temp 明確放最後；只寫 `public` 不夠。
```

## C 時間區間：範圍型別與排除約束
```sql
ALTER TABLE 表 ADD CONSTRAINT 約束名
  EXCLUDE USING gist (欄位1 WITH =, 欄位2 WITH &&)
  WHERE (條件);
```
- 時段一律用半開區間 `[開始, 結束)`：前一組的結束等於下一組的開始，剛好接上；`[]` 會把相鄰當成重疊。
- 同一張桌子（`=`）而且時段重疊（`&&`）的兩列不准共存，違反得到 23P01。需要 btree_gist；WHERE 讓已取消的訂位不擋人。
- UNIQUE 只擋完全相同的值，先查再寫在並發時會一起通過。
- PostgreSQL 18：`PRIMARY KEY (product_id, valid_at WITHOUT OVERLAPS)`，以及 PERIOD 外鍵（只支援 NO ACTION）。
- 發票號碼要連續：計數表在同一個交易裡 `UPDATE … SET last_no = last_no + 1 … RETURNING`，代價是同一家店的開票不能並行。

## D 多租戶：租戶 id 放進哪裡 {span=2}
| 做法 | 隔離 | 適合 |
|---|---|---|
| 共用表，每列帶 store_id | 靠 WHERE 與 RLS | 大多數 SaaS、租戶很多 |
| 每個租戶一個 schema | 靠 search_path | 租戶不多、要客製表結構 |
| 每個租戶一個資料庫 | 最強 | 少數大客戶、合約要求實體隔離 |

| 共用表的檢查 | 寫法 |
|---|---|
| 主鍵與外鍵 | ok 複合外鍵，例如 `FOREIGN KEY (store_id, order_id) REFERENCES orders (store_id, id)`；被參照的一邊要有涵蓋這些欄位的主鍵或唯一約束 |
| RLS | ok `USING` 與 `WITH CHECK` 比對 `current_setting('app.store_id')::int` |
| 設定租戶 | ok 每個交易開頭 `set_config(…, true)`；session 層級經過連線池會漏給下一個請求 |
| 連線的角色 | no 擁有者、超級使用者、BYPASSRLS 都繞過 RLS；用 app_user |
| 建在 RLS 表上的 view | no 預設用擁有者的身分查表；加 `WITH (security_invoker = true)` |
| 索引 | ok 以 store_id 開頭，例如 `(store_id, ordered_at)` |

## E 用 SQL 測試租戶隔離
```flow TB
[測試函式：SET LOCAL ROLE app_user] -> [設定台北店、台中店]
[設定台北店、台中店] -> [ASSERT 看得到自己、看不到別家]
[ASSERT 看得到自己、看不到別家] -> *[mutation_check：故意改壞 policy]
```
| policy 的 USING | 好的測試 |
|---|---|
| 正確的 | ok 通過 |
| `true`（全部外洩） | no 失敗 |
| `store_id = 1`（寫死台北店） | no 失敗 |
| `store_id = 2`（寫死台中店） | no 失敗 |
| `false`（誰都看不到） | no 失敗 |

只用一家店測，抓不到寫死那家；只測「看不到別人」，抓不到 `false`。用超級使用者測，永遠看到全部。

## F 處理事故的順序 {span=2}
```flow LR
(症狀) -> [量測：記下基準] -> [根本原因] -> [只改一處] -> [再量測：跟基準比] -> *[告警、測試]
```
| 回報 | 根本原因 | 修法 |
|---|---|---|
| 週五晚上點餐頁變慢 | 待製作訂單 Seq Scan 加 Sort（範例每次讀約 250 頁） | `pg_stat_statements` 找總量最大的查詢；部分索引，CONCURRENTLY 建；比讀取頁數 |
| 磁碟一直長 | prepared transaction 擋住清理界線 | `pg_prepared_xacts` 確認內容，再 ROLLBACK 或 COMMIT PREPARED |
| 集點被重複兌換 | 先讀、在程式裡判斷、再寫回 | 兌換要 10 點：一句 `UPDATE … SET stamps = stamps - 10 WHERE … AND stamps >= 10`，看影響列數；開卡用 UPSERT |
| 咖啡師平板卡住 | FOR UPDATE 讓 B 等 A | `FOR UPDATE SKIP LOCKED`，帶 store_id 與 ORDER BY |
| 營業時間加取餐碼 | 直接 NOT NULL 失敗，DEFAULT 會重寫或共用 | 見 G 的六個步驟 |

```callout warn 事故中不要做的事
直接 VACUUM FULL：排隊等鎖並擋住所有人，擋住清理的交易還在就照樣清不掉。還沒查清楚就 `pg_terminate_backend()`：可能回滾重要的交易，對 prepared transaction 也沒用。不看內容就 COMMIT PREPARED。
```

## G 營業時間加取餐碼
```timeline v
1 | `ADD COLUMN pickup_code text` | 只改目錄；配 lock_timeout 與重試
*2 | 部署新版程式 | 新訂單一律寫入取餐碼，一定在下一步之前
3 | `ADD CONSTRAINT … NOT NULL pickup_code NOT VALID` | 18 的寫法，不掃舊資料
4 | 分批回填 | 每批一個短交易
5 | `VALIDATE CONSTRAINT` | SHARE UPDATE EXCLUSIVE，讀寫照常
6 | `CREATE UNIQUE INDEX CONCURRENTLY` | 不擋寫入；檢查有沒有 INVALID 索引
```
資料保留：到期的分區 DROP，不要 DELETE；下個月的分區提前建好。RPO、RTO 寫下來，用實際還原演練並計時證明。

## H 上線審查清單與事後檢討 {span=3}
| 面向 | 檢查什麼 | 哪一課 |
|---|---|---|
| 效能 | 主要查詢有適合的索引，沒有用不到的索引；統計資訊是新的 | 21、27、29 |
| 正確性 | 沒有「先讀再寫」的競態；規則寫在資料庫的約束裡 | 12、19、31、38 |
| 並發 | 佇列用 SKIP LOCKED；交易裡不呼叫外部 API；設了 lock_timeout | 32、33 |
| 多租戶 | 每一句都帶租戶條件，RLS 有測試並故意改壞過 | 24、38 |
| migration | 每個 DDL 都知道拿什麼鎖、會不會重寫 | 34 |
| 維運 | 連線經過連線池、權限最小化；告警涵蓋最老交易、prepared transaction、死版本、INVALID 索引、複寫延遲、磁碟 | 30、36 |
| 資料生命週期 | 大表有保留期限，未來的分區提前建好 | 35 |
| 還原能力 | RPO／RTO 有寫下來，還原演練有計時紀錄 | 37 |

```kv cols=2
時間軸: 從處理時隨手記下的指令與時間整理
影響: 哪些店、多久、哪些功能
根本原因: 系統為什麼讓錯誤變成事故、又為什麼沒更早發現
改善事項: 告警、設計、流程，每項有負責人與期限
```
```callout ok 不怪罪個人
根本原因寫系統缺了什麼，不寫「某某忘了處理」。每次檢討的改善事項，常常就是清單上新的一列。
```
