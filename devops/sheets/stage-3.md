---
title: 部署與維運 階段 3：流量與擴展
subtitle: 第 12～13 課一頁圖解：Nginx 反向代理、TLS 終結、保護後端、無狀態副本、負載平衡、排空、容量規劃
cols: 3
theme: shadcn
課程: 部署與維運 第 12～13 課
---
Nginx 是整套服務唯一的入口；要開好幾個副本，先把狀態搬出程序，停副本時先排空，副本數和連線池用算的。[回 部署與維運 學習地圖](../index.html)

## A 反向代理：唯一的對外入口 {span=2}
```flow LR
(客人) -> *nginx: 443 終結 TLS
nginx -> [api 副本]: proxy_pass，後端不發布 port
nginx --> [靜態檔]: 直接回
```
反向代理站在伺服器這邊替後端接請求，負責 TLS 終結、路由、靜態檔、壓縮、緩衝、逾時與限制。設定是 http → server → location；`nginx -T` 看合併後的完整設定。location 的優先順序：`=` → `^~` → 正規表示式（依順序）→ 最長前綴。

## B Proxy_pass 與轉送標頭
| 設定 | 請求 `/api/products`，後端收到 |
|---|---|
| `proxy_pass http://api:3000;` | `/api/products`：沒有路徑，原樣轉送 |
| `proxy_pass http://api:3000/;` | `/products`：比對到的 `/api/` 換成 `/` |
| `proxy_pass http://api:3000/v2/;` | `/v2/products` |

轉送 Host、X-Forwarded-For、X-Forwarded-Proto、X-Request-ID。X-Forwarded-For 客人可以自己帶，後端只信自己代理加上的那一段。1.29.7 起 `upstream` 區塊預設重用連線；閒置逾時前短後長，app 的 `keepAliveTimeout` 大於 nginx 或 ALB 的。

## C TLS 與保護後端
```kv cols=1
TLS: 在 443 終結，只開 TLS 1.2／1.3
80: 用 `$request_uri` 301 到 HTTPS
HSTS: 只在 HTTPS，並加 `always`
client_max_body_size: 只在需要的地方放寬
limit_req: 以 `$binary_remote_addr` 為 key，超過回 429
長連線: 調高 `proxy_read_timeout`
```

## D 快取標頭、重新載入與錯誤碼
| 檔案 | 快取標頭 |
|---|---|
| `index.html` | `no-cache` |
| 雜湊檔名 | 一年加 `immutable` |

子層有 `add_header` 就不繼承上層。先 `nginx -t` 再 reload；log 加上 `$request_id` 和 `$upstream_response_time`。

| 狀態碼 | 意思 |
|---|---|
| 502 | 連不上後端，或回應無效 |
| 504 | 後端太慢 |

## E 狀態藏在哪，搬去哪 {span=2}
| 狀態 | 搬去 |
|---|---|
| session、購物車 | Redis，設 TTL |
| 永久資料 | PostgreSQL |
| 上傳檔 | S3 |
| 排程 | 只留一個執行者 |

垂直擴展換大機器、有上限；水平擴展加副本，條件是程序無狀態（12-factor 第 VI 條）。Node 一個程序只用一核，特別依賴水平擴展。狀態也藏在限流、快取、長連線裡。

```callout warn 黏性 session
只是把狀態問題藏起來。
```

## F Nginx 負載平衡
- 演算法：round robin 或 least_conn。
- `max_fails`／`fail_timeout` 是被動健康檢查。
- `proxy_next_upstream` 預設不重送已經送出的 POST，不要加 `non_idempotent`。
- `resolve` 搭配 `resolver` 與 `zone` 跟上變動的 IP。

## G 收到 SIGTERM：排空再結束 {span=2}
```flow LR
(SIGTERM) -> [readiness 回 503] -> [排空，回應帶 Connection close] -> [server.close] -> [關 pg 與 Redis] -> *(exit 0)
```
全部要在 grace period 內完成，超過就被 SIGKILL（137）。

| | liveness | readiness |
|---|---|---|
| 問的是 | 要不要重啟這個程序 | 現在要不要送新請求給它 |
| 檢查 | 只看程序自己 | 資料庫、Redis 連得上；不在排空中 |

```callout err liveness 不檢查資料庫
資料庫維護時所有副本同時失敗、被一起重啟，資料庫回來時又同時湧入重新連線的請求。
```

## H 容量規劃與 Kubernetes
```kv cols=1
副本數: 無條件進位(尖峰 ÷ (單副本能力 × 目標使用率)) ＋ 備用
連線池: 用 Little's law 估：每秒到達數 × 平均占用秒數
連線預算: (副本數 ＋ maxSurge) × 連線池，不能超過資料庫可用的連線
```
這課的示範數字：尖峰 600 RPS、單副本 180 RPS、目標使用率 70%，副本數 ceil(4.76) ＋ 1 ＝ 6。用尖峰算，不用平均，也不四捨五入。

Kubernetes 的 Deployment、Service、probe、HPA 自動化的是同一套事情；服務和團隊夠多時才值得它的維運成本。
