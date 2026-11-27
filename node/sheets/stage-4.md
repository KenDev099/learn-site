---
title: Node.js 階段 4：HTTP 服務
subtitle: 第 12～17 課一頁圖解：HTTP 協定、node:http 伺服器、REST 設計、快取、串流與背壓、呼叫外部 API
cols: 3
theme: shadcn
課程: Node.js 第 12～17 課
---
HTTP 的方法、狀態碼和標頭是前後端、快取、代理共同遵守的約定。伺服器要擋住壞請求、回一致的錯誤；大資料用串流並遵守背壓；呼叫別人時要有逾時、有限度地重試、不信任回應。[回 Node.js 學習地圖](../index.html)

## A 一次請求怎麼走 {span=2}
```sequence
participants: 客戶端, DNS, 伺服器
客戶端 -> DNS: 名稱換成 IP
DNS --> 客戶端: IP
客戶端 -> 伺服器: 和那個 port 建立 TCP 連線
note 客戶端, 伺服器: HTTPS 在 TCP 上多一層 TLS
客戶端 -> 伺服器: 請求行、標頭、空行、body
伺服器 --> 客戶端: 狀態行、標頭、空行、body
```
行尾是 `\r\n`，標頭名稱不分大小寫。body 的結尾看 Content-Length（位元組數）或 `Transfer-Encoding: chunked`；keep-alive 讓同一條連線送多個請求。

## B 方法與狀態碼
| 方法 | 安全 | 冪等 |
|---|---|---|
| GET、HEAD、OPTIONS | ok | ok |
| PUT、DELETE | no | ok |
| POST | no | no |
| PATCH | no | warn 不保證 |

安全與冪等決定能不能快取和自動重送。2xx 成功、3xx 轉址或用快取、4xx 客戶端要改請求、5xx 伺服器的問題。

## C 用 node:http 讀 request body {span=2}
```flow LR
(請求) -> {Content-Type 對嗎}
{Content-Type 對嗎} -> 415: 不對
{Content-Type 對嗎} -> {邊讀邊算，超過上限?}
{邊讀邊算，超過上限?} -> 413: 超過
{邊讀邊算，超過上限?} -> {Buffer.concat 後能解析?}
{Buffer.concat 後能解析?} -> 400: 不能
{Buffer.concat 後能解析?} -> {驗證通過?}
{驗證通過?} -> [400 列出所有錯誤]: 不通過
{驗證通過?} -> *處理
```
- 路由用方法加 pathname；路徑不存在 404，方法不對 405 加 Allow。
- 狀態碼、標頭、body 依序送出，標頭送出後不能再改。
- 最外層把任何錯誤轉成固定的 500，完整錯誤寫進 log；標頭已送出時 `res.destroy()`。
- JSON 回應帶 `charset=utf-8`，先轉成 Buffer。
- 對照 Express 5：`express.json()` 預設上限 `100kb`、Content-Type 不是 JSON 時不解析（415 要自己判斷）；四個參數的錯誤 middleware 註冊在所有路由之後，async 處理函式丟出的錯誤會自動交給它（Express 4 要自己 `next(err)`）。
- Node 預設有 `headersTimeout`、`requestTimeout`、`maxHeaderSize` 擋慢速攻擊與超大標頭；客戶端中途離開用 `req.signal` 或 close＋`writableFinished` 偵測。

## D REST 的錯誤與分頁
| 情況 | 狀態碼 |
|---|---|
| 建立成功 | 201 加 Location |
| 請求本身錯 | 400 |
| 不存在 | 404 |
| 和目前狀態衝突，例如已取餐的訂單要取消 | 409，detail 寫出目前與要求的狀態 |
| 收下了但要很久才做完（產報表、匯出） | 202 Accepted：先建一筆「工作」資源，加 `Location` 指向狀態資源，前端輪詢到 done 再拿結果 |

網址用名詞複數（集合 `/orders`、單一 `/orders/42`），動作交給方法。錯誤用 RFC 9457 problem details（`application/problem+json`，type、title、status、detail），驗證錯誤加 errors；所有錯誤經過同一個函式，不洩漏內部細節。cursor 分頁用上一頁最後一筆的 (createdAt, id)，排序以唯一欄位收尾，多拿一筆判斷有沒有下一頁，limit 有上限，壞 cursor 回 400。

## E Idempotency-Key：POST 安全重送
| 收到 | 回應 |
|---|---|
| 沒看過的 key | 照常處理，記下 key、內容指紋和回應 |
| 同 key、同內容，已完成 | 回第一次的結果 |
| 同 key、不同內容 | 422 |
| 同 key，還在處理中 | 409 |

先佔住 key 再 await；key 要有期限，多程序時存在共用的地方。新增選用欄位和端點是相容的；改名、改型別、改語意是破壞性變更。

## F HTTP 快取與樂觀鎖 {span=2}
| 資源 | Cache-Control |
|---|---|
| 公開資料，例如菜單 | `public, max-age=60` |
| 個人資料 | `private, no-store` |
| 檔名帶雜湊的靜態檔 | 加 `immutable` |

```sequence
participants: 客戶端, 伺服器
客戶端 -> 伺服器: GET 帶 If-None-Match
伺服器 --> 客戶端: 沒變：304，沒有 body，照樣帶 ETag
客戶端 -> 伺服器: PUT 帶 If-Match
伺服器 --> 客戶端: 相符：修改並回新 ETag
伺服器 --> 客戶端: 不符 412，沒帶 428
```
`no-cache` 是每次重新驗證，`no-store` 才是不存；帶 Set-Cookie 不會自動阻止快取。ETag 依內容算、加雙引號；If-None-Match 用弱比較，可以是清單或 `*`。依請求標頭回不同內容要加 Vary。If-Match 用強比較，比對和修改之間不能有空隙。

## G 串流與背壓
```flow LR
[上游 資料庫] -> [highWaterMark 緩衝區]: write
[highWaterMark 緩衝區] -> [慢的客戶端]
[highWaterMark 緩衝區] --> [上游 資料庫]: 回傳 false 先停，drain 再寫
```
串流讓記憶體用量和資料大小脫鉤。四種：Readable、Writable、Duplex、Transform。實務上用 `pipeline`，它同時處理背壓和錯誤。gzip 回應看 Accept-Encoding、回 Content-Encoding 和 Vary；標頭送出後才出錯就中斷連線。

逐行讀用 `readline` 配 `for await`。SSE 是不結束的串流回應，在 'close' 裡清掉監聽器和計時器。懷疑工具之前先寫最小重現。

## H 呼叫外部 API
| 失敗 | 重試？ |
|---|---|
| 網路錯誤、逾時 | ok |
| 502、503、504 | ok |
| 429 | warn 照 Retry-After |
| 400、401、403、404、422 | no |
| 2xx 但格式不對 | no |

HTTP 錯誤不會 throw，要看 `res.ok`；網路錯誤是 `TypeError: fetch failed`，原因在 `err.cause`。每個呼叫都要有逾時：`AbortSignal.any([AbortSignal.timeout(ms), 呼叫端的 signal])`。body 一定要讀完或 `cancel()`。

只重試冪等的請求（POST 要帶同一個 Idempotency-Key），指數退避加 full jitter，限制次數和截止時間。同時發出的請求要有上限；一個失敗就取消其他的（fail fast），或用 allSettled 收集全部。上游的回應要驗證，錯誤轉成自己的錯誤類別。
