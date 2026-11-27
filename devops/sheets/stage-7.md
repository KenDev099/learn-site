---
title: 部署與維運 階段 7：期末專題
subtitle: 第 26 課一頁圖解：需求換成數字、ADR、類正式環境、藍綠部署與回滾、壓測驗收、runbook 與上線準備度檢查
cols: 3
theme: shadcn
課程: 部署與維運 第 26 課
---
先把需求換成數字，每個數字對應一個檢查；依需求選最簡單的做法，部署失敗時什麼都沒壞，出事先回滾止血。[回 部署與維運 學習地圖](../index.html)

## A 從需求到數字 {span=2}
| 需求 | 換成的數字或做法 |
|---|---|
| 推播之後不能掛 | 尖峰到達率：現在每秒 12 個 × 3 ＝ 每秒 36 個，p95 < 300ms、錯誤率 < 0.1% |
| 不能停機部署 | 藍綠部署、排空、部署前跑向後相容的 migration |
| 遺失不超過 15 分鐘 | RPO 15 分鐘：每 15 分鐘備份一次 |
| 5 分鐘內有人知道 | SLO 99.9% 的燃燒率告警（14.4 倍那條，短視窗 5 分鐘） |
| 1 小時內恢復 | RTO 1 小時：還原演練量到的時間要遠小於它 |
| 照著文件就能做 | runbook 每一段都有能直接執行的指令，而且指令引用的檔案都存在 |

上面是這課 `NEEDS.md` 的示範需求。資料庫連線預算也要算。示範環境藍綠兩組各 2 個副本，4 × 8 ＝ 32 條；加上 migrate、備份、自己連進去查問題的，都要在 PostgreSQL 預設的 `max_connections` 100 以內。

## B 用 ADR 記錄決策
```kv cols=1
背景: 當時的需求、限制、團隊狀況
決策: 選了什麼，具體到看得出怎麼做
後果: 好處，以及缺點與代價
重新評估: 什麼時候要換，例如「服務超過三個時評估 Kubernetes」
```
這個專題值得記錄的決策：單機 Compose 還是 ECS／Kubernetes、藍綠還是滾動更新、pg_dump 還是 PITR、購物車放 Redis 還是放記憶體。

```callout warn 不要每一項都做到最複雜
依需求選最簡單、能滿足 SLO 與 RPO 的做法，在 ADR 裡寫清楚什麼時候要升級。
```

## C 類正式環境的架構 {span=2}
```flow LR
(使用者) -> *nginx: 443
nginx -> [api-blue × 2]: 接流量
nginx --> [api-green × 2]: 待命
[api-blue × 2] -> [(db)] & [(redis 購物車)]
[migrate 一次性] -> [(db)]
[(db)] --> [備份 timer 每 15 分鐘送異地]
```
- 映像要可重現、可追溯：多階段、非 root、只有執行需要的東西、revision label、HEALTHCHECK。
- nginx：TLS 與 301、HSTS 只在 HTTPS、限流 429、上傳上限、`/metrics` 不對外。
- 最小權限的資料庫帳號（api 用 `cafe_app`、migrate 用 `cafe_migrator`）、密碼用檔案、db 和 redis 不發布 port。
- 資源限制、log 輪替；排空時間比 resolver 的快取長，`stop_grace_period` 比排空長。

## D 部署：失敗時什麼都沒壞
```flow TB
[用新映像跑 migration，向後相容] -> [新顏色啟動] -> [ready 與煙霧測試] -> [nginx -t] -> *reload
```
任何一步失敗都以非 0 結束，流量留在原本的顏色。舊顏色留著不動：`rollback.sh` 先確認另一個顏色的副本都在跑而且 ready，再改回 `active.conf`、reload。

```callout warn healthy 不等於 ready
容器 healthy 只代表 `/health/live` 通過；api 暖機時 `/health/ready` 回 503，只看 healthy 就切流量，使用者會先吃到一串錯誤。
```

## E 出事先回滾還是先修
| 做法 | 什麼時候 |
|---|---|
| 回滾 | ok 先做：演練過、幾秒完成 |
| hotfix | warn 寫程式、跑 CI、建映像、再部署，每一步都可能出新的錯 |
| 例外：回滾本身有風險 | warn 例如新版已經寫入舊版讀不懂的資料，所以 migration 要向後相容 |

回滾止血之後，白天再修、再走一次正常的部署。

## F 壓測驗收與上線準備度
```kv cols=1
走使用者的路: 經過 nginx 與 TLS，不直接打 api
真實的請求組成: 示範是 8 成讀菜單、1 成加購物車、1 成下單
開放模型: constant-arrival-rate，不管系統多慢都照送
門檻: `p(95)<300`、`http_req_failed` 的 `rate<0.001`、`dropped_iterations` 的 `count==0`
```
筆電上的結果只證明腳本、門檻和設定寫對了；正式的門檻要在類正式的 staging 環境重量，並留安全係數。

runbook 寫給半夜被叫醒的人：什麼時候用、可直接複製的指令、成功時看到什麼。用自動檢查確認 runbook 提到的腳本與設定檔都存在，讓它跟腳本保持一致。上線準備度檢查的每一項都對應一個自動檢查或可以執行的指令。
