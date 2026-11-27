---
title: Node.js 階段 6：資深工程師的功課
subtitle: 第 23～26 課一頁圖解：效能量測、記憶體洩漏、多程序擴展、威脅模型與資源上限、期末專題
cols: 3
theme: shadcn
課程: Node.js 第 23～26 課
---
先量再改，改完再量；多程序下記憶體不共享，共享狀態放資料庫；每條不可信輸入都要一道檢查，每種資源都要有上限。期末專題把整門課放進一個不用框架的咖啡店訂單 API。[回 Node.js 學習地圖](../index.html)

## A 效能工作的流程 {span=2}
```flow LR
(定義問題) -> [像正式環境的條件下重現]
[像正式環境的條件下重現] -> *[量測找原因]
*[量測找原因] -> [只改一個地方]
[只改一個地方] -> [用同樣方法再量]
[用同樣方法再量] -> [留下效能測試或警報]
```
定義問題：哪個端點、多少流量、p99 多少、目標多少。平均值會騙人，延遲看百分位數。`node --cpu-prof --cpu-prof-dir=profiles app.ts` 產生 CPU profile，看 self time 找熱點；伺服器用 `--inspect` 在執行中錄製。

## B 常見的 CPU 熱點
| 寫法 | 改成 |
|---|---|
| 迴圈裡用 `find`、`filter`、`includes` 查另一個陣列（O(n²)） | 先建 Map／Set |
| 重複的 `JSON.stringify`／`JSON.parse` | 比較需要的欄位、`structuredClone` |
| 複雜的正規表示式 | 簡化規則、限制輸入長度 |
| `crypto.pbkdf2Sync`、`scryptSync` | 非同步版本 |
| 每個請求寫很多 log | 只 log 需要的欄位 |

改完再量，夠快就停。

## C 記憶體洩漏
`process.memoryUsage()` 的 heapUsed 看 GC 之後的低點；低點持續上升才是洩漏。`--max-old-space-size` 要小於容器上限，但不能拿來修洩漏。

| 洩漏 | 修法 |
|---|---|
| 沒有上限的快取 | LRU 加 TTL |
| 沒移除的監聽器 | finally 裡 `off()` |
| 閉包抓著大物件 | 只取需要的欄位 |
| 沒清的計時器 | 保存回傳值，結束時清掉 |
| 存起來的請求物件 | 只存需要的資料 |

比較兩個 heap snapshot，依建構子看哪種物件變多，從 Retainers 找出引用鏈。snapshot 與診斷報告都要當機密。

## D 一顆核心不夠用
正式環境多半由容器平台擴展：一個容器一個程序，重啟、退避、滾動更新由平台做；選一層做擴展，不要在容器裡又開 cluster（CPU 限制下反而更慢）。下表的 cluster 與監督者是選讀，想看懂 pm2、Kubernetes 在背後做了什麼再看。

| 做法 | 擴展什麼 | 一份掛了 |
|---|---|---|
| cluster 或 pm2（選讀） | 同一台機器的多顆核心 | warn primary 補一個；整台機器掛了就全掛 |
| 多個容器 | 多顆核心、多台機器 | ok 平台補一個 |
| worker_threads | 一個程序裡的 CPU 運算 | no 整個程序一起掛 |

一個 Node 程序只用一顆核心執行 JavaScript（`os.availableParallelism()` 看有幾顆）。

（選讀）cluster 的 primary fork 出多個 worker 共用一個 port，除了 Windows 預設 round-robin 分配連線；primary 先走，worker 會立刻跟著結束。

（選讀）監督者要補人、退避並設上限，關機時等所有 worker 優雅結束。reusePort 只有部分平台支援（macOS 不行）；pool × 程序數不能超過資料庫上限。

## E 多程序下會壞掉的狀態 {span=2}
| 存在記憶體的東西 | 開成多個程序之後 |
|---|---|
| 快取 | no 每個程序一份，內容不一致 |
| 冪等鍵的 Map | no 重送落在另一個程序，又建立一筆訂單 |
| SSE 的訂閱 | no 更新落在別的 worker，客人收不到 |
| 程序內的佇列、鎖 | no 只在一個程序裡成立 |
| 限流計數 | no 實際變成上限 × 程序數 |

```callout ok 讓程序無狀態
黏性連線只是止痛藥，共享狀態放資料庫或 Redis。冪等鍵：`INSERT … ON CONFLICT DO NOTHING` 讓主鍵決定誰先到，和建立訂單、存回應放同一個交易。跨程序事件用專用連線 LISTEN、在更新的交易裡 `pg_notify`（COMMIT 才送、payload 小於 8000 位元組），斷線期間的通知不會補送；PgBouncer transaction 模式不能 LISTEN。
```

## F 威脅模型：輸入流到哪裡
| 去處 | 攻擊 | 防法 |
|---|---|---|
| 檔案路徑 | 路徑穿越 | resolve 後比對 root + sep，realpath 再比一次 |
| shell | 指令注入 | `execFile`／`spawn` 加參數陣列，需要時用 `--` 隔開選項 |
| SQL | SQL injection | 參數化查詢 `$1` |
| 物件合併 | 原型污染 | 略過危險的鍵、schema 驗證 |
| 正規表示式 | ReDoS | 讓每個字元只有一種走法；只限長度不夠 |

`req.url` 是原樣字串，URL 也不處理 `%2F`。更好的設計是不讓使用者給路徑。在反向代理後面，只有直接連進來的是信任代理時才看 X-Forwarded-For，並從右往左跳過信任代理；記得去掉 `::ffff:`。

## G 上限與最小權限
- 每一種資源都要有上限：body、標頭、逾時、上游、連線與併發、次數。單一一項擋不住阻斷服務。
- Permission Model：`--permission` 加 `--allow-*`；不存在的資料夾要加 `/*`。Node 24 不限制網路，它不是沙盒。
- 依賴：lockfile 加 `npm ci`、install script 政策、看懂 `npm audit`、最少依賴。
- 祕密不進 git 和 log。

## H 期末專題：一個請求的一生 {span=2}
```flow LR
(requestId 與 logger.child) -> [比對路由 404／405]
[比對路由 404／405] -> [處理函式]
[處理函式] -> *[回應]
[處理函式] -> [錯誤邊界]: throw
[錯誤邊界] -> [problem 或 500 加 errorId]
*[回應] --> [res close 記一行 access log]
[problem 或 500 加 errorId] --> [res close 記一行 access log]
```
access log 掛在 res 的 close 上：正常完成、錯誤、客戶端中途離開，都剛好記一行。500 只給 errorId，log 遮蔽 token 與個資。
- 先把老闆的話改寫成可以測試的驗收條件，切成里程碑；動手前定合約：路由表、problem 格式、環境變數表、資料表。
- `createApp({ config, pool, logger })` 依賴注入，資源的建立與關閉集中在 main.ts。
- 並發的正確性交給資料庫：條件式 UPDATE 防超賣與非法轉換，唯一約束加兩段式的冪等鍵讓多程序共用。
- SSE、上游呼叫都要能被取消與結束；上游呼叫要有逾時、有限的重試、尊重 Retry-After。
- 上線前用檢查清單逐項確認；部署到新的主版本時重新跑一次全部測試。
