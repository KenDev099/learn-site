---
title: 資料儲存選型 階段 4：搜尋與檔案
subtitle: 第 10～12 課一頁圖解：倒排索引、中文分析器、mapping 與查詢、outbox 同步、別名切換、物件儲存與 presigned URL
cols: 3
theme: shadcn
課程: 資料儲存選型 第 10～12 課
---
搜尋索引是可以重建的衍生資料，用 outbox 讓它最終一致、看得到落後多少；檔案放物件儲存，資料庫只存 key 與中繼資料。bulk 要逐筆看結果，上傳要由伺服器自己用 HeadObject 確認。[回 資料儲存選型 學習地圖](../index.html)

## A 為什麼需要搜尋引擎 {span=2}
```flow LR
[文件 焦糖拿鐵] -> 分析器: 寫入
[搜尋字 拿鐵] -> 分析器: 查詢用同一套規則
分析器 -> *[倒排索引：詞 → 文件清單]
[倒排索引：詞 → 文件清單] -> [合併並算分數]
```
| 做法 | 問題 |
|---|---|
| `LIKE '%拿鐵%'` | no 慢、不排序、不懂詞 |
| PostgreSQL 全文檢索 | warn 中文沒有空白，內建解析器切不開 |
| 搜尋引擎 | ok 中文分詞、相關性排序、分類統計三個一起要時才考慮 |

搜一個詞就是查一個 key；改文件等於重新索引整份，適合讀多寫少的資料，例如菜單。

## B 分析器決定「詞」是什麼
| 分析器 | 「焦糖拿鐵」切成 | 取捨 |
|---|---|---|
| standard（預設） | 焦、糖、拿、鐵 | no 搜「鐵」也找到拿鐵 |
| cjk（內建） | 焦糖、糖拿、拿鐵 | ok 不用詞典；warn 有雜訊、單字搜不到 |
| 詞典式分詞 | 真正的詞 | warn 要裝外掛，跟著版本升級 |

用 `_analyze` 看實際結果；客服說「搜不到」，第一步是看兩邊切出的詞有沒有交集。同義詞用 `synonym_graph`，只放在查詢時用的分析器。

## C Mapping、查詢與相關性 {span=2}
| 用途 | 寫法 |
|---|---|
| 全文搜尋 | `text` 加分析器 |
| 篩選、排序、聚合 | `keyword` |
| 兩者都要 | multi-field：`name` 加 `name.keyword` |
| 金額 | `integer` 或 `scaled_float`，不用 float |
| 擋打錯的欄位 | `dynamic: 'strict'` |
| 關鍵字 | `bool` 的 `must`，`multi_match` 用 `name^3` 加權 |
| 分類、價格、供應狀態 | `bool` 的 `filter`，不算分數 |
| 分類統計 | `terms` 聚合；`post_filter` 讓統計不受已選分類影響 |

已有欄位大多不能改，要建新索引重新匯入。寫入後預設每 1 秒 refresh 才搜得到。BM25：稀有的詞重要、次數有上限、短欄位加分；用 `explain` 看分數，`function_score` 加入銷量，先有案例集再調整。

## D 雙寫一定會不一致，改用 outbox {span=3}
```flow LR
[API] -> [同一個交易：UPDATE products 加 INSERT outbox]: version 由資料庫遞增
[同一個交易：UPDATE products 加 INSERT outbox] -> [worker]: FOR UPDATE SKIP LOCKED 取一批
[worker] -> *[Elasticsearch]: 一個 bulk，每筆帶 version_type external
[worker] --> [outbox 標記完成或 attempts 加 1]: 逐筆看 status
```
雙寫沒有共同交易：資料庫成功、ES 失敗，程式在兩步之間崩潰，兩個請求交錯，都會讓兩邊不一樣。資料庫是記錄系統，目標是最終一致，而且看得到落後多少。刪除也要有事件；事件可以帶內容，也可以只帶 id 讓 worker 讀最新資料。CDC（Debezium、邏輯複寫）不用改應用程式，但多一套要維運的系統。

## E Bulk 結果與版本號
| 每筆 status | 事件怎麼辦 |
|---|---|
| 200、201 | ok 標記完成 |
| 409 版本衝突 | ok 標記完成，ES 已經有一樣新或更新的版本 |
| 404（delete） | ok 標記完成 |
| 400 等其他 | no attempts 加 1，記下 last_error |
| 整個請求失敗 | no ROLLBACK 並丟錯，下一輪再送 |

bulk 回 HTTP 200 不代表每筆都成功。`version_type: 'external'` 只接受更大的版本，重送和亂序都無害；delete 也帶版本，墓碑預設保留 60 秒（`index.gc_deletes`）。

## F 改 mapping 不停機，上線要看得到落後 {span=2}
```timeline h
1 | 建新索引 | 名稱加日期
2 | 從資料庫全量匯入 | 來源是記錄系統，不是舊索引
3 | 重播期間的 outbox 事件 | 版本號擋掉重複與舊的
4 | refresh | 不然切換後可能搜到 0 筆
*5 | 一個 _aliases 請求原子切換 | 程式永遠只用別名
6 | 再重播一次，刪舊索引 | 先留一兩天可回滾
```
```kv cols=1
同步延遲: outbox 最舊未處理事件的年齡，設告警
每日對帳: 用 `search_after` 走訪，比對 (id, version)，修 missing、stale、orphaned
全量重建: 流程要演練過，知道要多久
outbox 清理: 只增不減，排程刪掉送完很久的事件
```

## G 檔案上傳：pending → uploaded {span=2}
```sequence
participants: 瀏覽器, API, PostgreSQL, 物件儲存
瀏覽器 -> API: 申請上傳
API -> PostgreSQL: 新增 receipts，status pending，key 由伺服器產生
API --> 瀏覽器: 短效的 presigned PUT 網址
瀏覽器 -> 物件儲存: PUT 檔案，只走這一次
瀏覽器 -> API: 傳好了
API -> 物件儲存: HeadObject 讀實際大小與型別
API -> PostgreSQL: 冪等地改成 uploaded，或刪檔改成 rejected
```
PUT 網址限不住大小，所以由伺服器確認。Content-Type 用 `signableHeaders` 簽進去；發網址的 client 設 `requestChecksumCalculation: 'WHEN_REQUIRED'`。SDK v3 用 `s3.send(new XxxCommand(…))`，連 Garage 這類 S3 相容服務要設 endpoint、`forcePathStyle`、region。

## H 檔案為什麼不放資料庫，以及下載與清理
| | PostgreSQL | 物件儲存 |
|---|---|---|
| 擅長 | 小筆資料、查詢、交易、約束 | 大檔案整份存取 |
| 存取 | SQL，經過連線 | HTTP，以 bucket 加 key 取整份 |
| 部分修改 | ok 可以 | no 只能整份覆蓋 |
| 咖啡店放 | receipts 表：key、訂單、大小、狀態 | PDF 本體 |

- prefix 不是真的資料夾。
- 下載前做物件層級授權，再發 60 秒的 GET 網址並設定 Content-Disposition。
- 生命週期規則清 `tmp/` 與中斷的分段上傳，刪除規則一定要限定 prefix；排程清超時的 pending 與孤兒，`ListObjectsV2` 每頁 1,000 個要走完。
- bucket 私有、IAM 只給需要的 prefix 與動作。
