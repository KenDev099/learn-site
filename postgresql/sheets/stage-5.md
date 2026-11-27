---
title: PostgreSQL 階段 5：正確性
subtitle: 第 18～19 課一頁圖解：交易、ACID、SAVEPOINT、並發與鎖、隔離等級
cols: 3
theme: shadcn
課程: PostgreSQL 第 18～19 課
對照課文: 2026-11-14
---
交易讓好幾句 SQL 全做或全不做；並發時「先讀再寫」會遺失更新，要讓資料庫一次完成判斷和寫入，或先鎖再讀。[回 PostgreSQL 學習地圖](../index.html)

## A 沒有交易：轉帳只做一半 {span=2}
```sequence
participants: 程式, 資料庫
程式 -> 資料庫: UPDATE wallets 王小明 -100
note 資料庫: autocommit：一執行完就生效
程式 -> 資料庫: UPDATE wallet 陳美華 +100（打錯表名）
資料庫 --> 程式: 錯誤
note 程式, 資料庫: 王小明少了 100，陳美華沒收到
== 包進交易 ==
程式 -> 資料庫: BEGIN
程式 -> 資料庫: 扣款（暫定）
程式 -> 資料庫: 入帳出錯
程式 -> 資料庫: ROLLBACK
note 程式, 資料庫: 回到 BEGIN 之前的樣子
```
結帳要扣庫存、建立訂單、新增明細、扣儲值金，任何一步失敗都不該留下半套，這就是一個交易的範圍。只有一句的操作本身就是全做或全不做。

## B 交易的出路
```flow TB
(BEGIN) -> [進行中：修改都是暫定]
[進行中：修改都是暫定] -> *COMMIT: 正式生效
[進行中：修改都是暫定] -> ROLLBACK: 全部取消
[進行中：修改都是暫定] -> [aborted：之後每一句都被拒絕]: 有一句出錯
[aborted：之後每一句都被拒絕] -> ROLLBACK: COMMIT 也等於 ROLLBACK
[aborted：之後每一句都被拒絕] -> [ROLLBACK TO SAVEPOINT]: 有存檔點時：回到出錯前，交易繼續
```
錯誤訊息是 `current transaction is aborted, commands ignored until end of transaction block`。`SAVEPOINT 名字` 存檔，`ROLLBACK TO SAVEPOINT 名字` 只取消之後的修改；ORM 的巢狀交易底層通常就是 SAVEPOINT。

## C ACID：交易保證的四件事
| 字母 | 意思 | 咖啡店例子 |
|---|---|---|
| A 原子性 | 全做或全不做 | 轉帳不會只扣款沒入帳 |
| C 一致性 | 交易前後都符合主鍵、外鍵、CHECK | 餘額永遠不會變成負數 |
| I 隔離性 | 看不到別人做到一半的狀態 | 查不到「錢已扣、還沒入帳」 |
| D 持久性 | COMMIT 後當機也不會不見 | 收銀機顯示完成後停電，紀錄還在 |

PostgreSQL 靠 WAL 做到持久性。PGlite 把資料放在瀏覽器記憶體，只能體驗 A、C、I。

## D 寫交易的規則
```kv cols=1
一次送出多句: PostgreSQL 自動包成一個交易；ORM 大多一句一句送，不要依賴，明確寫 BEGIN／COMMIT
DDL 也能 ROLLBACK: CREATE、ALTER、DROP 放進交易可以整批取消；MySQL 執行 DDL 會自動 commit
外部動作: 寄信、推播沒辦法 ROLLBACK，放在 COMMIT 成功之後
交易要短: 不在交易裡等使用者輸入或呼叫外部 API，改過的列別人想修改都得等
手動改正式資料: 先 BEGIN，看 UPDATE 的筆數和 SELECT 結果，對了才 COMMIT
COMMIT 之後: ROLLBACK 救不回來，只能再寫一個交易改回來
```

## E Lost update：兩位店員同時賣拿鐵 {span=2}
```sequence
participants: 店員 A, 資料庫, 店員 B
店員 A -> 資料庫: SELECT stock
資料庫 --> 店員 A: 10
店員 B -> 資料庫: SELECT stock
資料庫 --> 店員 B: 10
店員 A -> 資料庫: UPDATE … SET stock = 9
店員 B -> 資料庫: UPDATE … SET stock = 9
note 店員 A, 店員 B: 賣出 2 杯，stock 是 9（應該是 8）
== 原子更新 ==
店員 A -> 資料庫: BEGIN; UPDATE … SET stock = stock - 1
note 資料庫: 鎖住這一列
店員 B -> 資料庫: BEGIN; UPDATE … SET stock = stock - 1
note 店員 B: 等待中…
店員 A -> 資料庫: COMMIT → 9
note 店員 B: 拿到鎖，用最新的 9 計算 → 8
店員 B -> 資料庫: COMMIT → 8
```
讀和寫之間有空檔，別人趁空檔讀到舊值。包進 BEGIN／COMMIT 也一樣：預設的隔離等級下，SELECT 不會擋住別人讀同一筆。

## F 兩種解法
| 情況 | 寫法 |
|---|---|
| 增減數量、累加點數，一句算得完 | `UPDATE … SET stock = stock - 1 WHERE id = … AND stock >= 1`，影響 1 列是賣出、0 列是賣完 |
| 要先讀出來在程式裡判斷 | `BEGIN` → `SELECT … FOR UPDATE` → `UPDATE` → `COMMIT` |

```callout warn FOR UPDATE 的兩個條件
一定要在交易裡：沒有 BEGIN，SELECT 一結束鎖就放掉，等於沒鎖。整段交易要用同一條連線：從連線池各自執行，BEGIN、FOR UPDATE、UPDATE 可能落在不同連線。再加 `CHECK (stock >= 0)` 當保險。
```

## G 死結：互相等對方放手
```flow LR
[店員 A] -> [拿鐵這一列]: 已鎖住
[店員 B] -> [可頌這一列]: 已鎖住
[店員 A] --> [可頌這一列]: 想要，等 B
[店員 B] --> [拿鐵這一列]: 想要，等 A
```
PostgreSQL 自動偵測（預設等 1 秒後檢查），讓其中一個交易失敗：`deadlock detected`。
- 從 BEGIN 重試整個交易，次數有上限。
- 大家用相同順序上鎖，例如依商品 id 由小到大更新。
- 交易越短，越不容易撞在一起。

## H 隔離等級與 MVCC {span=2}
| 等級 | 看到什麼 | 防住 | 沒防住／代價 |
|---|---|---|---|
| READ COMMITTED（預設） | 每一句看到這一句開始時已 commit 的資料 | ok dirty read | no 同交易查兩次結果可能不同；先讀再寫的 lost update |
| REPEATABLE READ | 整個交易同一份快照 | ok 上面全部，加上重讀一致；兩人改同一列時後改的人收到錯誤 | no 某些跨多列的邏輯衝突（兩人各自檢查還有人值班後都請假） |
| SERIALIZABLE | 結果跟一個一個排隊執行一樣 | ok 並發造成的異常不會漏 | warn 代價是比較常失敗，程式一定要寫重試 |

用 `BEGIN ISOLATION LEVEL REPEATABLE READ;` 指定等級。REPEATABLE READ 和 SERIALIZABLE 衝突時的 `could not serialize access…` 是資料庫在保護你，整個交易重試。READ UNCOMMITTED 在 PostgreSQL 的行為跟 READ COMMITTED 一樣。

```callout ok MVCC：讀不擋寫，寫不擋讀
修改一列時寫一個新版本，正在讀的人繼續看舊版本。一般的 SELECT 不會被 UPDATE 擋住；只有兩個人改同一列或用了 FOR UPDATE 才排隊。大多數系統維持 READ COMMITTED，配合原子更新和 FOR UPDATE 就夠。
```
