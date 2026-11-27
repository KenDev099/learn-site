---
title: Node.js 階段 2：非同步與 event loop
subtitle: 第 7～9 課一頁圖解：event loop、thread pool、EventEmitter、AbortSignal、阻塞與 worker
cols: 3
theme: shadcn
課程: Node.js 第 7～9 課
---
JavaScript 只在一條執行緒上跑，等待交給作業系統和 thread pool。等待的工作要能收尾、能取消；CPU 密集的工作會卡住所有請求，要先量再搬走。[回 Node.js 學習地圖](../index.html)

## A 誰在做 I/O {span=2}
```flow LR
[JavaScript 主執行緒] -> [作業系統]: 網路 I/O
[JavaScript 主執行緒] -> [thread pool 預設 4 條]: 檔案、dns.lookup、部分 crypto、zlib
[作業系統] --> *event loop: 完成事件
[thread pool 預設 4 條] --> *event loop: 完成事件
*event loop --> [JavaScript 主執行緒]: 執行 callback
```
`UV_THREADPOOL_SIZE` 要在啟動前設定；超過 pool 大小的工作會排隊。

## B Event loop 的一圈
```flow TB
(timers) -> [pending callbacks]
[pending callbacks] -> *poll
*poll -> check
check -> [close callbacks]
[close callbacks] -> (timers): 下一圈
```
| phase | 處理什麼 |
|---|---|
| timers | 時間到了的 `setTimeout`、`setInterval` |
| poll | 收 I/O 事件、執行 I/O callback；沒事做時在這裡等 |
| check | `setImmediate` 的 callback |

主程式裡 `setTimeout` 和 `setImmediate` 順序不保證；I/O callback 裡 `setImmediate` 一定先。

## C 插隊的佇列與程序結束
- 每段 callback 跑完，先清 nextTick，再清 microtask。ESM 和 CommonJS 頂層的先後不同，不要依賴。
- 遞迴排 nextTick／microtask 會讓 I/O 餓死，改用 `setImmediate`。
- 沒有 ref 的 handle 時程序就結束；`unref()` 讓計時器不撐住程序。
- 用 `process.getActiveResourcesInfo()` 查是誰撐著程序。關掉資源讓程式自然結束，不用 `process.exit()`。

## D EventEmitter 的三種錯誤
`emit` 是同步的，依註冊順序呼叫監聽器。

| 情況 | 結果 |
|---|---|
| 監聽器同步 throw | warn 從 `emit` 傳出，後面的監聽器不執行 |
| 發出 error 事件，沒人聽 | no 直接 throw |
| async 監聽器 reject | warn 沒人等；用 `captureRejections` 或自己 await |

```callout warn 監聽器加了就要有拿掉的時機
`MaxListenersExceededWarning` 是洩漏的線索，用 `--trace-warnings` 找來源，不要只調高上限。`off` 要傳同一個函式，監聽器先存成變數。
```

## E 等待與取消 {span=2}
```flow LR
(等某件事) -> {signal 已取消?}
{signal 已取消?} -> [立刻 reject signal.reason]: 是
{signal 已取消?} -> [掛上監聽器和計時器]: 否
[掛上監聽器和計時器] -> *等到
[掛上監聽器和計時器] -> 逾時: 計時器到期
[掛上監聽器和計時器] -> 取消: abort 事件
*等到 -> [cleanup 全部拿掉]
逾時 -> [cleanup 全部拿掉]
取消 -> [cleanup 全部拿掉]
```
abort 事件只發生一次，已取消的 signal 不會再發，所以掛任何東西之前先檢查。
- `events.once` 把一次事件變成 Promise，會處理 error、支援 signal；`events.on` 搭配 `for await` 一次處理一筆，close 決定何時結束，暫存沒有上限。
- Node 內建 API 接受 signal，取消時丟 `AbortError`、原因在 `cause`；`fetch` reject 的是 `signal.reason` 本身。
- `AbortSignal.any` 合併多個來源；timeout 的計時器不撐住程序。

## F 什麼會卡住 event loop
| 來源 | 怎麼辦 |
|---|---|
| CPU 迴圈：報表、大量排序、圖片處理 | 分段、worker、子程序 |
| `*Sync` API | 處理請求時一律用非同步版本 |
| 超大 JSON | 限制請求大小、分頁或用 stream |
| 災難性回溯的正規表示式（ReDoS） | 改寫規則、限制輸入長度 |

用 `monitorEventLoopDelay` 量延遲、`eventLoopUtilization` 量使用率。

## G 三種解法怎麼選 {span=2}
| 做法 | 適合 | 代價 |
|---|---|---|
| 分段處理 | 偶爾一次、幾百毫秒的計算 | warn 只用一顆 CPU；切成每段幾毫秒，每段之間 `await setImmediate`，async 和 microtask 都不會讓出 |
| worker pool | 經常發生的 CPU 密集工作 | warn 另一份記憶體，資料用結構化複製；要聽 error／exit 並補 worker，`terminate()` 收尾 |
| 子程序 | 外部程式、要隔離記憶體或當掉的風險 | warn `execFile`／`spawn` 加參數陣列避免 shell 注入；一定要設逾時、檢查結束碼、保留 stderr |
| 獨立服務或佇列 | 跑好幾分鐘、失敗要重試、要跨機器 | warn 多一套系統要維運 |

```callout info 選擇順序
先量，先少算，再選最簡單能解決的。worker 用固定大小的 pool：重複使用、排隊、用 id 對應結果。
```
