# 事故紀錄：v3 上線（k8s-16-incident）

## 事故 A：cafe-api 部署後一直沒有 Ready

### 時間軸

- 14:00 v3 的 chart 部署完成，新的 cafe-api Pod 是 Running 但 READY 0/1
- 14:06 告警：cafe-api 可用副本低於 2
- 14:09 kubectl describe pod 的事件是 Readiness probe failed: HTTP 503；log 顯示連 Redis 逾時
- 14:12 從 api Pod 對 redis 的 6379 測連線逾時，對 postgres 正常；kubectl get networkpolicy cafe-api -o yaml 發現 egress 開的是 6380
- 14:20 改 chart 的 NetworkPolicy 為 6379，重新部署，Pod Ready

### 影響

新版 api 從未收到流量；正式環境上 helm --rollback-on-failure 會擋下這次部署，舊版持續服務，沒有請求失敗，但 v3 晚了 20 分鐘上線。

### 根因

netpol-redis-port：v3 把 api 的 NetworkPolicy egress 規則寫成 Redis 6380，實際的 Service 是 6379。預設拒絕之下連線被丟棄，/health/ready 檢查 Redis 失敗回 503，readiness 一直沒過。

### 修正

在 ex4/chart/templates/networkpolicy.yaml 把 port 改回 6379，保留預設拒絕；從零部署驗證。沒有刪掉 NetworkPolicy。

### 預防

- CI 加一個測試：helm template 之後檢查每個依賴（postgres 5432、redis 6379）都被對應的 egress 規則放行
- 部署後的煙霧測試打 /health/ready，失敗就讓部署失敗並回滾

## 事故 B：cafe-worker 一直重啟

### 時間軸

- 14:00 v3 部署完成，cafe-worker 進入 CrashLoopBackOff
- 14:15 處理完事故 A 後注意到 worker 的 RESTARTS 一直增加
- 14:17 kubectl describe pod 的 Last State：Terminated，Reason OOMKilled，Exit Code 137
- 14:19 對照 values：limits.memory 被改成 32Mi
- 14:25 改回 128Mi 並重新部署，worker 穩定、收據恢復寄送

### 影響

25 分鐘內付款後的收據沒有寄出，佇列 receipts:pending 累積；worker 恢復後依序寄出，沒有遺失。

### 根因

worker-oom-limit：v3 把 worker 的 limits.memory 從 128Mi 改成 32Mi（照 redis 的設定複製）。worker 閒置時只用 10Mi 左右，所以 Pod 一開始是 Running；一拿到 job 產生收據就用到約 60Mi，超過 cgroup 上限被核心殺掉（OOMKilled），重啟後拿下一個 job 又被殺。

### 修正

ex4/chart/values.yaml 的 worker requests.memory 64Mi、limits.memory 128Mi。

### 預防

- worker 的 limits 依「處理 job 時」的量測值設定（閒置時量的不算），改動時在 PR 附上 kubectl top pod 的數字
- 告警：佇列長度持續上升超過 5 分鐘、容器 OOMKilled 次數 > 0

## 事故 C：尖峰時 cafe-api 沒有擴展

### 時間軸

- 12:10 午餐尖峰，cafe-api CPU 超過 90%，Pod 數仍是 2
- 12:20 p95 延遲升高的告警
- 14:30 kubectl describe hpa cafe-api：AbleToScale False，FailedGetScale，找不到 deployments/cafe-web
- 14:35 HPA 的 scaleTargetRef 改回 cafe-api 並部署，AbleToScale True

### 影響

尖峰時段 p95 延遲升高到約 1 秒；HPA 從部署後就沒有作用，只是平常流量看不出來。

### 根因

hpa-wrong-target：v3 從另一個服務的 chart 複製 hpa.yaml，scaleTargetRef 還是 cafe-web。這個 namespace 沒有這個 Deployment，HPA 拿不到 scale，永遠不會擴展。

### 修正

ex4/chart/templates/hpa.yaml 的 scaleTargetRef 用 {{ include "cafe.fullname" . }}-api，不寫死名稱。

### 預防

- 部署後的檢查加上 kubectl get hpa 的 AbleToScale 與 ScalingActive 都要是 True
- 上線前做一次加壓測試，確認 HPA 真的會擴
