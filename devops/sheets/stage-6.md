---
title: 部署與維運 階段 6：可觀測性與可靠性
subtitle: 第 21～25 課一頁圖解：集中 log、指標與 SLO、分散式追蹤、備份與災難復原、告警與事故處理
cols: 3
theme: shadcn
課程: 部署與維運 第 21～25 課
---
log 回答發生了什麼、指標回答服務好不好、trace 回答慢在哪裡；用 SLO 決定什麼時候叫醒人，備份要還原過才算數。[回 部署與維運 學習地圖](../index.html)

## A Log 從容器到查詢介面 {span=2}
```flow LR
[app：一行一個 JSON 到 stdout] -> [logging driver：存檔並輪替] -> [收集器] -> [(儲存與索引)] -> *[Grafana 這類介面]
```
收集器例如 Alloy、Fluent Bit、Vector、OpenTelemetry Collector。`json-file` 預設不輪替，官方建議 `local`（20m × 5、壓縮）。集中之後的成本是量 × 保留期限：熱資料留短、封存放便宜的地方、debug 預設關閉、成功請求可以取樣。

## B 好查的 log
```kv cols=1
一致的欄位: ts、level、service、version、env、request_id、trace_id、route、status、duration_ms
route: 用路由樣板
錯誤: 記成一行
寫出之前: 用 pino 的 `redact` 遮蔽機密與個資
查詢: 用 jq 或程式算錯誤率、p95、單一請求的完整時間線
Loki: 只替 label 建索引，label 要低基數；request_id、user_id 放在內容裡用 LogQL 過濾
錯誤追蹤: 例外依指紋分組成 issue，對新問題與回歸告警；前端要上傳 source map
```
log 也是資料：少記個資、控管存取、設定保留期限，機密進了 log 就當外洩處理。

## C 指標的種類
| 類型 | 行為 |
|---|---|
| counter | 只增不減，用 `rate()` 看 |
| gauge | 當下值 |
| histogram | 累加的桶子估百分位數，能跨副本合併 |
| summary | no 不能合併 |

看延遲看 p95、p99，不看平均。`/metrics` 用 prom-client 暴露，名稱帶基本單位，label 只用值有限的維度（路由樣板，不放 ID）。Prometheus 定期 scrape；常用的 PromQL 寫成 recording rule，用 promtool 測試。RED 看服務、USE 看資源：先確認使用者在痛，再找飽和的資源。

## D SLO 與錯誤預算
```kv cols=1
SLI: 好事件的比例
SLO: 目標
SLA: 合約
錯誤預算: 1 − SLO；99.9%／30 天 ＝ 43.2 分鐘
燃燒率: 錯誤率 ÷ (1 − SLO)
政策: ship、ship-with-caution 或 freeze
```
壓測用開放模型（k6 arrival-rate）避免協調遺漏，先暖機再逐步加壓，同時看 USE 找瓶頸；符合 SLO 的最大到達率 × 安全係數寫成 thresholds，當作上線門檻。

## E 分散式追蹤 {span=2}
```flow LR
[應用程式 SDK] -> BatchSpanProcessor -> [OTLP exporter :4318/v1/traces] -> Collector -> *[Jaeger 或 Tempo]
```
- trace 是一個請求在所有服務的完整路徑，由 span 組成；span 有 trace_id、span_id、父 span、名稱、kind、時間區間、屬性、事件與狀態。
- W3C traceparent：`00-trace-id-parent-id-flags`，小寫 hex，全 0 與版本 ff 無效，sampled 是最低位元，無效就開新的 trace；HTTP 標頭與佇列訊息都要傳。
- 函式庫只依賴 API，應用程式裝 SDK（TracerProvider 設 resource、sampler）。手動埋點：`startActiveSpan`、extract／inject、`recordException`、ERROR 狀態、`finally` 裡 end、SIGTERM 時 shutdown；AsyncLocalStorage 讓併發的請求各自有自己的 active span。
- 自動埋點在 ESM 需要 loader hook；取樣在成本與留下罕見錯誤之間取捨：head、parent-based、tail 各有位置。
- log 每一行帶 trace_id、span_id（pino 的 mixin），log、指標、trace 才能互相跳轉。

## F 備份與災難復原
- 從 RPO（最多丟多少資料）和 RTO（最多停多久）推出做法；不同的資料可以有不同的數字。
- pg_dump 適合小型資料庫與搬家；正式環境的主力是實體備份加 WAL 封存（PITR），或託管服務的自動備份。

```callout err 不是備份
replica、RAID 都不是備份。
```

```flow LR
[驗校驗和] -> [還原到全新的臨時環境] -> [比對列數] -> [煙霧測試] -> *[量出 RTO]
```
還原加 `--exit-on-error`，演練定期自動執行。備份腳本：pipefail、暫存檔加原子改名、驗證、manifest、校驗和、最後才更新 LATEST，輸出一行 JSON 給監控。3-2-1、權限分離、另一個帳號、版本控制與 Object Lock，讓備份撐得過誤刪和勒索軟體。保留政策用 UTC 計算日、週、月；排程用 systemd timer（`Persistent=true`）或平台的排程，用死人開關監控。災難復原涵蓋程式碼、映像、IaC、機密、資料、DNS 與 runbook，定期換人演練。

## G 什麼時候叫醒人 {span=2}
| 燃燒率 | 長視窗 | 短視窗 | 處理 |
|---|---|---|---|
| 14.4 | 1 小時 | 5 分鐘 | page |
| 6 | 6 小時 | 30 分鐘 | page |
| 1 | 3 天 | 6 小時 | ticket |

長、短視窗都超過門檻才響；短視窗讓告警恢復後很快解除。門檻是燃燒率 × (1 − SLO)。page 只給影響使用者、緊急、可行動、有 runbook 的狀況，對症狀告警。

- 告警規則用 promtool 測：平常不響、持續燃燒會響、尖峰不響、恢復後解除。
- Alertmanager 負責分組、抑制、靜音與路由；用 Watchdog 加死人開關確認監控本身還活著。
- 值班要有輪值表、交接、升級路徑、負荷上限與補償，每個 page 都要檢討必要性。

## H 事故處理
```flow LR
偵測 -> 宣告 -> 分級 -> *止血 -> 解決 -> [事後檢討]
```
IC 指揮不親自修，記錄員記時間線，固定頻率對外更新。先問最近改了什麼，先止血再找根因；止血要對症：程式問題回滾，旗標問題只關旗標。

```callout info 不究責的事後檢討
影響、UTC 時間線、怎麼發現的、促成因素、有負責人與期限的改善事項。
```
