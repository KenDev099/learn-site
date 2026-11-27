---
title: AWS 階段 5：事件與上線
subtitle: 第 10～11 課一頁圖解：SQS、SNS、EventBridge、S3 事件，把作品部署上 AWS
cols: 3
theme: shadcn
課程: AWS 第 10～11 課
---
訊息會重複、會失敗、會靜默地沒送到，消費者要冪等、失敗要有地方接住。上線是把每一層對照需求選好，用可以重跑的部署建出來，再用告警與帳單盯著。[回 AWS 學習地圖](../index.html)

## A 三個服務怎麼選
| 服務 | 模型 | 一則訊息給幾個人 |
|---|---|---|
| SQS | 佇列，消費者自己拉，處理完刪 | 一個 |
| SNS | 發布／訂閱，推給每個訂閱者 | 每個訂閱者一份 |
| EventBridge | 事件匯流排，rule 依 event pattern 路由 | 每個符合的目標一份 |

常見組合：SNS 或 EventBridge 分送，每個消費者前面各放一個 SQS。多步驟要補償用 Step Functions，排程用 EventBridge Scheduler。

## B 一則 SQS 訊息的一生 {span=2}
```flow LR
[ReceiveMessage（long polling）] -> [看不到：visibility timeout]
[看不到：visibility timeout] -> [處理成功：DeleteMessage]
[看不到：visibility timeout] -> [沒刪：時間到重新出現]
[沒刪：時間到重新出現] -> [超過 maxReceiveCount：進 DLQ]
```
visibility timeout 預設 30 秒，要比處理時間長，處理中可以延長；Lambda 讀 SQS 時至少是函式 timeout 的 6 倍。DLQ 要告警。

## C 冪等的消費者
```sequence
Worker -> DynamoDB: GetItem receipt#訂單ID（ConsistentRead）
DynamoDB --> Worker: 有完成標記就刪訊息
Worker -> 郵件服務: 處理，失敗就不刪
Worker -> DynamoDB: PutItem，attribute_not_exists(pk)
Worker -> SQS: 成功才 DeleteMessage
```
冪等鍵用業務 ID，不用 MessageId。FIFO 只保證佇列不多出重複，處理仍要冪等。

## D SNS fan-out 的三個設定
- queue policy：允許 `sns.amazonaws.com` 的 `sqs:SendMessage`，條件 `aws:SourceArn` 限定這個 topic。
- `RawMessageDelivery: true`：拿到原本的訊息，不是 SNS 的信封。
- filter policy 預設比 message attributes；比 body 要 `FilterPolicyScope: MessageBody`。寫錯不會報錯，只會什麼都收不到。

## E EventBridge pattern 的規則
| 寫法 | 意思 |
|---|---|
| 不同欄位 | AND |
| 同一欄位的陣列 | OR |
| 事件的值是陣列 | 任一元素符合即可 |
| `prefix` | 只比對字串 |
| `numeric` | 只比對數字，"190" 不符合 |
| `exists: false` | 欄位不存在 |

寫錯不會報錯，用 test-event-pattern 拿真的事件測。

## F S3 事件經過 SQS 到 Lambda
```callout warn 三件事
key 是 URL 編碼：先把 `+` 換成空白再 decodeURIComponent。設定時先送一則 s3:TestEvent，略過它。至少一次、不保證順序：冪等鍵用 bucket＋key＋versionId。
```
一則失敗只回報它：`batchItemFailures`，event source mapping 開 ReportBatchItemFailures。

## G 作品上 AWS {span=2}
```flow LR
[使用者] -> [ALB：443＋ACM，80 轉址]
[ALB：443＋ACM，80 轉址] -> [ECS Fargate api ×2]: 健康檢查 /health/ready
[ECS Fargate api ×2] -> [(RDS PostgreSQL Multi-AZ)]: pf_app
[ECS Fargate api ×2] -> [(ElastiCache noeviction)]
[ECS Fargate api ×2] -> [S3 SSE-KMS]: task role
[migrate task] -> [(RDS PostgreSQL Multi-AZ)]: 擁有者，部署前 run-task
```
execution role：拉映像、寫 log、讀 secret。task role：S3 與 KMS 金鑰。部署程式每一步先查再建，已存在的 secret 不覆寫。順序：推兩個 SHA 映像 → run-task migration 確認 exit code → 更新 service → 等穩定 → 冒煙測試。

## H 上線第一晚與之後
| 症狀 | 原因 |
|---|---|
| task 停在啟動，unable to pull secrets | no GetSecretValue 給在 task role |
| target unhealthy，被 circuit breaker 回滾 | no 健康檢查路徑多了 /api/v1 |
| 沒有錯誤，但 api 拿到 DATABASE_URL | no 擁有者繞過 RLS |
| 檔案 AccessDenied | no task role 少了 kms:Decrypt、kms:GenerateDataKey |

模擬器不檢查權限，部署前檢查 policy 與 task definition 本身。

- 5xx（Sum，沒資料不算異常）、UnHealthyHostCount（Minimum）、FreeStorageSpace；ALB 維度用 ARN 的最後一段 `app/…`、`targetgroup/…`。
- 小流量時帳單主要是開著就算錢的：NAT、ALB、RDS、ElastiCache、公開 IPv4。
- 成本分攤標籤要在 Billing 啟用才會出現在 Cost Explorer。
