---
title: AWS 階段 3：運算
subtitle: 第 5～6 課一頁圖解：ECR、ECS Fargate、兩種 role、Lambda、API Gateway
cols: 3
theme: shadcn
課程: AWS 第 5～6 課
---
容器用 ECS Fargate 常駐，事件與低流量的短工作用 Lambda。兩邊都要分清楚「誰在呼叫 AWS」，也都要把同時跑幾份、等多久算進下游撐得住的範圍。[回 AWS 學習地圖](../index.html)

## A 從 CI 到 ECS service {span=2}
```flow LR
[CI 推映像] -> [ECR repository]: tag 不可變、push 時掃描
[ECR repository] -> [task definition 新 revision]: image 寫 repository@sha256 digest
[task definition 新 revision] -> [service]: UpdateService 換版
[service] -> [task × desiredCount]: 私有子網路、awsvpc、各自一個 ENI
[service] -> [ALB target group]: 自動註冊、健康檢查
```
task definition 每次修改都是新 revision，回滾就是 service 改回上一個 revision。Fargate 的 cpu 與 memory 只能用官方表裡的組合，networkMode 一定是 awsvpc。

## B 兩個 role：誰在呼叫 AWS
| | 誰用 | 做什麼 | 出錯的樣子 |
|---|---|---|---|
| ECS execution role | ECS 代理程式，容器啟動前 | 拉 ECR 映像、寫 log、讀 secrets | task STOPPED：CannotPullContainerError、ResourceInitializationError |
| ECS task role | 你的程式，執行時 | 呼叫 S3、SQS 等 | 程式的 log 出現 AccessDenied |
| Lambda execution role | 你的函式，執行時 | 函式能呼叫什麼 | 對應 ECS 的 task role |
| Lambda resource-based policy | 呼叫函式的服務 | 誰能呼叫函式 | AddPermission 要帶 SourceArn |

```callout warn 兩個欄位不要填同一個 role
能動，但應用程式也拿到讀所有 secret 的權限。密碼放 secrets，不放明文的 environment。
```

## C task STOPPED 先看什麼 {span=2}
```flow TB
(stoppedReason) -> {OOM 或 exit 137?}
{OOM 或 exit 137?} -> [記憶體不夠]: 是
{OOM 或 exit 137?} -> {啟動前失敗?}: 否
{啟動前失敗?} -> [AccessDenied：execution role]: 是
{啟動前失敗?} -> [逾時：網路]: 是
{啟動前失敗?} -> [看 CloudWatch Logs 最後幾行]: 否，容器自己結束
[看 CloudWatch Logs 最後幾行] -> [AccessDenied：task role]
```
啟動前逾時多半是拉不到映像：
| task 所在 | 需要 |
|---|---|
| 公有子網路 | ok assignPublicIp ENABLED |
| 公有子網路、沒給公開 IP | no 連不出去，最常見的拉不到映像 |
| 私有子網路＋NAT gateway | ok 不需要公開 IP |
| 私有子網路、沒有 NAT | warn ecr.api、ecr.dkr、S3 gateway endpoint；awslogs 加 logs，secrets 加 secretsmanager |

## D 滾動部署與自動回滾
| 設定 | 過程 | 代價 |
|---|---|---|
| 100／200 | ok 先開新再關舊，容量不降 | 部署期間多付 task 費用 |
| 50／100 | warn 先關一半舊的再開新的 | 部署中只剩一半容量 |

minimumHealthyPercent 無條件進位、maximumPercent 無條件捨去。circuit breaker 開啟並 rollback：新版一直起不來就退回最近一次 COMPLETED 的部署；沒開的話部署永遠卡著。

## E Lambda 執行環境的一生 {span=2}
```sequence
請求 1 -> Lambda: 沒有閒置環境
Lambda -> 執行環境: Init：跑模組最外層（import、new S3Client）
執行環境 --> 請求 1: 冷啟動：Init＋Invoke
note 執行環境: 回傳後凍結
請求 2 -> Lambda: 有閒置環境
Lambda -> 執行環境: 只呼叫 handler
執行環境 --> 請求 2: 熱啟動：重用 client 與連線
```
一個環境同時只處理一個請求。SDK client 放最外層；請求的資料放 handler 裡；所有工作在 return 前 await 完。provisioned concurrency 預先暖好環境（另外收費）；SnapStart 不支援 Node.js 執行環境。

## F 並行與節流
並行數約等於每秒請求數乘以執行秒數。帳號每個 region 預設 1,000，所有函式共用；reserved concurrency 是保留也是上限，設 0 等於停用。

| 呼叫方式 | 超過上限 | 要做的事 |
|---|---|---|
| 同步（API Gateway） | 回 429 | 呼叫端決定是否重試 |
| 非同步（S3、EventBridge） | 放回佇列重試 | handler 要冪等；失敗的收進 destination 或 DLQ |
| SQS 觸發 | 整批丟例外就整批重送 | 回傳 batchItemFailures |

每個環境各自一個連線池：用 reserved concurrency 設上限、用 RDS Proxy 共用連線。

## G HTTP API 到 Lambda {span=2}
```flow LR
[手機 App] -> [HTTP API route]: Authorization 標頭
[HTTP API route] -> [JWT authorizer]: 驗簽章、iss、aud、exp
[JWT authorizer] -> [Lambda]: payload 2.0，claims 在 requestContext
[Lambda] -> [(資料庫)]: 經過 RDS Proxy
```
| 設定 | 規則 |
|---|---|
| body | 一定是字串；isBase64Encoded 時先解 base64 |
| 使用者身分 | 只從 authorizer 驗過的 claims 拿 |
| authorizer | 掛在每個 route 上，新 route 要記得掛 |
| CORS | 帶 Authorization 時 origin 要寫明，不能用 * |
| 逾時 | HTTP API 最多等 30 秒，函式 Timeout 要比它短，否則客人先拿到 504 |

## H Lambda 還是 Fargate
| 工作 | 選 |
|---|---|
| 事件觸發的短工作、低流量 API | ok Lambda：沒請求不收費 |
| 穩定流量、長連線、保持記憶體狀態 | ok Fargate：常駐，沒有冷啟動 |
| 超過 15 分鐘的工作 | no Lambda 的 Timeout 上限是 15 分鐘 |
| 完整的 NestJS 應用程式 | warn 多半 Fargate：Nest 的啟動時間會變成冷啟動 |
