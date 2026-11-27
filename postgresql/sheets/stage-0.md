---
title: PostgreSQL 階段 0：基本觀念
subtitle: 第 1～2 課一頁圖解：資料庫是什麼、表、列、欄、型別、主鍵
cols: 3
theme: shadcn
課程: PostgreSQL 第 1～2 課
對照課文: 2026-11-14
---
資料庫管理系統替你處理多人同時存取、當機、資料正確性、查詢速度和權限；你用 SQL 說要什麼，資料存成有型別、有主鍵的表格。[回 PostgreSQL 學習地圖](../index.html)

## A 為什麼不用 Excel 或 JSON 檔
| 店變大後的問題 | 自己用檔案 | DBMS |
|---|---|---|
| 兩個店員同時改 | no 後存的蓋掉先存的 | ok 自己協調同時進來的修改，保留或明確拒絕 |
| 寫到一半當機 | no 扣了庫存、訂單沒寫進去 | ok 當機不壞資料 |
| 價格欄打「八十」 | no 沒有東西攔 | ok 型別檢查在寫入時擋下 |
| 十萬筆訂單找一個人 | no 整個檔案讀進來一筆一筆比 | ok 快速查詢 |
| 工讀生看到全部電話 | no 誰都能看全部 | ok 權限 |

```callout info 名詞分清楚
資料庫（database）是有組織的資料本身；資料庫管理系統（DBMS）是負責存放、查詢、保護資料的軟體。PostgreSQL 是一套 DBMS。
```

## B 資料庫在系統裡站在哪 {span=2}
```flow LR
(瀏覽器／App) -> [後端 API]: HTTP
[後端 API] -> *[(PostgreSQL)]: SQL
[(PostgreSQL)] -> [磁碟上的檔案]: 讀寫檔案
```
前端不直接連資料庫，只能透過後端開的 API 拿資料。你只跟 PostgreSQL 說要什麼，檔案格式、快取、鎖、當機復原由它處理。

```callout warn 帳密只放在後端
連線資訊寫成一行 `DATABASE_URL`，放在後端環境變數或雲端 secret 設定裡。它不 commit 進 Git，也不出現在前端 JS。前端程式出現資料庫連線字串，code review 時要擋下來。
```

## C 關聯式：表格之間用編號對應
```er LR
customers
  id PK
  name text
  phone text
*orders
  id PK
  customer_id FK -> customers
  total integer
```
訂單表沒有寫「王小明」，只寫 `customer_id = 1`；要知道是誰買的，到 customers 找 id = 1 那一列。這種用編號連起來的關係，就是「關聯式」名字的由來。

## D SQL 說要什麼，不說怎麼找 {span=2}
| | JavaScript | SQL |
|---|---|---|
| 告訴電腦 | 怎麼做：自己寫迴圈、`push` | 要什麼：`SELECT name FROM customers WHERE city = '台北';` |
| 迴圈、變數 | warn 自己寫 | ok 不用寫 |
| 掃整張表或用索引 | 你決定 | PostgreSQL 自己決定 |

逐字拆解 `SELECT * FROM customers;`：`SELECT` 我要查詢資料、`*` 所有欄位、`FROM customers` 從 customers 這張表、`;` 一句話結束。
關鍵字大寫只是慣例，`select * from customers` 也能跑。用 ORM（Prisma）或 Strapi 這類框架還是要懂 SQL：查詢變慢、資料出錯時，要看懂它產生了什麼。

## E 一張表的零件
| 零件 | 意思 | 對照 Excel |
|---|---|---|
| 表（table） | 同一種東西的集合，例如所有顧客 | 一張工作表 |
| 欄（column） | 每筆資料都有的屬性，名稱和型別固定 | 一欄 |
| 列（row） | 一筆資料，例如一位顧客 | 一列 |
| 主鍵（primary key） | 唯一認出某一列的欄位 | 沒有，最接近列號 |

```callout info NULL 是沒有值
不是 0，也不是空字串。
```

## F 每一欄都有型別
| 型別 | 放什麼 | 例子 |
|---|---|---|
| `integer` | 整數 | 80、-3 |
| `numeric(10,2)` | 精確小數，用在金額 | 1234.50 |
| `text` | 任意長度的文字 | '王小明' |
| `boolean` | 是或否 | true、false |
| `timestamptz` | 日期加時間（含時區） | '2026-10-29 14:30+08' |

放錯型別的資料在寫入時就被拒絕，比事後找錯容易。前端驗證擋不住 CSV 匯入、修正腳本、其他服務的 API，型別是最後一道防線。

```callout err 金額不用 float
浮點數有誤差（0.1 + 0.2 ≠ 0.3）。金額用 `numeric`，或以「元」為單位的 `integer`。
```

## G 主鍵與 CREATE TABLE {span=2}
```sql
CREATE TABLE products (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  price integer NOT NULL,
  is_available boolean
);
```
| 片段 | 作用 |
|---|---|
| `GENERATED ALWAYS AS IDENTITY` | 每新增一列，資料庫自動給下一個號碼，你不用也不能自己填 |
| `PRIMARY KEY` | 保證不重複、不會是 NULL |
| `NOT NULL` | 這欄一定要有值 |

名字會重複、電話會換或沒有，所以主鍵用跟業務無關、永遠不變的自動編號。`id serial PRIMARY KEY` 是較舊的寫法，新專案用 IDENTITY。再執行一次會因表已存在而出錯；`DROP TABLE products;` 連資料一起刪掉整張表，只在自己的電腦或測試環境用。

## H 單引號、雙引號與命名
| 寫法 | 意思 | 結果 |
|---|---|---|
| `'拿鐵'` | 文字 | ok 文字一律用單引號 |
| `"拿鐵"` | 名稱 | no `column does not exist` |
| `CREATE TABLE Staff` | 沒加引號 | ok 轉成小寫 staff，寫 Staff、STAFF 都找得到 |
| `CREATE TABLE "Staff"` | 保留大小寫 | warn 之後每次都要寫 `"Staff"` |

慣例：表名和欄位名全部小寫、底線連接（snake_case），例如 `order_items`、`created_at`，永遠不需要雙引號。最後一個欄位後面多一個逗號會出現 syntax error。
