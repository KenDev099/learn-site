---
title: PostgreSQL 階段 7：實務
subtitle: 第 22～26 課一頁圖解：migration、View／Function／Trigger、權限與 RLS、後端連線、期末專題
cols: 3
theme: shadcn
課程: PostgreSQL 第 22～26 課
對照課文: 2026-11-14
---
上線之後，schema 變更要寫成 migration、規則要決定放資料庫還是後端、權限要收到最小、後端要用參數化查詢和連線池。期末專題把這些照實務順序走一遍。[回 PostgreSQL 學習地圖](../index.html)

## A ALTER TABLE 改上線中的表
| 操作 | 寫法 | 注意 |
|---|---|---|
| 新增欄位 | `ADD COLUMN … NOT NULL DEFAULT …` | ok 既有列自動填 DEFAULT；PostgreSQL 11 起固定的 DEFAULT 不改寫整張表 |
| 改名 | `RENAME COLUMN` | warn 資料庫一瞬間完成，用舊名的程式立刻壞掉 |
| 改型別 | `ALTER COLUMN price TYPE integer USING price::integer` | warn 沒寫 USING 會出現 cannot be cast automatically；一列轉不過就整個不改 |
| 加約束 | `ADD CONSTRAINT`、`SET NOT NULL` | warn 先用 SELECT 找出不合格的既有列並修好 |
| 刪欄位 | `DROP COLUMN` | no 資料一起消失、無法復原 |

補 NULL 要填什麼值是產品決定，先跟 PM 確認，前端表單和 API 驗證也要一起改。

## B Migration 讓每個環境一致 {span=2}
```flow LR
[git 裡的 migration 檔 001～004] -> [你的電腦：schema_migrations 001～004]: 已是最新
[git 裡的 migration 檔 001～004] -> *[正式環境：schema_migrations 001、002]: 部署時補跑 003、004
```
- 有編號、照順序執行，檔案進 git，跟程式碼一起 review。
- 只往後加：已經部署的 migration 不能改，寫錯了就新增一支往前修。
- 正式環境很少跑 down：`DROP COLUMN` 的 down 變不回資料。

```callout ok PostgreSQL 的 DDL 可以放進交易
一支 migration 的第三句失敗，前兩句也一起撤銷，schema 不會停在改到一半。MySQL 做不到。
```
| 工具 | migration 長什麼樣 |
|---|---|
| Supabase | `supabase/migrations/時間戳_名稱.sql`，純 SQL |
| Prisma | 改 `schema.prisma`，`prisma migrate dev` 產生 SQL；部署用 `prisma migrate deploy` |
| Strapi | warn schema 自動同步，看不到下了什麼 SQL；改名可能是刪舊欄、建新欄 |

## C 正式環境改 schema：注意鎖
```timeline v
① 加新欄位 | `ADD COLUMN mobile` | 舊程式完全不受影響
② 雙寫加搬資料 | 程式兩欄都寫 | UPDATE 把舊資料複製過去
③ 改讀新欄位 | 程式只讀寫 mobile | 觀察一段時間
*④ 刪舊欄位 | `DROP COLUMN phone` | 確定沒人在用了
```
expand / contract：部署期間新舊程式同時存在，每一刻的 schema 都要讓兩版都能跑，每一步都能退回。
```callout warn 大部分 ALTER TABLE 加最強的鎖
執行期間連 SELECT 都排隊。改型別通常改寫整張表；`SET NOT NULL`、CHECK 要掃整張表；建索引用 `CREATE INDEX CONCURRENTLY`。先設 `SET lock_timeout = '3s'`，等不到鎖就放棄、晚點再試。
```
可以公告停機的小系統，停機跑 migration 通常就夠。

## D View、Function、Trigger 各管什麼
| 東西 | 存什麼 | 怎麼用 |
|---|---|---|
| VIEW | 一句 SELECT | 像查表，每次展開執行，結果永遠最新；不會讓查詢變快 |
| MATERIALIZED VIEW | 查詢加結果 | warn 讀得快、可以建索引，但要 `REFRESH` 才更新 |
| FUNCTION | 有參數、有回傳值的邏輯 | `LANGUAGE sql`，或要變數和 IF 時用 `plpgsql`；內容用 `$$ … $$` 包起來 |
| TRIGGER | `RETURNS trigger` 的 function 加 `CREATE TRIGGER` | INSERT、UPDATE、DELETE 之前或之後自動執行，`FOR EACH ROW` 每列一次 |

trigger function 裡 `NEW` 是改完的列（INSERT、UPDATE），`OLD` 是改之前的列（UPDATE、DELETE）。參數名加 `p_` 前綴，避免 `WHERE product_id = product_id` 永遠成立。
```callout err BEFORE trigger 忘了 RETURN NEW
回傳 NULL 等於告訴資料庫這一列不要寫，資料會默默沒寫進去。要改當前這一列，用 BEFORE trigger 直接改 `NEW`；AFTER UPDATE 又去 UPDATE 同一張表會無限遞迴。
```

## E 規則放資料庫，還是放後端 {span=2}
```sequence
後端 -> 資料庫: INSERT order_items（起司蛋糕 5 個）
資料庫 -> 資料庫: AFTER INSERT trigger 扣 products.stock
note 資料庫: 庫存不夠扣，違反 CHECK (stock >= 0)
資料庫 --> 後端: 錯誤；同一個交易，明細也沒寫進去
```
| 面向 | 放在資料庫 | 放在後端程式 |
|---|---|---|
| 可靠性 | ok 不管資料從哪裡寫進來都會執行 | warn 有一條路徑忘了呼叫就被繞過 |
| 可讀性 | warn 看後端程式碼看不出來 | ok 跟其他業務邏輯放在一起 |
| 測試與除錯 | warn 要連資料庫才能測 | ok 單元測試、中斷點 |

保護資料正確性的規則（約束、`updated_at`、稽核記錄）放資料庫；常改的業務流程、寄信付款這類外部呼叫放後端。trigger 寫在 migration 裡、取看得懂的名字，例如 `order_items_decrease_stock`。

## F 兩層權限：GRANT 與 RLS {span=2}
```flow LR
[customer 執行 SELECT * FROM orders] -> {有 GRANT?}
{有 GRANT?} -> [permission denied]: 沒有
{有 GRANT?} -> {開了 RLS?}: 有
{開了 RLS?} -> [看到全部的列]: 沒開
{開了 RLS?} -> *[只看到 policy 允許的列]: 開了
```
- 使用者和群組都是 role；`GRANT staff TO amy` 讓 amy 繼承 staff 的權限。最小權限：被 SQL injection 時，攻擊者能做的就是這個帳號能做的。
- `ENABLE ROW LEVEL SECURITY` 後預設全部拒絕，再用 `CREATE POLICY` 開放。`USING` 管看得到、改得到哪些既有的列；`WITH CHECK` 管寫進去的新資料。
- 連線池共用連線時，用交易內有效的 `set_config('app.user_id', '1', true)`，否則下一個請求可能沿用上一位使用者的身分。

| 身分 | 受 RLS 限制 |
|---|---|
| 超級使用者、有 BYPASSRLS 的 role | no 永遠繞過，沒辦法改 |
| 表的擁有者 | warn 預設繞過，加 `FORCE ROW LEVEL SECURITY` 才受限 |
| 一般 role（`SET ROLE customer`） | ok 依 policy 過濾 |

測試 RLS 一定要切成應用程式實際用的 role，最後 `RESET ROLE`。
```callout info Supabase 讓前端直連的原理
anon key 不是資料庫密碼。API 伺服器依 JWT 用 anon 或 authenticated role 查詢，`auth.uid()` 讀出目前使用者，policy 寫成 `USING (auth.uid() = user_id)`。忘了開 RLS 的表等於對全世界公開；`service_role` key 會繞過 RLS，只能放在後端。
```

## G 後端連資料庫的三個坑 {span=2}
| 問題 | 錯誤寫法 | 正確做法 |
|---|---|---|
| SQL injection | `"… WHERE name = '" + req.query.name + "'"`，模板字串 `${id}` 也一樣 | 參數化查詢：`pool.query('… WHERE name = $1', [name])`；表名、排序方向用白名單 |
| 每次重新連線 | 每個請求 `new Client()` | `new pg.Pool({ max: 10 })` 借用和歸還；交易用 `pool.connect()` 的同一個 client，`finally` 裡 `release()` |
| N+1 查詢 | 迴圈裡每筆訂單查一次顧客 | 一句 JOIN；ORM 用 Prisma 的 `include`、Strapi 的 `populate` |

連線字串 `postgres://帳號:密碼@主機:5432/資料庫` 放在環境變數，不進 git。PostgreSQL 的 `max_connections` 預設 100；serverless 再加上共用的 pooler（Supabase 的 Supavisor、PgBouncer）。一般 CRUD 用 ORM，複雜報表和效能關鍵的查詢直接寫 SQL。

## H 期末專題：從需求到索引 {span=3}
```flow LR
(需求) -> [實體與關係] -> [ER 圖] -> [CREATE TABLE 含約束] -> [資料] -> [業務查詢] -> *[索引]
```
```er LR
members
  id PK
  name text
  phone text UK
  joined_at timestamptz
cafe_tables
  id PK
  label text UK
  capacity integer
reservations
  id PK
  member_id FK -> members
  table_id FK -> cafe_tables
  reserved_at timestamptz
  party_size integer
  status text
point_transactions
  id PK
  member_id FK -> members
  points integer
  reason text
  created_at timestamptz
```
- 點數要知道每一筆怎麼來、怎麼用掉：存成一筆一筆的明細，目前點數用 sum 算。
- 每個查詢對照需求：取消的要不要排除？沒有資料的要不要出現（LEFT JOIN 後用 `count(右表.id)`）？時間用 `>= 開始 AND < 結束` 的半開區間。
- 外鍵不會自動建索引，三個外鍵欄位各建一個。
- 「同一張桌子同一時段不能被預約兩次」主鍵和外鍵都擋不住，要另外處理。

上線前用檢查清單對一遍：主鍵、外鍵、正規化、約束、型別、交易、索引、migration、權限、後端連線。
