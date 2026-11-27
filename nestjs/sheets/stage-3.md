---
title: NestJS 階段 3：資料庫
subtitle: 第 12～18 課一頁圖解：Docker、Prisma 7、關聯、交易與並發、效能、整合測試、分層
cols: 3
theme: shadcn
課程: NestJS 第 12～18 課
---
資料庫是程式的一部分：約束、交易、並發都發生在裡面，所以用真的 PostgreSQL 開發與測試。判斷和寫入要變成資料庫不會被插隊的一件事。[回 NestJS 學習地圖](../index.html)

## A 本機開發環境
```flow LR
[Nest 程式] -> [127.0.0.1:5433]: DATABASE_URL
[127.0.0.1:5433] -> [(PostgreSQL 容器 5432)]
[Nest 程式] -> [127.0.0.1:6380]: REDIS_URL
[127.0.0.1:6380] -> [(Redis 容器 6379)]
[(PostgreSQL 容器 5432)] --> [volume pgdata]: 資料留在這裡
```
`docker compose up -d --wait`；`down` 刪容器、`down -v` 連資料一起刪。連不上照順序查：ECONNREFUSED → 28P01 帳密 → 3D000 資料庫名稱。

## B Prisma 7 的四個部分
```tree list
Prisma 7.10.1
  `schema.prisma` | model、generator、datasource；@map 維持 snake_case
  `prisma.config.ts` | CLI 設定與連線網址
  `migrations/` | 進 git 的 SQL，每個檔案套用前看過
  Prisma Client | `PrismaService extends PrismaClient`，全應用一個連線池
```
| 指令 | 做什麼 | 哪裡用 |
|---|---|---|
| `migrate dev` | 產生並套用 migration | ok 開發 |
| `migrate deploy` | 只套用已有的 migration | ok 正式、測試 |
| `db push` | 直接改表，不留紀錄 | warn 只用在可丟棄的原型 |
| `migrate reset` | 刪光資料重建 | no 只在開發機，資料全毀 |

## C 咖啡店的資料模型
```er LR
Customer
  id PK
  name string
*Order
  id PK
  customer_id FK -> Customer
  status enum
  total int
OrderItem
  id PK
  order_id FK -> Order
  product_id FK -> Product
  quantity int
  unit_price int
Product
  id PK
  name string
  price int
  stock int
```
明細存下單當下的單價；金額用 Int；時間用 `@db.Timestamptz(3)`。

## D 並發：讀、判斷、寫回會被插隊 {span=2}
```sequence
請求 A -> DB: SELECT stock = 5
請求 B -> DB: SELECT stock = 5
請求 A -> DB: UPDATE stock = 4
請求 B -> DB: UPDATE stock = 4
note 請求 A, 請求 B: lost update：賣出 2 杯，庫存只少 1
== 改成原子條件更新 ==
請求 A -> DB: UPDATE … SET stock = stock - 1 WHERE id = 2 AND stock >= 1
請求 B -> DB: UPDATE … SET stock = stock - 1 WHERE id = 2 AND stock >= 1
DB --> 請求 A: count 1
note 請求 B: 等 A COMMIT 後，用最新的值重新檢查 WHERE
DB --> 請求 B: count 0 → 庫存不足，回 409
```
```callout ok 四種工具
`updateMany` 加 where 條件看 count 是首選；判斷太複雜用 `$queryRaw` 的 `FOR UPDATE`，多列依固定順序上鎖；人在畫面上編輯的資料用 `version` 樂觀鎖，衝突回 409；依賴一群列的判斷用 Serializable 加有上限的重試。交易只做資料庫的事，外部呼叫放交易外。
```

## E Prisma 錯誤怎麼翻
| Prisma | 意思 | HTTP |
|---|---|---|
| P2002 | 唯一值衝突 | 409 |
| P2003 | 外鍵違規：參照的資料不存在，或仍被參照不能刪 | 409 |
| P2025 | 找不到要改的列 | 404 |
| P2034 | 可重試的交易衝突 | 有上限地重試整個交易，用完仍丟錯 |

只有 SQLSTATE 40001（序列化失敗）和 40P01（死結）值得重試；Prisma 把它們包成三種長相：P2034、P2010、COMMIT 時拋出的 DriverAdapterError。判斷函式 `isRetryable` 由起始檔提供，讀者只寫重試迴圈 `withRetry`：包住整個 `$transaction`，隨機退避、有上限。在 callback 裡重試沒用，出錯的交易只剩回滾。

service 翻成領域錯誤，全域 `PrismaExceptionFilter` 接住其他的，訊息不外洩。

## F 查詢效能
| 問題 | 症狀 | 解法 |
|---|---|---|
| N+1 | 迴圈裡的查詢，`Promise.all` 也一樣多句 | `select`／`include`，每層一句 IN |
| offset 分頁 | 越後面越慢，資料變動會重複或漏 | cursor：排序值 + id，`take: limit + 1` |
| 缺索引 | 資料量夠大（ANALYZE 後）仍是 Seq Scan；資料少時 Seq Scan 正常 | `@@index`，等值欄位放前面，外鍵自己加 |
| 連線池 | 請求卡住不失敗 | 在 `PrismaPg` 設 `connectionTimeoutMillis`、`statement_timeout`；pool × 台數（加上 migration、排程）小於 `max_connections` |

先用 `log: [{ emit: 'event', level: 'query' }]` 加 `$on('query')` 數出一個請求送了幾句 SQL，在測試裡斷言句數。

## G 四層與交易邊界 {span=2}
```flow TB
[HTTP 層 controller] -> [應用層 service：一個方法一個 use case]: DTO
[應用層 service：一個方法一個 use case] -> [領域層：純函式 transition(status, event)]: 不做 I/O
[應用層 service：一個方法一個 use case] -> [(Prisma)]: 開 $transaction，把 tx 傳下去
```
判斷是不是領域邏輯：換掉框架和 ORM，這條規則還成立嗎？repository 不是必備，有重複的複雜查詢再抽。

## H 整合測試的隔離方式
| 方式 | 優點 | 代價 |
|---|---|---|
| 每個測試前 TRUNCATE | 簡單，測得到並發 | 測試檔不能平行跑；表多時每次清空要幾十毫秒 |
| 交易回滾 | 快 | 測不到 commit 後與並發 |
| 每個 worker 一個資料庫 | 可平行 | 設定多、要記得清理 |

測試資料庫用 `migrate deploy` 建表；工廠函式給預設值加覆寫、不跑業務規則；並發測試 `Promise.allSettled` 等全部結束再檢查庫存。
