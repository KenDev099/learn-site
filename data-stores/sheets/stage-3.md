---
title: 資料儲存選型 階段 3：MongoDB 與文件模型
subtitle: 第 7～9 課一頁圖解：內嵌與參照、BSON 型別、schema 驗證、索引與 explain、aggregation、交易、write concern 與 read concern
cols: 3
theme: shadcn
課程: 資料儲存選型 第 7～9 課
---
MongoDB 以一份文件為單位讀寫：建模從存取模式開始，一起成立的規則放進同一份文件用一次更新守住；跨文件才用交易，「寫成功」的意思由 write concern 決定。[回 資料儲存選型 學習地圖](../index.html)

## A 內嵌還是參照 {span=2}
| 問題 | 答案 | 做法 | 活動頁的例子 |
|---|---|---|---|
| 是不是總是一起讀，而且只屬於這一份？ | 是 | 內嵌 | 地址、營業時間、照片清單 |
| 會不會獨立變動、被很多地方用到？ | 會 | 參照，必要時內嵌當下的快照 | 活動頁存 productId 加上架當下的品名與價格 |
| 會不會無限增加？ | 會 | 獨立集合，用欄位參照回來 | 評論、打卡紀錄 |

```callout warn 兩種常見的建模錯誤
無限成長的陣列：評論一直 `$push` 進門市文件，每次讀活動頁都要傳全部，單一文件上限 16 MB。反過來把每張表一對一搬成集合、到處 `$lookup`，得到的是沒有外鍵的關聯式資料庫。
```

## B BSON 型別選對
| 資料 | 該用 | 選錯會怎樣 |
|---|---|---|
| 金額 | Decimal128 | no JS number 是浮點數，加總有誤差 |
| 時間 | Date | no ISO 字串只能照字元排序 |
| id | ObjectId | no 存成字串就查不到 ObjectId |

每份文件都有不重複的 `_id`，預設是含建立時間的 ObjectId。直接 `JSON.stringify` 時 Decimal128 會變成 `{"$numberDecimal":…}`，回給前端前自己轉格式。

## C 部分更新與 schema 驗證
- `$set`、`$inc`、`$push` 加 `$each` 與 `$slice`、`arrayFilters` 在伺服器上只改那幾個欄位；`replaceOne` 整份換掉，並發時會遺失更新。
- upsert 一步完成「找不到就新增」，並發時靠篩選欄位上的唯一索引保證只有一份。
- `$jsonSchema` 讓資料庫擋下壞資料，違反時錯誤碼 121；`additionalProperties: false` 一定要列 `_id`。

| validationLevel | 檢查什麼 |
|---|---|
| strict（預設） | 所有新增與更新 |
| moderate | 新增，以及原本就合法的文件的更新 |
| constraint（9.0 新增） | 保證集合裡每一份都符合，action 必須是 error（或 errorAndLog），不能是 warn |

## D 索引：先 explain，再照 ESR 排欄位 {span=2}
```flow LR
[explain executionStats] -> {讀的遠多於回傳，或有 SORT?}
{讀的遠多於回傳，或有 SORT?} -> [照 ESR 建複合索引]: 是
[照 ESR 建複合索引] -> *[再 explain 確認 IXSCAN、沒有 SORT]
```
看 nReturned、totalKeysExamined、totalDocsExamined 三個數字，理想是差不多。ESR：等值、排序、範圍依序放；`$ne`、`$nin`、`$regex` 算範圍。第 8 課 5 萬家門市的示範：查台北營業中、評分前 20 家，沒索引時讀 5 萬份再排序；建 `{ city, status, rating: -1 }` 後三個數字都是 20。

| 索引 | 用在 |
|---|---|
| 多鍵 | 陣列欄位，每個元素一個索引項 |
| 唯一 | 不能重複，並發 upsert 靠它；重複是錯誤碼 11000 |
| 部分 | 只替符合條件的文件建 |
| TTL | 日期欄位過了指定秒數自動刪；約每 60 秒跑一次，不即時 |

## E Aggregation 與分頁
```flow LR
[$match 放最前面，用得到索引] -> [$group] -> [$sort] -> [$project]
```
- 每個 stage 有 100 MB 記憶體上限；`$first` 前要先排序，或用 `$top`。
- `$lookup` 對每份輸入都查一次，放在 `$match`、`$limit` 之後，對方集合要有索引。
- 分頁用 keyset：排序欄位加 `_id` 當決勝，配同順序的複合索引；`skip` 越翻越慢。
- 每天掃全部歷史的報表離開線上資料庫，移到分析型資料庫。

## F 一起成立的規則放在哪裡 {span=2}
```flow TB
{人要編輯好幾分鐘?} -> [version 欄位做樂觀並發控制]: 是，對不上回 409
{人要編輯好幾分鐘?} -> {規則只在一份文件裡?}: 否，一次請求做完
{規則只在一份文件裡?} -> *[條件寫進 updateOne 的篩選]: 是
{規則只在一份文件裡?} -> [session.withTransaction]: 否，跨多份文件
```
`updateOne({ _id, seatsLeft: { $gt: 0 }, attendees: { $ne: customerId } }, …)`，`modifiedCount` 是 0 就是條件不成立：額滿、已報名或活動不存在。交易要 replica set 或分片叢集。

```kv cols=1
withTransaction 規則: 每個操作傳 `{ session }`；錯誤往外丟；依序 await；函式裡沒有副作用
TransientTransactionError: 從頭重跑整個交易，withTransaction 會處理
UnknownTransactionCommitResult: 只重送 commit，withTransaction 會處理
代價: 預設 60 秒上限；9.0 起同時開啟數上限 10000；修改要放得進快取
```

## G 「寫成功」與「讀到的」有多可靠
| 設定 | 意思 | 故障切換時 |
|---|---|---|
| `w: 1` | primary 寫好就回成功 | no 可能被 rollback |
| `w: 'majority'` | 多數節點寫好才回成功 | ok 不會消失 |
| read concern `local` | 這個節點最新的資料 | warn 可能讀到之後被 rollback 的 |
| read concern `majority` | 已被多數節點確認的資料 | ok 不會變 |

5.0 起大多數部署預設 majority，重要的寫入仍要明寫。讀 secondary 可能讀到舊資料：剛寫的東西讀 primary，或用因果一致 session。

## H 什麼時候不要用 MongoDB {span=3}
| 情況 | 留在 PostgreSQL 的原因 |
|---|---|
| 高度關聯：訂單、品項、付款、庫存 | no 沒有外鍵，幾乎每個寫入都要跨文件交易 |
| 約束多：金額不能為負、庫存不能超賣 | no schema 驗證只檢查單一文件 |
| 臨時的複雜報表 | no `$lookup` 寫起來長、效能難預測 |
| 以文件為單位讀寫、每筆結構差很多 | ok 這才是 MongoDB 的位置：活動頁內容、評論 |

只需要幾個彈性欄位，JSONB 就夠，還保留交易和外鍵。討論時不說「MongoDB 不適合做交易」，說「這份資料的存取模式是 X、一致性需求是 Y，用 MongoDB 要額外處理 Z」。
