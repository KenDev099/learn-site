---
title: 資料儲存選型 階段 2：Redis 不只是快取
subtitle: 第 2～6 課一頁圖解：五種資料結構、限流與 session 與冪等、原子操作、pub/sub 與 Streams、記憶體與持久化與 Cluster
cols: 3
theme: shadcn
課程: 資料儲存選型 第 2～6 課
---
多台伺服器要共享、很常改、很小的狀態是 Redis 的主場。依存取模式挑結構，讀、判斷、寫要一步完成；先決定每種 key 能不能丟、Redis 掛了要放行還是拒絕。[回 資料儲存選型 學習地圖](../index.html)

## A 依存取模式挑結構 {span=2}
| 結構 | 存取模式 | 常用指令與複雜度 | 咖啡店的用途 |
|---|---|---|---|
| string | 單一值或計數 | `GET`、`SET`、`INCR` O(1) | 計數器、快取整份 JSON、鎖 |
| hash | 部分更新 | `HINCRBY`、`HSET` 每欄位 O(1)；`HGETALL` O(N) | 購物車、使用者設定 |
| list | 兩端進出 | `LPUSH`、`RPUSH` O(1)；`LRANGE` O(S+N)（S 起點離端點多遠、N 取幾個）；`LTRIM` O(N)（N 剪掉幾個） | 最近瀏覽、固定長度的紀錄 |
| set | 不重複 | `SADD`、`SISMEMBER` O(1) | 不重複的訪客、標籤 |
| sorted set | 依分數排序 | `ZINCRBY` O(log N)；`ZRANGE` O(log N + M) | 排行榜、依時間排序的資料 |

`INCR`、`HINCRBY`、`ZINCRBY`、`SADD` 在伺服器上一步完成，不會遺失更新；程式裡「讀出、修改、寫回」會。所有資料都 `JSON.stringify` 成 string，兩個請求同時改就互相覆蓋。

## B Key、TTL 與回傳值
```kv cols=1
命名: `ds:功能:id` 分層，把 id、日期、週次放進名稱，例如 `ds:rank:2026-W45`
TTL: 暫時的資料一定要有；`EXPIRE` 對不存在的 key 什麼都不做
TTL 被清掉: `SET` 整個蓋掉會清掉 TTL；`INCR`、`HINCRBY` 不動 TTL
ioredis 回傳: 只有整數回覆是 number，其他都是字串；`HGETALL` 不存在的 key 回 `{}`，不是 null
```
```callout warn O(N) 會卡住所有人
Redis 一次只處理一個指令。`KEYS` 走過整個 key 空間，正式環境不用；`HGETALL`、`SMEMBERS` 碰上大 key 一樣會卡。
```

## C 四種實戰模式 {span=2}
| 模式 | 做法 | 要注意 |
|---|---|---|
| 固定視窗限流 | `INCR` 加上每次都送 `PEXPIRE … NX`，key 帶視窗編號 | 邊界可到 2 倍；只在 `INCR` 回 1 時才設過期，兩個指令中間當掉，key 就永遠沒有 TTL、IP 被永久封鎖 |
| 滑動視窗限流 | sorted set，成員用 request id、分數是時間 | 更準但每個請求一個成員；三步要用 Lua 才不被插隊 |
| 計數批次落地 | `RENAME` 原子地取走 → 讀 → 寫進資料庫 → 成功才 `DEL` | 失敗留著下次送，是至少一次 |
| session | `randomBytes(32)` 當 id，hash 存最少資料，每次使用延長 TTL | 用 set 當索引才做得到「登出所有裝置」 |
| 冪等鍵 | `SET … NX PX` 一步搶下 | 處理中、完成、失敗三種狀態都要處理；資料庫唯一約束是最後防線 |

```callout err 錯了要賠錢的數字不能只放 Redis
庫存、餘額、點數、優惠券剩幾張：Redis 重啟或主從切換可能丟掉最近的寫入。留在 PostgreSQL，用條件更新扣。
```

## D Redis 掛掉時：放行還是拒絕
| 功能 | Redis 壞掉時 |
|---|---|
| 一般 API 限流 | ok fail open，記 log、發告警 |
| 登入暴力破解防護 | warn fail open，退回較保守的防線 |
| session 驗證 | no fail closed，當作沒登入 |
| 冪等鍵 | ok 略過 Redis，由資料庫唯一約束擋 |
| 瀏覽數累加 | ok 直接忽略錯誤 |

ioredis 6.0.0 預設會把指令放進離線佇列等重連、沒有 `commandTimeout`，Redis 出事時請求卡十幾秒才到 catch。給 API 用的連線設 `connectTimeout`、`commandTimeout`、`maxRetriesPerRequest`。

## E 多個指令要一起成立：怎麼選 {span=2}
| 需求 | 用什麼 | 保證與限制 |
|---|---|---|
| 一個指令做得完 | 那個指令本身 | ok 單一指令就是原子的 |
| 很多互不相關的指令，只想快 | pipeline | warn 只等一次來回，不保證原子 |
| 幾個寫入要連續執行，不需要判斷 | `MULTI`／`EXEC` | warn 不被插隊，但不回滾，也不能依讀到的值判斷 |
| 讀了再決定，衝突很少 | `WATCH` ＋ `MULTI` | warn 被改過 `EXEC` 回 null 就重試；要有上限，WATCH 綁在連線上 |
| 讀了再決定，很多人同時搶 | Lua 腳本 | ok 讀、判斷、寫一次做完；搶券、限流的標準做法 |
| 跨很多 key、要回滾、不能丟 | PostgreSQL 交易 | ok 建立訂單、扣款 |

```kv cols=1
Lua 的 key: 一律從 `KEYS` 傳，Cluster 靠它決定送到哪一台
Lua 的時間: 從 `ARGV` 傳，測試才能固定
Lua 的長度: 要短，執行期間整台 Redis 都在等
EVALSHA: ioredis 的 `defineCommand` 處理 EVALSHA 與 NOSCRIPT
```

## F 廣播用 pub/sub，工作用 Streams {span=3}
```flow LR
生產者 -> [(stream ds:orders)]: XADD 加 MAXLEN ~
[(stream ds:orders)] -> [consumer group]: XREADGROUP
[consumer group] -> *worker: 每筆只交給一個消費者
worker -> XACK: 處理成功才確認
worker --> PEL: 沒 ACK 的記在這裡
PEL --> [別的 worker 用 XAUTOCLAIM 接手]: 用 XPENDING 找
[別的 worker 用 XAUTOCLAIM 接手] --> [dead-letter stream]: 送達次數超過上限，移過去並 ACK
```
| | pub/sub | Streams | BullMQ | PostgreSQL SKIP LOCKED | Kafka 類 |
|---|---|---|---|---|---|
| 沒人在聽 | no 丟掉 | ok 存著 | ok 存著 | ok 存著 | ok 存著 |
| 確認與重送 | no 沒有 | warn 自己寫 | ok 內建重試與失敗清單 | warn 自己寫 | ok 提交 offset |
| 跟業務資料同一個交易 | no | no | no | ok outbox | no |
| 多出來的維運 | ok 已有 Redis 就沒有 | ok 同左 | ok 加一個套件 | ok 沒有 | no 一整套叢集 |

pub/sub 是至多一次：`PUBLISH` 回收到的人數，沒人聽就丟掉，訂閱用另開的連線，適合通知與扇出 WebSocket。Streams 是至少一次，處理要冪等；stream 要修剪，依時間用 `MINID`（毫秒），長期、權威的事件放 PostgreSQL 或 Kafka 類系統。

## G 記憶體、淘汰與持久化 {span=2}
| 實例 | 放什麼 | maxmemory-policy | 滿了的時候 |
|---|---|---|---|
| cache | 菜單、商品、查詢結果（能從 PostgreSQL 重建） | `allkeys-lru`／`allkeys-lfu` | 淘汰冷資料，命中率下降 |
| state | session、限流、佇列、stream | `noeviction` | 寫入失敗並告警，不會悄悄丟資料 |

一定要設 maxmemory。`volatile-*` 在沒有任何 key 有 TTL 時等於 noeviction。量記憶體用 `INFO memory` 看整台、`MEMORY USAGE` 量單一 key；估算 = 樣本平均 × 數量 × 餘裕。

| 持久化 | 做法 | 當機會丟 |
|---|---|---|
| RDB | 定期快照，fork 加寫入時複製 | 上次快照之後的寫入 |
| AOF `everysec` | 記錄每個寫入，每秒 fsync | 斷電最多約 1～2 秒 |
| 兩個一起開 | 要安全時的做法 | 仍不等於 PostgreSQL |
| 都不開 | 純快取可以 | 全部，重啟後由資料庫重新填 |

## H 大 key、熱 key 與 Cluster
```flow TB
[key] -> [CRC16 mod 16384]: 有 hash tag 只算大括號裡
[CRC16 mod 16384] -> *[slot]
[slot] -> [負責這段 slot 的 primary]
```
- 大 key：`SCAN` 加 `MEMORY USAGE` 或 `redis-cli --bigkeys`／`--memkeys` 找，`UNLINK` 刪、拆小、限制成長。
- 熱 key：本機快取、複製多份或讀副本分攤；`--hotkeys` 要 LFU 策略。
- 複寫是非同步的；Sentinel 做自動切換；Cluster 的多 key 指令要同 slot，`{user:1}:cart` 與 `{user:1}:session` 落在同一個 slot。
- 監控記憶體、淘汰數、命中率、延遲、連線數、複寫延遲；用 ACL 限制指令。託管服務注意 Redis 8 與 Valkey 的版本與授權差異。
