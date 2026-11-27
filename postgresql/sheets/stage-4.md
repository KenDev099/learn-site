---
title: PostgreSQL 階段 4：進階查詢
subtitle: 第 15～17 課一頁圖解：常用函式、子查詢與 CTE、視窗函式
cols: 3
theme: shadcn
課程: PostgreSQL 第 15～17 課
對照課文: 2026-11-14
---
報表的加工、分步驟計算、排名與累計，都能在一句 SQL 裡做完。函式逐列加工，CTE 替每一步取名，視窗函式保留每一列再多算一欄。[回 PostgreSQL 學習地圖](../index.html)

## A 字串與 NULL 處理
| 寫法 | 重點 |
|---|---|
| `a \|\| b` | 碰到一個 NULL，整串變 NULL |
| `concat(a, b, …)` | NULL 當成空字串 |
| `lower(trim(email))` | 從最裡面開始算：先去空白再轉小寫 |
| `substring(s, 1, 4)` | 位置從 1 開始數 |
| `replace(s, '-', '')` | 全部取代 |
| `split_part(s, '@', 2)` | 切開後取第 2 段 |

```callout warn 空字串不是 NULL
`COALESCE(a, b, …)` 回傳第一個不是 NULL 的值，換不掉 `''`。先 `NULLIF(trim(email), '')` 把空字串變 NULL，再交給 COALESCE。`NULLIF(x, 0)` 也用來避免 division by zero。
```

## B 日期：切月份與加減
| 寫法 | 結果（例：t 是 2026 年 10 月的時間） |
|---|---|
| `date_trunc('month', t)` | 2026-10-01 00:00:00+08，還是時間型別 |
| `extract(month FROM t)` | 10 |
| `to_char(t, 'YYYY-MM')` | '2026-10'；分鐘是 `MI`，`MM` 是月 |
| `t + interval '7 days'` | 另一個時間點 |
| `age(t1, t2)` | 換算成幾個月又幾天 |

- 這些函式依目前連線的時區切；同一筆訂單在 UTC 和台北可能落在不同月。
- `now()` 是交易開始的時間：同一個交易裡呼叫幾次都一樣，但每次執行都不同；報表和測試用固定時間。
- 篩選某個月用時間範圍，不寫 `WHERE to_char(...) = '2026-10'`，前者才用得到索引。

## C CASE WHEN：分級與條件統計
```flow LR
(一筆訂單) -> {total >= 300?}
{total >= 300?} -> 大單: 是
{total >= 300?} -> {total >= 150?}: 否
{total >= 150?} -> 中單: 是
{total >= 150?} -> [ELSE 小單]: 否
```
由上往下，第一個成立就停，條件要從嚴到寬排；沒寫 ELSE 又都不成立時是 NULL。

| 一次算多種統計 | 沒有符合的列時 |
|---|---|
| `sum(CASE WHEN status = 'paid' THEN total ELSE 0 END)` | 0 |
| `sum(total) FILTER (WHERE status = 'paid')` | NULL |

## D 子查詢放在哪裡 {span=2}
| 位置 | 回傳 | 例子 |
|---|---|---|
| 比較運算後面 | 一個值；多列會報錯 `more than one row returned by a subquery` | `WHERE price > (SELECT avg(price) FROM products)` |
| `IN (…)` | 一欄名單 | `WHERE id IN (SELECT customer_id FROM orders WHERE status = 'paid')` |
| `EXISTS (…)` | 只問有沒有列 | `WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)` |
| `FROM (…) AS 名稱` | 一張臨時的表 | 先 GROUP BY 算每人幾張，再取平均 |
| 相關子查詢 | 用到外層那一列的值，觀念上每列跑一次 | 每個分類裡最貴的商品；內外層同一張表要用別名 |

WHERE 是一列一列篩選的階段，還沒有「全部的平均」，所以 `WHERE price > avg(price)` 不行，要先用子查詢算好。

```callout err NOT IN 的 NULL 陷阱
子查詢裡只要有一個 NULL（例如散客訂單的 customer_id），`id NOT IN (…)` 就是空結果：`6 <> NULL` 是「不知道」，整個條件不成立。「沒有」的篩選一律用 NOT EXISTS。
```

## E CTE：替每一步取名字
```flow LR
spend -> avg_spend: 取平均
avg_spend -> *[最後的 SELECT]: 高於平均的人
spend -> 最後的 SELECT: 也能直接用
```
`WITH 名稱 AS (…)`，多個步驟用逗號隔開，後面的步驟可以用前面的。由上往下讀就是思路，每一步能單獨拿出來執行、檢查中間結果。CTE 是為了好讀，不是為了變快。

```sql
WITH RECURSIVE days AS (
  SELECT date '2026-10-01' AS day
  UNION ALL
  SELECT day + 1 FROM days
  WHERE day < date '2026-10-07'
)
SELECT day FROM days;
```
忘了 WHERE 停止條件就會無限產生；`generate_series` 也能產生日期序列，WITH RECURSIVE 真正擅長的是樹狀資料。

## F JOIN、EXISTS、子查詢、CTE 怎麼選
| 情況 | 建議 |
|---|---|
| 結果需要另一張表的欄位 | JOIN |
| 只是用另一張表篩選「有沒有」 | EXISTS／IN |
| 「沒有」的篩選 | NOT EXISTS（或 LEFT JOIN 後找 NULL），避免 NOT IN |
| 跟一個統計值比較 | 子查詢 |
| 步驟超過兩層、要重複使用中間結果 | CTE |

一對多 JOIN 配到幾次就出現幾次；EXISTS／IN 是篩選，每位顧客最多出現一次。

## G 視窗函式：保留每一列 {span=2}
| | 結果列數 | 寫法 |
|---|---|---|
| `GROUP BY category` | 每個分類一列 | `avg(price) … GROUP BY category` |
| 視窗函式 | 每個商品都還在，多一欄同類平均 | `avg(price) OVER (PARTITION BY category)` |

```kv cols=1
OVER (): 視窗是整張結果
OVER (PARTITION BY 欄位): 每一列只看得到同組的列，像 GROUP BY 但不合併
OVER (ORDER BY 欄位): 視窗內排好順序，排名、累計、前後比較都靠它
```
| 價格 | 130 | 120 | 120 | 110 |
|---|---|---|---|---|
| `row_number()` 每列號碼都不同 | 1 | 2 | 3 | 4 |
| `rank()` 同分同名次，下一名跳號 | 1 | 2 | 2 | 4 |
| `dense_rank()` 同分同名次，不跳號 | 1 | 2 | 2 | 3 |

row_number 遇到同分誰先誰後不保證；要穩定就在 ORDER BY 加 `id`。

## H 取前 N 名、累計、和上一筆比
```callout err 視窗函式不能放在 WHERE
`window functions are not allowed in WHERE`：WHERE 執行時還沒算出來。先在 CTE 裡算 `row_number() OVER (PARTITION BY category ORDER BY price DESC, id) AS rn`，外層再 `WHERE rn <= 2`。
```
- 每組取最新一筆：PARTITION BY 分組、row_number 編號、外層取 `rn = 1`。同分要全部入選就改用 rank。
- `sum(revenue) OVER (ORDER BY day)` 是累計；加 PARTITION BY 就各自累計。排序值重複時，同值的列會顯示同一個累計值。
- `lag(revenue)` 拿前一列、`lead` 拿後一列，第一列的 lag 是 NULL。前一列不一定是前一個日曆日，沒營業的日子先補進日期清單。
- `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` 是前兩列加自己，用來算三日移動平均。
