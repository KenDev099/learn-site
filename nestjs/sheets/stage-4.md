---
title: NestJS 階段 4：快取、背景工作與外部整合
subtitle: 第 19～23 課一頁圖解：Redis、BullMQ、outbox、排程、事件、上傳、webhook、OpenAPI
cols: 3
theme: shadcn
課程: NestJS 第 19～23 課
---
慢的、會失敗、客人不用等的工作離開請求；跟外面系統往來的每一步都假設會重送。佇列和 outbox 只保證「至少一次」，所以狀態放進 PostgreSQL，用交易、唯一約束與冪等的 worker，讓重送不會重複生效。[回 NestJS 學習地圖](../index.html)

## A 快取：cache-aside {span=2}
```flow LR
(GET /menu) -> {Redis 有?}
{Redis 有?} -> *回應: 命中
{Redis 有?} -> [(PostgreSQL)]: 沒命中
[(PostgreSQL)] -> [set(key, value, ttl)] -> 回應
(PATCH /products/:id) -> [(PostgreSQL)]: 先寫
(PATCH /products/:id) -> [del menu:v1:all 與該分類的 key]: 再刪相關 key
```
key 加命名空間與格式版本（`nest-19::menu:v1:all`），一定設 TTL（毫秒），TTL 加隨機避免同時到期；每一步 try/catch 加逾時，失敗記 warn 退回資料庫。`CacheInterceptor` 用網址當 key，不能用在依身分而不同的路由。

## B 哪些資料可以快取
| 資料 | 快取 | 原因 |
|---|---|---|
| 菜單 | ok | 讀多寫少，短暫過時可接受 |
| 庫存 | no | 一過時就賣超 |
| 個人資料 | no | 身分不同、外洩風險 |
| 當日營收報表 | warn 看情況 | 查詢很重，老闆可以接受晚 5 分鐘 |

## C 可靠地寄收據：outbox 加佇列 {span=3}
```flow LR
(POST /orders/:id/pay) -> [交易：訂單 paid + outbox_events]: 同一個交易
[交易：訂單 paid + outbox_events] -> [OutboxRelay 每秒]: FOR UPDATE SKIP LOCKED 取一批
[OutboxRelay 每秒] -> [(Redis：receipts 佇列)]: queue.add jobId=receipt-7
[(Redis：receipts 佇列)] -> *worker: process(job)，先看 receiptSentAt
worker -> Mailer: 寄出後才標記
worker --> delayed: 暫時性錯誤丟出，指數退避重試
worker --> failed: UnrecoverableError 或重試用完，要有人看
```
```callout warn 至少一次
佇列只保證「至少做一次」。worker 要冪等：先檢查、做成功再標記。commit 之後才 add 仍有空檔，所以要 outbox。
```

## D 事件、佇列、排程怎麼選
| 機制 | 適合 | 不適合 |
|---|---|---|
| 程序內事件 `@OnEvent` | 掉了沒關係、同一台就好（廚房看板、統計） | 一定要完成的事 |
| 佇列 BullMQ | 一定要完成、可重試、跨程序 | 回應裡就要知道結果的事 |
| 排程 `@Cron` | 固定時間的批次（過期點數、對帳） | 多台伺服器沒加鎖就每台都跑 |

事件在 commit 之後 emit；listener 用 `{ async: true }`，出錯只記 log 不影響付款；orders 不認識 kitchen 與 stats。

## E 排程與批次工作
```kv cols=1
@Cron 格式: 秒 分 時 日 月 星期，`'0 0 3 * * *'` 是每天 03:00
timeZone: 一定寫 `'Asia/Taipei'`，伺服器多半是 UTC
多台伺服器: 每台都會跑；用 `pg_try_advisory_xact_lock` 或 BullMQ 的 `upsertJobScheduler` 讓一台做，工作本身也要冪等
分批: keyset 游標 `id > cursor`，不用 OFFSET
每批: 一個短交易，檢查點與修正寫在同一個交易
重跑: 條件式 UPDATE 加唯一鍵，同一天再跑結果不變
dry-run: 只算不改；結束記一行摘要 log
```

## F Webhook：驗簽與冪等 {span=2}
```sequence
金流公司 -> API: POST /webhooks/payments（簽章、時間戳記）
API -> API: rawBody 算 HMAC，timingSafeEqual；±300 秒
API -> DB: 同一個交易：webhook_events(event_id 唯一) + 訂單條件更新
DB --> API: 成功
API --> 金流公司: 200
金流公司 -> API: 同一個事件重送
API -> DB: INSERT webhook_events
DB --> API: P2002 已處理
API --> 金流公司: 200，什麼都不做
```
簽章錯、沒簽章、長度不對一律 401，不能是 500；改訂單失敗時事件不能被記成處理過。

## G 檔案上傳
- `FileInterceptor(欄位, { limits: { fileSize } })` 在 multer 這層擋大小，超過回 413。
- 類型看內容開頭的位元組（檔頭），不看使用者給的檔名和 Content-Type；不符合回 422，不存檔。
- 檔名用 `randomUUID()` 加偵測到的副檔名，存到設定的 `UPLOAD_DIR`；`originalname` 帶 `../` 也寫不到別處。

## H API 演進：哪些修改會弄壞客戶端
| 修改 | 相容 |
|---|---|
| 回應多欄位、請求多選填欄位、多一個端點 | ok |
| 刪端點、刪回應欄位 | no |
| 請求新增必填、選填變必填 | no |
| 改型別、改 errorCode | no |

不相容就推新版：`enableVersioning({ type: VersioningType.URI })`、`@Version('2')`，舊版用 `VERSION_NEUTRAL` 保住舊網址，加 Deprecation 與 Sunset 標頭；OpenAPI 文件由 `@nestjs/swagger` 從程式產生，在 CI 比對新舊文件。
