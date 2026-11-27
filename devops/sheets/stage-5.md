---
title: 部署與維運 階段 5：雲端與基礎設施即程式碼
subtitle: 第 18～20 課一頁圖解：選雲端模型、VPC 與 AZ、ECS 與 RDS、成本、IAM 與 OIDC、OpenTofu
cols: 3
theme: shadcn
課程: 部署與維運 第 18～20 課
---
雲端每一層都跨至少兩個 AZ。權限用最小權限的角色和臨時憑證，基礎設施寫成可審查、可重現的程式碼。[回 部署與維運 學習地圖](../index.html)

## A 租到哪一層
| 模型 | 你還要管 | AWS 的例子 |
|---|---|---|
| IaaS | 作業系統、更新、執行環境、程式、擴展 | EC2、EBS、VPC |
| 容器平台 | 映像、設定、擴展規則 | ECS on Fargate、EKS |
| PaaS | 程式與設定 | App Runner、Elastic Beanstalk |
| serverless | 函式本身；遷就冷啟動、執行時間上限 | Lambda |

越往上管得越少、控制也越少。依團隊人數、流量型態、維運能力、預算與綁定的程度來選；咖啡店的主線是 ECS Fargate＋RDS＋S3。

## B 咖啡店的網路 {span=2}
```flow LR
(使用者) -> ALB
ALB -> *[app ECS Fargate]
app ECS Fargate -> [(RDS)]
app ECS Fargate -> [NAT gateway]: 主動連外
group 公有子網路: ALB, NAT gateway
group 私有子網路: app ECS Fargate, RDS
```
- region 是地理位置；AZ 是獨立供電與網路的資料中心，也是設計高可用時的故障單位。
- 公有、私有子網路的差別只在路由表有沒有 IGW。
- 安全群組有狀態、只寫允許，來源寫另一個安全群組；SSH 改用 SSM Session Manager。

## C 運算與資料
```kv cols=1
EC2: 虛擬機（AMI、instance type、EBS、user data），t 系列有 CPU credit
容器版: ECR → task definition → ECS service on Fargate
ALB 目標群組: 健康檢查、deregistration delay 300 秒、閒置逾時 60 秒
RDS: 自動備份與 PITR；Multi-AZ 切換約 60–120 秒且連線會斷；不開公開存取
S3: 預設封鎖公開、presigned URL 讓前端直接上傳、版本控制、生命週期
```

## D 責任共擔與帳單
```callout info 責任共擔
AWS 負責雲端本身，你負責放進去的東西。EC2 作業系統更新、映像裡的套件都歸你。
```
帳單拆成明細看：小流量時最貴的是按小時計費的固定費用（RDS Multi-AZ、NAT、ALB、公開 IPv4）；log 要設保存天數。

```callout warn 開帳號第一件事設 Budgets
實際 80%、實際 100%、預測 100%。
```

## E 帳號第一天與 policy 的樣子
- root 開 MFA、不建 access key、只做非 root 不可的事；人員用 IAM Identity Center；可以的話，一個環境一個帳號。
- policy 由 Effect、Action、Resource、Condition 組成，資源型政策再加 Principal。
- Action 不分大小寫，Resource 和 StringEquals 分大小寫。
- ListBucket 用 bucket ARN，物件動作用 `bucket/前綴/*`。

## F AWS 怎麼決定允許或拒絕
```flow TB
(請求) -> {有符合的 Deny?}
{有符合的 Deny?} -> [明確拒絕]: 有
{有符合的 Deny?} -> {有符合的 Allow?}: 沒有
{有符合的 Allow?} -> *允許: 有
{有符合的 Allow?} -> [隱含拒絕]: 沒有
```
同一帳號內身分型與資源型政策取聯集；SCP、permission boundary 只能收窄；KMS 還要看 key policy。

## G 用角色取代金鑰 {span=2}
```sequence
participants: deploy job, GitHub OIDC, AWS STS, ECR與ECS
deploy job -> GitHub OIDC: 要 token，需要 id-token write
GitHub OIDC --> deploy job: 簽好的 JWT，含 iss aud sub exp
deploy job -> AWS STS: AssumeRoleWithWebIdentity，帶 role ARN 與 JWT
AWS STS -> AWS STS: 驗簽章、信任政策檢查 aud 與 sub
AWS STS --> deploy job: 臨時憑證，預設 1 小時
deploy job -> ECR與ECS: 推映像、更新服務
```
`aud` 要是 `sts.amazonaws.com`，`sub` 要是指定的 repo 和 environment。EC2 用 instance profile（只接受 IMDSv2）、ECS 用 task role：STS 發的臨時憑證會自動換新、會過期。

| 危險寫法 | |
|---|---|
| `*`、`s3:*` | no |
| PassRole 給 `*` | no |
| Allow 搭配 NotAction | no |
| Principal `*` | no |
| 沒有 sub 的信任政策 | no |

用 Access Analyzer 和 `simulate-custom-policy` 驗證，把該允許與該拒絕的請求寫成測試。

## H 基礎設施即程式碼 {span=2}
```flow LR
init -> fmt -> validate -> plan -> *apply
```
| plan 符號 | 意思 |
|---|---|
| `+` | ok 建立 |
| `~` | ok 原地更新 |
| `-/+` | warn 重建：停機、可能遺失資料 |
| `-` | no 刪除 |

- 宣告式寫最後的樣子，工具算步驟；冪等代表第二次 plan 沒有變更。`-detailed-exitcode` 的 2 代表有變更。
- HCL 骨架：`terraform`（required_providers 鎖版本）、`provider`、`variable`（sensitive、validation）、`locals`、`resource`、`output`；引用決定相依圖與建立順序。
- 漂移由 plan 發現：改動錯了就 apply 還原，對了就寫回程式碼；既有資源用 import 納管。
- module 是可重用的一組資源；每個環境各自的 state 與變數。Terraform（BSL 1.1）與 OpenTofu（MPL-2.0）語法大多相容，各自有獨有功能。

```callout err state 含機密明文
不進 git、放遠端 backend、一定要鎖；OpenTofu 可以把 state 與 plan 加密並 enforced。
```
