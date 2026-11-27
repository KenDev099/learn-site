# 事故紀錄：cafe-api 新版部署後 Pod 一直起不來（第 b 組）

## 時間軸

- 14:02 CI 部署新的 manifest，cafe-api 的新 Pod 停在 CreateContainerConfigError
- 14:09 值班人員收到「可用副本數低於 2」的告警
- 14:12 kubectl describe pod 的 Events 顯示 couldn't find key password in Secret k8s-14-b/cafe-db
- 14:15 kubectl describe secret cafe-db 確認 Secret 裡的 key 叫 db-password
- 14:18 kubectl rollout undo 回到上一版止血，舊 Pod 繼續服務
- 14:40 修正 manifest 的 secretKeyRef.key，走 CI 重新部署，新 Pod Ready

## 影響

新版本完全沒有上線；滾動更新卡住期間舊版仍在服務，但只剩 1 個可用副本，14:02～14:18 尖峰時段的 p95 延遲升高到約 800ms，沒有請求失敗。

## 偵測

靠「可用副本數低於 2」的告警，部署後 7 分鐘才發現；CI 的部署步驟沒有等 rollout 完成就回報成功。

## 根因

missing-secret-key：Deployment 的 secretKeyRef 參照 Secret cafe-db 的 key password，但 Secret 裡的 key 是 db-password。容器建立前 kubelet 就找不到這個 key，所以是 CreateContainerConfigError（症狀），不是應用程式的錯。

## 修正

止血：kubectl rollout undo deployment/cafe-api。修正：把 manifest 的 secretKeyRef.key 改成 db-password，經過 code review 後由 CI 正常部署。沒有在叢集上 kubectl edit。

## 行動項目

- CI 的部署步驟加上 kubectl rollout status --timeout，rollout 沒完成就判定失敗並自動回滾（負責：平台組）
- CI 加一個檢查：用 kubectl get secret 的 key 名稱比對 manifest 裡所有 secretKeyRef（或改用 policy 工具規則），對不上就擋下部署
- Secret 的 key 命名規則寫進團隊文件，改名時要同時搜尋所有參照
