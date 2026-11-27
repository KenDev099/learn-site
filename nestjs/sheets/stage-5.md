---
title: NestJS 階段 5：上線、維運與架構
subtitle: 第 24～27 課一頁圖解：log、健康檢查、優雅關機、除錯、模組邊界、上線前檢查
cols: 3
theme: shadcn
課程: NestJS 第 24～27 課
---
上線之後你看不到程式在做什麼，只剩 log 與健康檢查。資深工程師的工作是讓問題查得到、服務關得乾淨、邊界守得住。[回 NestJS 學習地圖](../index.html)

## A 一個請求的 log 怎麼串起來 {span=2}
```flow LR
(請求) -> [middleware：驗證或產生 requestId]: 回 X-Request-Id
[middleware：驗證或產生 requestId] -> [AsyncLocalStorage.run]: 包住 next()
[AsyncLocalStorage.run] -> [service 照常是 singleton]: await 之後還讀得到
[service 照常是 singleton] -> *AppLogger: ConsoleLogger({ json: true })
AppLogger -> [集中 log]: 一行一個 JSON，最上層有 requestId
```
```callout err 兩種錯誤做法
request scope 會冒泡到整條依賴鏈，每個請求重建實例；模組層級的變數會被同時進來的請求互相蓋掉。
```

## B 健康檢查分兩個問題
| 端點 | 查什麼 | 失敗代表 | 平台的動作 |
|---|---|---|---|
| `/health/live` | 什麼都不查，程序活著就 200 | 卡死 | 重啟程序 |
| `/health/ready` | PostgreSQL、Redis，各自有逾時 | 依賴掛了 | 先別送流量，不重啟 |

Terminus 12：`HealthIndicatorService.check(key).attempt(fn).withTimeout(ms)`；Redis 卡住時 ready 要在 1 秒左右回 503，不能跟著卡住。

## C 優雅關機：收到 SIGTERM 之後 {span=2}
```timeline h
SIGTERM | app.enableShutdownHooks() | app.close() 開始後 /health/ready 回 503，負載平衡器停送新請求
onModuleDestroy | 停接新工作 | 關排程、停止拉新 job
beforeApplicationShutdown | 等進行中的做完 | await worker.close()
關 HTTP | 進行中的請求回應完 | 不接新連線
onApplicationShutdown | Prisma $disconnect | 資料庫最後才斷線
```
不要 `process.exit()`：它會丟掉進行中的請求與工作。

## D 除錯流程
```flow TB
(穩定重現) -> [讀完整的錯誤訊息] -> [列假設] -> [二分法縮小範圍] -> *[修好並寫一個修好前會失敗的測試]
```
| 訊息 | 原因 | 修法 |
|---|---|---|
| `can't resolve dependencies of X (?, B)` | 問號那個參數沒 import、沒 export | 看 index 與模組 |
| 參數名稱沒出現（metadata 是 undefined 或 Object） | 用 `import type` 匯入要注入的 class | 改成一般 import |
| `Cannot access 'X' before initialization` | ESM 循環 import，nest build 後才出現 | 改依賴方向，不用 forwardRef 蓋過去 |
| 回應變慢、連 `/health` 都卡住 | 同步 CPU 工作卡住事件迴圈 | `monitorEventLoopDelay` 量；改用非同步 API、切小塊、worker_threads 或佇列 |

## E 模組邊界的三條規則 {span=2}
```flow LR
*orders -> [order.paid 事件]: commit 之後 emit
[order.paid 事件] -> loyalty: 加點
[order.paid 事件] -> notifications: 寄收據
loyalty -> [(stamp_cards)]: 只有 loyalty 碰
notifications -> Mailer
[(orders 資料表)] -> orders: 只有 orders 碰
group src/orders/events/ 是公開契約: order.paid 事件
```
1. 資料歸屬：一張表只有一個模組碰，外面透過 service 不透過 repository。
2. 最小公開：`exports` 只放別人真的需要的；換名字、barrel 都算公開。
3. 單向依賴：循環用領域事件解；`@Global()` 只留 Prisma 與設定。

架構測試每次掃 `src` 的 import：禁止循環 import（`import type` 不算）、禁止 orders import loyalty、只有 loyalty 碰 stampCard 與 pointTransaction；用故意違規的版本確認抓得到，用合法修改確認不誤報。先做模組化單體，每個決定寫一份 ADR。

## F 上線前檢查清單
| 檢查 | 怎麼確認 |
|---|---|
| 能正式啟動 | `nest build` 後 `node dist/main.js`，不只 Vitest |
| live 不查依賴 | 資料庫掛了 live 仍 200，ready 503 |
| 管理端點有 guard | guard 掛在 class，不寫在方法裡 |
| DTO 擋多餘欄位 | `whitelist` 加 `forbidNonWhitelisted` → 400 |
| 寫入後快取失效 | 改價之後馬上看到新價格 |
| 測試 | 錯誤路徑、重送、並發都有測；resetAll 清表也清佇列 |
| 關機乾淨 | `enableShutdownHooks`，worker 先關、Prisma 最後斷 |
| 設定驗證 | 缺變數就不啟動 |

出過的事故變成新的一列。接下來：登入與權限在認證課，容器、CI/CD 與 AWS 在部署課，限流、分片與事故處理在系統設計課。
