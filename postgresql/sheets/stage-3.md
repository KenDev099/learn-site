---
title: PostgreSQL 階段 3：資料品質
subtitle: 第 12～14 課一頁圖解：約束、資料型別、JSONB 與陣列
cols: 3
theme: shadcn
課程: PostgreSQL 第 12～14 課
對照課文: 2026-11-14
---
規則寫在表上，資料從哪條路進來都要通過。約束擋住不合理的值、型別擋住格式錯誤，JSONB 和陣列是刻意例外。[回 PostgreSQL 學習地圖](../index.html)

## A 為什麼把規則交給資料庫 {span=2}
```flow LR
[前端表單（有檢查）] -> *約束
[後台管理介面] -> 約束
[CSV 匯入腳本] -> 約束
[同事寫的另一支 API] -> 約束
約束 -> [(PostgreSQL 的表)]: 只收得到合規則的資料
```
每個入口都可能忘記檢查，前端檢查也能被繞過。程式「先查這支手機有沒有人用、沒有才新增」，兩個請求同時進來會各新增一筆；UNIQUE 約束沒有這個漏洞。前端檢查留著做即時提示，資料庫約束負責資料正確，兩者不互相取代。

## B 約束與錯誤代碼
| 約束 | 規則 | 錯誤代碼 |
|---|---|---|
| `NOT NULL` | 一定要有值 | 23502 |
| `UNIQUE` | 不能重複，NULL 不算重複 | 23505 |
| `CHECK (條件)` | 條件不能是 false，NULL 會通過 | 23514 |
| `DEFAULT 值` | 沒寫到這欄時自動填 | — |
| `PRIMARY KEY` | NOT NULL ＋ UNIQUE，一張表一個 | 23502／23505 |
| `REFERENCES` | 值必須存在於另一張表 | 23503 |

```callout warn UNIQUE 和 CHECK 都會放過 NULL
`NULL >= 0` 是 NULL 不是 false，所以通過。欄位不能是 NULL 就另外加 NOT NULL。明確寫 NULL 也不會套用 DEFAULT，要預設值就不寫那一欄，或寫關鍵字 `DEFAULT`。
```

## C 多欄位規則與命名
```sql
CONSTRAINT stamps_once_per_day UNIQUE (member_id, stamp_date)
CONSTRAINT menu_sale_below_price CHECK (sale_price < price)
```
- 牽涉兩個以上欄位的規則只能寫成表約束。
- 兩欄分別加 UNIQUE，意思變成「每位會員一輩子集一次」加上「每天只有一個人集點」。
- 自動名稱像 `members_points_check1` 猜不出是哪一條；用 `CONSTRAINT 名稱` 命名，後端依錯誤代碼和約束名稱轉成「這支手機已經註冊過」，用 409 回給前端，不把原始錯誤訊息丟出去。
- CHECK 放「不可能合理」的規則（積分不能是負的）；行銷常調整的規則放程式或設定表。

## D 型別速查 {span=2}
| 資料 | 建議型別 | 避開 |
|---|---|---|
| 名字、地址、備註 | `text` | `varchar(255)`：在 PostgreSQL 沒有效能好處，只多一個沒根據的上限 |
| 數量、一般 id | `integer` | — |
| 會大量成長的表的 id | `bigint` | `integer`：用完 21 億，新增全部失敗 |
| 金額 | `numeric(p,s)`，或以元／分為單位的 `integer`／`bigint` | `real`／`double precision`：0.1 + 0.2 算出 0.30000000000000004 |
| 事件發生的時間 | `timestamptz` | `timestamp`：換時區就錯，事後無法判斷 |
| 只有日期 | `date` | 文字：排序和計算都會錯 |
| 是非 | `boolean NOT NULL` | 0／1、'Y'／'N' |
| 對外的識別碼 | `uuid`（`gen_random_uuid()`） | 自動編號出現在網址會被猜到下一號 |
| 固定選項 | `text` ＋ CHECK（或 enum） | — |

`值::型別` 轉型（標準寫法 `CAST(值 AS 型別)`），轉不過去會出錯；`3.7::integer` 是四捨五入成 4。enum 刪除或改名選項很麻煩（刪除不支援，要重建型別），業務狀態多半用 text 加 CHECK；選項要附帶顯示名稱、排序時做成獨立的表。

## E 時間：timestamptz 記的是哪一瞬間
```flow LR
[寫入 '2026-10-29 14:30+08'] -> *timestamptz: 換算成 UTC 存
timestamptz -> [台北看 14:30+08]
timestamptz -> [UTC 看 06:30+00]
timestamptz -> [紐約看 02:30-04]
[寫入 '2026-10-29 14:30+08'] -> timestamp: +08 直接丟掉
timestamp -> [永遠 14:30，不知道是哪裡的]
```
- `date + 整數` 加幾天；`date - date` 得到相差天數；`timestamptz + interval '2 hours'` 得到另一個時間點。
- 查一整天：`>= 當天 0 點 AND < 隔天 0 點`；沒寫時區的字串用目前連線的時區解讀。

## F JSONB：讀、查、組
| 寫法 | 拿到什麼 | 用在 |
|---|---|---|
| `options -> 'milk'` | jsonb | 繼續往下取：`options -> 'milk' ->> 'type'` |
| `options ->> 'ice'` | text | 比較、顯示；當數字先 `::integer` |
| `options @> '{"sugar": "無糖"}'` | 是否包含 | 找符合某些選項的列 |
| `jsonb_build_object('id', id, …)` | 組好的 JSON | 把一般欄位組成物件 |

```callout warn 資料庫只檢查「是不是 JSON」
`-> 'ice' = '去冰'` 會把 '去冰' 當 JSON 解析而出錯，跟文字比較用 `->>`。`{"Sugar": "half"}` 這種拼錯的照樣寫得進去，內容要在 API 先驗證。幾乎都用 jsonb；json 只在要保留原始文字時用。
```

## G 陣列
```kv cols=1
'熱門' = ANY (tags): 陣列裡有任何一個元素等於這個值，最常用
tags[1]: 第一個元素；從 1 開始，tags[0] 是 NULL
cardinality(tags): 有幾個元素
ARRAY['熱門', '冰飲']: 寫入；也可以寫字串 '{熱門,冰飲}'
tags @> ARRAY['熱門', '冰飲']: 兩個標籤都要有
array_agg(name ORDER BY id): 聚合函式，搭配 GROUP BY 把多列收成一個陣列
```

## H 什麼時候不該用 JSONB 或陣列 {span=3}
| 符合這一點 | 放進 JSONB／陣列會怎樣 | 改成 |
|---|---|---|
| 需要約束：必填、範圍、選項 | no 資料庫不檢查內容；課程範例裡 key 拼成 `Sugar` 的那筆統計時被算進 NULL，`half` 自成一類 | 一般欄位加 CHECK |
| 需要外鍵 | no JSON 裡的 `customer_id`、`product_ids integer[]` 都不能加外鍵 | 一般欄位、中間表 |
| 經常查詢、篩選、加總、JOIN | warn 每個報表各自處理拼錯的 key | 用 migration 拆成欄位 |
| 每一列都有、結構固定 | warn 沒有理由包進 JSON | 普通欄位 |

```callout ok 適合放進去的
客製選項、第三方 API 原始回應、使用者介面偏好設定、簡單標籤。共同點是附帶資訊、結構多變、整包存取。JSONB 是正規化的有意識例外，不是取代 schema 設計的捷徑。
```
