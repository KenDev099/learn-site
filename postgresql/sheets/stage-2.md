---
title: PostgreSQL 階段 2：表與表之間的關係
subtitle: 第 8～11 課一頁圖解：一對多與外鍵、JOIN、多對多中間表、正規化
cols: 3
theme: shadcn
課程: PostgreSQL 第 8～11 課
對照課文: 2026-11-14
---
每一件事實只存在一個地方，其他地方用外鍵指過去；要看完整的資料，再用 JOIN 接回來。[回 PostgreSQL 學習地圖](../index.html)

## A 一對多：編號放在「多」的那邊
```er LR
customers
  id PK
  name text
  phone text
*orders
  id PK
  customer_id FK -> customers
  total integer
customers 1--* orders: 下單
```
把顧客名字和電話抄進每張訂單：王小明下 300 張就抄 300 次，換手機要改 300 列，漏一列就有兩支電話；兩位王小明分不開。顧客只存一份，訂單只記 `customer_id`。

```callout info 例外：凍結在當時的值
訂單上的當時售價、當時的收件地址直接存在訂單裡。先問：這個值要跟著最新的變，還是凍結在當時？
```

## B 外鍵：讓資料庫守住關係 {span=2}
```sql
customer_id integer NOT NULL REFERENCES customers (id),
staff_id integer REFERENCES staff (id) ON DELETE SET NULL
```
| 動作 | 結果 |
|---|---|
| 新增一張屬於 99 號顧客的訂單 | no `violates foreign key constraint "orders_customer_id_fkey"` |
| 刪除還有訂單的王小明 | no `update or delete on table "customers" violates foreign key constraint` |
| 先刪他的訂單，再刪他本人 | ok 子表的列先刪，再刪父表的列 |

- 被指向的是父表（customers），放外鍵的是子表（orders）。建表父 → 子，刪表反過來。
- 外鍵欄位型別跟對方主鍵一致；`(id)` 省略時指對方的主鍵。
- 外鍵錯誤代碼 23503，後端攔下來回 400 或 404，不要讓使用者看到 500。
- 外鍵欄位不會自動有索引，主鍵才會（第 20 課）。

## C ON DELETE：父資料被刪時子資料怎麼辦
| 寫法 | 刪除父表的列時 | 適合 |
|---|---|---|
| 不寫（NO ACTION）或 `RESTRICT` | ok 還有子列指向就拒絕 | 顧客 → 訂單，營業紀錄不能消失 |
| `ON DELETE CASCADE` | warn 子列一起刪，不會有提示 | 顧客 → 外送地址、訂單 → 明細 |
| `ON DELETE SET NULL` | ok 子列保留，外鍵改成 NULL | 店員 → 訂單 |

```callout err SET NULL 不能配 NOT NULL
兩個規則互相矛盾，刪除父表的列時會失敗。CASCADE 只在子資料真的依附父資料時用。
```

## D INNER JOIN 與 LEFT JOIN {span=2}
```flow LR
[customers 每一列] -> {ON o.customer_id = c.id 配得到?}
{ON o.customer_id = c.id 配得到?} -> [配到幾張訂單就產生幾列]: 配得到
{ON o.customer_id = c.id 配得到?} -> [INNER JOIN 丟掉]: 配不到
{ON o.customer_id = c.id 配得到?} -> *[LEFT JOIN 保留，右邊補 NULL]: 配不到
```
| 寫法 | 保留哪些列 |
|---|---|
| `JOIN`（INNER） | 兩邊都配得到的 |
| `LEFT JOIN` | 左表每一列，配不到的右邊補 NULL |
| `RIGHT JOIN` | 右表每一列；實務上把要保留的表寫在左邊、用 LEFT JOIN |
| `FULL JOIN` | 兩邊都保留 |

INNER JOIN 會讓配不到的列悄悄消失：第 9 課示範資料 12 張訂單 `JOIN customers` 只剩 10 列，兩張非會員訂單的 customer_id 是 NULL。`LEFT JOIN orders o … WHERE o.id IS NULL` 找出從沒下過單的顧客，判斷用右表的主鍵。表的別名 `FROM orders AS o`，AS 可省略；多表就多寫幾個 JOIN，每個各自選 INNER 或 LEFT。

## E JOIN 常見的錯
| 寫法 | 問題 | 改法 |
|---|---|---|
| `SELECT id` | no `column reference "id" is ambiguous` | 加表名或別名 |
| `ON o.id = c.id` | no 不報錯，結果全錯 | ON 幾乎都是外鍵 = 主鍵 |
| `FROM orders, customers` 沒條件 | no 每對都配一次（示範資料 12 × 6 = 72 列） | 用 `JOIN … ON` |
| LEFT JOIN 後 `COUNT(*)` | warn 沒配到的也數成 1 | `COUNT(o.id)` |
| LEFT JOIN 後 `WHERE o.status = 'done'` | warn 補上的 NULL 列被篩掉，等於 INNER | 條件移進 ON |
| 一對多 JOIN 後 `SUM(o.total)` | warn 列變多，金額算好幾次 | 拿 `SELECT SUM(total) FROM orders` 對照 |

## F 多對多：中間表 {span=2}
```er LR
orders
  id PK
  customer_id FK
*order_items
  order_id FK -> orders
  product_id FK -> products
  quantity integer
  unit_price integer
products
  id PK
  name text
  price integer
```
- 外鍵放 orders 或 products 都存不下，逗號字串 `'1,6'` 擋不住錯編號也不能 JOIN。一個多對多 = 兩個一對多。
- `PRIMARY KEY (order_id, product_id)`：同一張訂單的同一個商品只能一列；多買一份改 `quantity`。
- `order_id` 設 `ON DELETE CASCADE`；商品還有人買過就不能刪。
- 數量、成交價屬於「這張訂單的這個品項」，放在中間表。

```callout warn 成交價要存下來
`products.price` 是現在的售價，`unit_price` 是那次成交的價格。拿鐵從 110 漲到 120，用 `products.price` 算的舊訂單金額全部跟著變。
```
每張訂單的金額：從中間表往兩邊 JOIN，`SUM(oi.quantity * oi.unit_price)` 搭配 `GROUP BY oi.order_id`。

## G 資料重複造成的三種異常
| 異常 | 大表裡發生什麼 |
|---|---|
| 更新異常 | no 王小明換手機，只改了訂單 3 的列，他有兩支電話 |
| 刪除異常 | no 刪掉訂單 5，張雅婷的電話和「店裡有賣抹茶拿鐵」一起消失 |
| 新增異常 | no 冰滴咖啡沒人買過，主鍵含 order_id 不能是 NULL，存不進去 |

共同原因：顧客、商品、訂單買了什麼這幾件事實被塞進同一張表。

## H 從大表拆到四張表 {span=2}
```flow LR
[orders_raw 一格塞多個品項] -> [orders_flat 一個品項一列]: 1NF
[orders_flat 一個品項一列] -> [customers] & [orders] & *[order_items] & [products]: 2NF ＋ 3NF
```
| 規則 | 要求 | 違反的例子 |
|---|---|---|
| 1NF | 一格只放一個值 | `tags` 放 `'熱門,季節限定'` |
| 2NF | 每欄都靠整個主鍵 | order_items 放 `product_category`，只靠 product_id |
| 3NF | 每欄只描述主鍵那個東西 | 訂單放 `customer_phone`，描述的是顧客 |

2NF 只跟複合主鍵有關，主鍵只有一欄的表自動符合。拆過頭也不對：正規化消除重複的事實，不是越多表越好。

```callout ok 反正規化是有理由的例外
在 orders 存一份 `total`、文章表存 `like_count`：有明確的讀取需求，並在明細變動時同步更新（交易或 trigger）。只為了少寫 JOIN 就不要做：訂單存顧客電話會帶回更新異常。
```
