---
title: Node.js 階段 5：上線前的準備
subtitle: 第 18～22 課一頁圖解：錯誤處理、結構化 log、PostgreSQL 連線池與交易、優雅關機、測試策略
cols: 3
theme: shadcn
課程: Node.js 第 18～22 課
---
錯誤在邊界統一轉換、只記一次，log 是可搜尋的 JSON；資料庫要有逾時和交易，關機先排空再收尾，測試把時間和依賴換成自己控制的。[回 Node.js 學習地圖](../index.html)

## A 兩種錯誤
| 錯誤 | 種類 | 怎麼做 |
|---|---|---|
| 找不到訂單、欄位不對、衝突、上游逾時 | ok 可預期 | 回對的狀態碼、重試、改用備案 |
| `TypeError: Cannot read properties of undefined` | no bug | 500 加 errorId，記完整 log，修程式 |
| 計時器、事件 callback 裡的 throw | no bug | 記 log，讓程序結束、重新啟動 |

錯誤物件帶三樣：子類別與正確 name、穩定 code、保留原因的 cause。自己的類別用 instanceof，別人的錯誤看 code，判斷是不是 Error 用 `Error.isError`。

## B 錯誤怎麼變成回應 {span=2}
```flow LR
[業務程式] -> [領域錯誤]: 只丟這種
[領域錯誤] -> *[HTTP 邊界]: 一個地方轉換
*[HTTP 邊界] -> [4xx 顯示訊息]
*[HTTP 邊界] -> [5xx 通用訊息加 errorId]
[5xx 通用訊息加 errorId] --> [log 寫同一個 errorId]
```
- 浮動 Promise、`forEach(async …)`、計時器與事件 callback 裡的 throw 都會逃出 try/catch。
- `Promise.all` 第一個失敗就 reject，其他的還在跑；要收集全部結果用 `allSettled`。
- `uncaughtException`、`unhandledRejection` 是最後一道防線：同步寫一行 fatal log，停止接新請求，以結束碼 1 結束，由監督者重新啟動。
- 每個錯誤只在邊界記一次，往上丟用 cause 包起來；可預期的錯誤不記成 error。

## C 結構化 log
一行一個 JSON：`time`（ISO）、`level`、固定的 `msg`，變動的值放欄位；寫到 stdout，由平台收集。

| 等級 | 例子 |
|---|---|
| fatal | 啟動時連不上資料庫 |
| error | 500：建立訂單時資料庫出錯 |
| warn | 上游第一次逾時、重試後成功 |
| info | 伺服器啟動、訂單成立、access log |
| debug | 每一句 SQL |

正式環境預設 info，門檻放環境變數；child logger 綁定共同欄位。Error 要自己序列化，含 code 與 cause 鏈；循環參照、BigInt 不能讓 logger 丟錯。

```callout err 不能進 log
密碼、token、Authorization、Cookie、卡號、個資。遮蔽要處理任何深度與陣列，log 外洩當成資料外洩處理。
```

## D 同一個請求的 log 串起來
```flow TB
(請求進來) -> {x-request-id 合法?}
{x-request-id 合法?} -> [沿用]: 是
{x-request-id 合法?} -> [randomUUID]: 否
[沿用] -> *[AsyncLocalStorage.run]
[randomUUID] -> *[AsyncLocalStorage.run]
*[AsyncLocalStorage.run] -> [每一行 log 帶 requestId]
```
回應也帶上 request id。callback 佇列和 EventEmitter 監聽器會在別人的 context 執行，用 `AsyncLocalStorage.bind` 修正。access log 在 close 時記一行，`writableFinished` 為 false 就是 aborted，耗時用 `performance.now()`。正式專案用 pino，跨服務串連用 OpenTelemetry。

## E 連線池與交易 {span=2}
```sequence
participants: 程式, pg.Pool, PostgreSQL
程式 -> pg.Pool: pool.connect() 借一個 client
程式 -> PostgreSQL: BEGIN
程式 -> PostgreSQL: UPDATE 庫存加條件，看 rowCount
程式 -> PostgreSQL: COMMIT，出錯就 ROLLBACK
程式 -> pg.Pool: finally 歸還 client
```
- 練習用的 PostgreSQL 用 Docker Compose 啟動，連線字串放 `DATABASE_URL`，不進版本控制。
- `connectionTimeoutMillis` 預設 0（永遠等），一定要設；加上 `statement_timeout` 限制每一句，加上 `pool.on('error')`。
- 整個程序共用一個 pool，max × 程序數不能超過資料庫上限。
- 值用 `$1` 參數；LIKE 要跳脫 `%`、`_`、`\`；欄位名稱和排序方向用白名單。bigint、numeric 回傳字串，timestamptz 回傳 Date。
- 多品項依 id 排序上鎖；40P01、40001 整個交易重試，次數有上限。

## F 資料庫錯誤怎麼翻
| SQLSTATE | 意思 | HTTP |
|---|---|---|
| 23505 | 違反 UNIQUE | 409 |
| 23503 | 違反外鍵 | 400 |
| 23514 | 違反 CHECK | 400 |
| 57014、連不上 | 逾時或資料庫不可用 | 503 |
| 其他 | 多半是 bug | 原樣丟出，500 |

翻成領域錯誤時 cause 保留原始錯誤。

## G 優雅關機 {span=2}
```flow LR
(SIGTERM) -> [readiness 回 503]
[readiness 回 503] -> [server.close]
[server.close] -> [等請求完成，處理 keep-alive]
[等請求完成，處理 keep-alive] -> [pool.end]
[pool.end] -> *(自然結束)
```
| | liveness `/healthz` | readiness `/readyz` |
|---|---|---|
| 檢查什麼 | 只要能回應，不碰依賴 | 依賴可用（有逾時），而且不在關機中 |
| 失敗時平台做什麼 | 重新啟動程序 | 暫時不送新流量 |

SIGTERM／SIGINT 預設以 128＋編號結束，加了監聽器就由你決定何時結束。關機要有時限（計時器 unref），到了 `closeAllConnections()` 並以 1 結束；第二次訊號立即結束。SIGKILL 攔不到；容器主程序直接執行 node。啟動時依賴暫時不可用：有限次數退避重試，成功才 listen，全部失敗以 1 結束交給監督者。

## H 測試策略
| | 適合 |
|---|---|
| 單元 | 計算、規則、狀態轉換、重試與逾時邏輯 |
| 整合 | SQL、交易、HTTP 路由、和上游的協定 |
| 端對端 | 最重要的幾條流程 |

- 測行為，不測實作。
- 依賴從參數傳進來（時鐘、亂數、baseUrl、pool），測試就能換成假的。
- `mock.fn()` 記錄呼叫並可改寫實作，`t.mock.method` 測試結束自動還原；只替換屬於你的介面。
- `t.mock.timers` 控制 `setTimeout` 和 `Date`；解構 import 的 timers/promises 和 `AbortSignal.timeout` 不受控制。async 迴圈要一步一步 tick。
- 測 HTTP 客戶端用假上游伺服器；被測的伺服器 `listen(0)` 再用 fetch 打。
- 資料庫用真的，每個測試檔一個資料庫或 schema 隔開，測試資料用工廠函式建立，最後檢查連線都有還。
- 不穩定的測試用 `--test-randomize` 和 seed 重現，修好而不是重跑。
