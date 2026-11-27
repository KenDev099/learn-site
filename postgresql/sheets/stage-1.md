---
title: PostgreSQL 階段 1：CRUD（增查改刪）
subtitle: 第 3～7 課一頁圖解：INSERT、SELECT 與 WHERE、NULL、ORDER BY 與分頁、UPDATE 與 DELETE、聚合與 GROUP BY
cols: 3
theme: shadcn
課程: PostgreSQL 第 3～7 課
對照課文: 2026-11-14
---
CRUD 是新增、查詢、修改、刪除四件事；WHERE 決定動到哪些列，NULL 讓比較變成 unknown，沒寫 ORDER BY 就沒有順序，忘了 WHERE 就是整張表。[回 PostgreSQL 學習地圖](../index.html)

## A INSERT：沒列出的欄位變成什麼 {span=2}
```flow LR
[INSERT INTO 表 (欄位…) VALUES (值…)] -> {沒列出的欄位是 IDENTITY?}
{沒列出的欄位是 IDENTITY?} -> [下一個編號]: 是
{沒列出的欄位是 IDENTITY?} -> {有 DEFAULT?}: 不是
{有 DEFAULT?} -> [預設值，例如 now()、'pending']: 有
{有 DEFAULT?} -> {NOT NULL?}: 沒有
{NOT NULL?} -> [NULL]: 不是
{NOT NULL?} -> *[報錯]: 是
```
- 欄位和值依位置一對一，不是依名稱；欄位清單的順序由你決定，值跟著同樣順序。
- VALUES 後面放多組括號一次新增多列，整句一起成功或一起失敗。
- 永遠寫出欄位清單：省略時表多一個欄位，這句就出錯或值放錯欄。
- `RETURNING` 直接拿回剛新增的那一列，不用再查一次。
- IDENTITY 發出去的號碼不收回，會跳號：id 只用來認出某一列，不拿來算筆數。

## B 資料庫擋下的 INSERT
| 寫法 | 結果 |
|---|---|
| `VALUES ("拿鐵", 110)` | no `column "拿鐵" does not exist`，文字用單引號 |
| 值比欄位少／多 | no `INSERT has more target columns than expressions`／`more expressions than target columns` |
| 自己填 `GENERATED ALWAYS` 的 id | no 不讓你填，把 id 拿掉 |
| `'七十'` 放進 integer | no `invalid input syntax for type integer` |
| `'70'` 放進 integer | warn 轉得過就接受，數字還是不加引號 |
| `'NULL'` | warn 放進的是文字，不是沒有值 |

明確要預設值寫 `DEFAULT`，要沒有值寫 `NULL`，兩個都不加引號。

## C WHERE：只有 true 的列留下
```flow LR
[每一列] -> {WHERE 條件}
{WHERE 條件} -> *[留下]: true
{WHERE 條件} -> [丟掉]: false
{WHERE 條件} -> [也丟掉]: unknown
```
- 比較：`=` `<>` `<` `>` `<=` `>=`；等於是一個 `=`。
- AND 比 OR 先算，混用就加括號。
- `IN` 清單；`BETWEEN 90 AND 110` 含頭尾。
- `LIKE` 用 `%`（任意長度）和 `_`（剛好一個字），會區分英文大小寫；`ILIKE` 不分。
- `SELECT DISTINCT` 去重複，所有 NULL 算同一組。
- `AS` 取別名；WHERE 比 SELECT 先執行，WHERE 裡不能用別名。

## D NULL 的三個陷阱 {span=2}
| 寫法 | 結果 | 改法 |
|---|---|---|
| `WHERE city = NULL` | no 安靜地回傳 0 列，不報錯 | `IS NULL`／`IS NOT NULL` |
| `WHERE city <> '台北'` | warn 漏掉 city 是 NULL 的顧客 | 要算進來就加 `OR city IS NULL`，或用 `IS DISTINCT FROM '台北'` |
| `NOT IN (a, b, NULL)` | no 一列都沒有：最後一項 `city <> NULL` 永遠是 unknown | 用 `NOT IN` 前確定清單裡沒有 NULL |

```callout warn NULL 是「不知道」
任何值跟 NULL 用 `=`、`<>`、`<` 比較都是 unknown，連 `NULL = NULL` 也是。「沒填城市的人要不要算」是業務決定，先問清楚再決定寫法。
```

## E ORDER BY 與 LIMIT 分頁
- 沒有 ORDER BY 就沒有保證的順序；有 LIMIT 卻沒有 ORDER BY，「前 3 筆」就是隨便 3 筆。
- `ASC` 由小到大（預設），`DESC` 只作用在它前面那一個欄位。
- NULL 預設當成最大值：ASC 在最後、DESC 在最前；用 `NULLS FIRST`／`NULLS LAST` 自己決定。
- ORDER BY 在 SELECT 之後執行，可以用別名。

| 頁碼（每頁 5 筆） | 寫法 |
|---|---|
| 第 1 頁 | `LIMIT 5 OFFSET 0` |
| 第 2 頁 | `LIMIT 5 OFFSET 5` |
| 第 3 頁 | `LIMIT 5 OFFSET 10` |

OFFSET =（頁碼 − 1）× 每頁筆數。分頁的排序最後加主鍵（`ORDER BY price, id`），否則會重複或漏掉。OFFSET 越大越慢，前面的列還是要讀過一遍。

## F UPDATE、DELETE 與保命習慣 {span=2}
```flow LR
[先寫 WHERE] -> [SELECT 跑同一個 WHERE] -> [換成 UPDATE … SET 或 DELETE FROM] -> *[看影響幾列]
```
```callout err 省略 WHERE 就是全部
`UPDATE products SET price = 0;` 會把每一樣商品都改成 0（第 6 課示範資料影響 17 列），不報錯、不確認、沒有復原按鈕。正式資料庫手動改資料先 `BEGIN`，確認無誤才 `COMMIT`；`ROLLBACK` 撤銷這段期間的修改。
```
- `SET price = price * 1.1`：每一列用自己原本的值計算；price 是 integer，小數會四捨五入（布朗尼 85 × 1.1 = 93.5 存成 94）。
- 多個欄位用逗號分隔，寫成 `SET price = 150 AND name = '…'` 會出錯或存進錯的值。
- 用 id 指定最安全；`LIKE '%拿鐵%'` 會連抹茶拿鐵一起改到。
- `RETURNING` 回傳被改到或刪掉的列；PostgreSQL 18 可以用 `old.`、`new.` 拿修改前後的值。

| 指令 | 刪什麼 | 表還在嗎 |
|---|---|---|
| `DELETE FROM t WHERE …` | 符合條件的列 | ok 在 |
| `DELETE FROM t` | 全部的列，逐列刪 | ok 在 |
| `TRUNCATE t` | 全部的列，整批丟掉，大表快很多 | ok 在 |
| `DROP TABLE t` | 整張表，連結構一起 | no 不在 |

## G 聚合、GROUP BY 與 HAVING
| 寫法 | 算什麼 | 示範資料 |
|---|---|---|
| `COUNT(*)` | 有幾列 | 18 筆訂單 |
| `COUNT(customer_id)` | 不是 NULL 的有幾列 | 15 筆 |
| `COUNT(DISTINCT customer_id)` | 幾種不同的值 | 9 位會員 |

除了 `COUNT(*)`，聚合函式都忽略 NULL；沒有列符合時 COUNT 是 0，SUM、AVG、MAX 是 NULL。`ROUND(值, 1)` 處理小數。

GROUP BY 把值相同的列分成一組，一組一列，NULL 也自成一組。SELECT 只能放分組欄位和聚合函式，否則 `must appear in the GROUP BY clause or be used in an aggregate function`。

| | WHERE | HAVING |
|---|---|---|
| 篩什麼 | 分組前的每一列 | 分組後的每一組 |
| 聚合函式 | no 不能用 | ok 可以用 |
| 例子 | `status = 'paid'` | `SUM(total) >= 300` |

## H SQL 真正的執行順序 {span=3}
```flow LR
[1 FROM] -> [2 WHERE] -> [3 GROUP BY] -> [4 HAVING] -> *[5 SELECT 算欄位、取別名] -> [6 ORDER BY] -> [7 LIMIT]
```
寫法順序是 SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT，子句寫錯順序會 syntax error。WHERE 在第 2 步還沒分組，不能用聚合函式；WHERE、HAVING 在第 5 步之前，不能用別名（`HAVING spent >= 300` 會出現 `column "spent" does not exist`）；ORDER BY 在第 6 步，可以用別名；LIMIT 最後，先排好再取前幾筆。條件能寫在 WHERE 就寫在 WHERE：越早丟掉不要的列，後面要分組、計算的資料越少。
