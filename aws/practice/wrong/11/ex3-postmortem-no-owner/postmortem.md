# 事後檢討：my-saas 第一次部署上 AWS

## 影響

2026-11-20 21:05～23:40（UTC+8），my-saas 的正式環境第一次上線，約 2 小時 35 分鐘無法使用：前 50 分鐘 API 完全起不來，之後檔案下載全部失敗。期間只有內部測試帳號，沒有客戶資料外洩；但 api 的容器曾經拿到資料庫擁有者的連線字串，等於 RLS 那道防線在這段時間可以被繞過。

## 時間線

- 21:05 執行部署，ECS service 開始啟動 task
- 21:09 task 一直停在啟動階段，事件寫 ResourceInitializationError：unable to pull secrets
- 21:20 發現 secretsmanager:GetSecretValue 給在 task role，移到 execution role 後重新部署
- 21:31 task 起來了，但 target group 顯示 unhealthy，circuit breaker 把部署回滾
- 21:48 發現健康檢查路徑寫成 /api/v1/health/ready（回 404），改成 /health/ready
- 21:55 task 健康，ALB 開始接流量
- 22:30 code review 時發現 api 的 task definition 注入了 DATABASE_URL（擁有者），立刻移除並重新部署
- 23:10 測試帳號回報上傳的檔案下載失敗，log 是 S3 的 AccessDenied
- 23:35 task role 補上 kms:Decrypt 與 kms:GenerateDataKey，重新部署
- 23:40 冒煙測試全部通過，宣告恢復

## 根本原因

1. 讀 secret 的權限給錯 role：ECS 注入 secrets 是在容器啟動前由 execution role 讀取，task role 是程式自己用的。模擬器不檢查權限，所以本機部署成功。
2. 健康檢查路徑錯誤：API 的路徑都有 /api/v1，但健康檢查的 controller 沒有前綴，target group 打到 404，所有 task 都被判定不健康。
3. api 拿到擁有者的連線字串：為了「方便在容器裡手動跑 migration」把 DATABASE_URL 也注入 api。擁有者不受 RLS 限制，違反了「只有 migration 拿得到擁有者」的權限分離。
4. bucket 用 SSE-KMS，但 task role 只有 S3 的權限，少了這把金鑰的 kms:Decrypt（讀）與 kms:GenerateDataKey（寫）。模擬器同樣不檢查。

## 修正

- execution role 加上兩個 secret 的 GetSecretValue，task role 移除
- target group 的 HealthCheckPath 改成 /health/ready
- api 只注入 APP_DATABASE_URL 與 JWT_SECRET；migration 用獨立的 my-saas-prod-migrate task definition，用 aws ecs run-task 執行
- task role 加上對 bucket 金鑰的 kms:Decrypt、kms:GenerateDataKey

## 改善項目

- 在 CI 加上 deploy 設定的檢查（練習 3 的測試），policy 與 task definition 不符就失敗
- 部署前先在 staging 帳號跑一次完整部署與冒煙測試，staging 開啟真的 IAM 檢查
- 冒煙測試加上「上傳一個檔案再下載」
- 對 CloudTrail 裡 api 的 task role 出現 AccessDenied 設告警｜負責人：我｜期限：2026-12-11
