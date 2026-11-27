---
title: AWS 階段 1：帳號與身分
subtitle: 第 1～2 課一頁圖解：請求的組成、憑證鏈、SSO profile、CloudTrail、跨帳號評估、提權路徑
cols: 3
theme: shadcn
課程: AWS 第 1～2 課
---
每個 AWS 請求都作用在憑證所屬的帳號；動手前先確認自己是誰、在哪裡，權限只開需要的，出事時查得到。[回 AWS 學習地圖](../index.html)

## A 一個請求由什麼決定
```kv cols=1
服務與動作: 例如 S3 的 `CreateBucket`；主控台、CLI、SDK 都在呼叫同一組 API
region: 決定 endpoint；`--region` → `AWS_REGION` → 設定檔
憑證: 決定帳號與身分；請求本身不寫「要對哪個環境做」
簽章: SigV4，用 secret key 算出，secret 本身不送出
```
動手前先 `aws sts get-caller-identity`，腳本開頭比對帳號 ID，不符就停。

## B SDK v3 的憑證鏈 {span=2}
```flow LR
[環境變數金鑰] -> [profile]: 指定了 profile 就跳過這一步
[profile] -> [web identity]
[web identity] -> [container]
[container] -> [instance metadata]
```
`AWS_PROFILE=prod` 加上環境變數的測試帳號金鑰，SDK 用的是 prod。一個環境只放一種憑證來源；正式環境的程式用 role 的臨時憑證，不放金鑰。

## C 位置與名稱
| 東西 | 重點 |
|---|---|
| region | 一群機房，資源各自屬於某個 region；找不到資源先查 region |
| AZ | region 裡的故障單位，高可用至少兩個；跨帳號對齊看 AZ ID（例 `apne1-az4`），名稱可能不同 |
| 全球服務 | IAM、Route 53、CloudFront |
| ARN | `arn:partition:service:region:account-id:resource`，resource 是第 5 個冒號之後的全部 |

## D 責任與帳單
| 東西 | 誰負責或怎麼算 |
|---|---|
| 機房、硬體、虛擬化 | ok AWS |
| 權限、網路規則、資料、程式與套件 | warn 永遠是你 |
| 按時間計費 | warn 存在就收費：EC2、RDS、NAT、ALB、公開 IPv4 |
| Budgets | no 只通知，不會停掉任何資源 |

## E 開發者電腦上的憑證
```kv cols=1
`[profile X]`: config 檔的 profile；credentials 檔裡同一個 profile 寫 `[X]`
`[sso-session S]`: 入口網址與 `sso_region`，可給多個 profile 共用
`aws sso login`: token 快取在 `~/.aws/sso/cache`，換到的是會過期的臨時憑證
`aws login`: CLI 2.32.0 起，用主控台身分登入，最長 12 小時
```
要找的風險：`aws_access_key_id`、`[default]` 指向正式帳號、`sso_session` 指到不存在的區段、兩個 profile 同一個身分。

## F CloudTrail 查得到什麼
| 來源 | 內容 | 保留 |
|---|---|---|
| Event history | ok 管理事件（建立、刪除、改設定），免費，一次一個 region | 90 天 |
| trail／event data store | warn 要自己建；資料事件（S3 物件讀寫）要另外開、計費 | 自己決定 |

事故調查：先停用金鑰，再用金鑰 ID 與身分 ARN 查出它做過的所有事。IAM 的事件大多記在 `us-east-1`。

## G 權限評估 {span=2}
```flow LR
[有符合的 Deny？] -> [RCP／SCP 允許？]: 沒有
[RCP／SCP 允許？] -> [資源型政策]
[資源型政策] -> [身分型政策]
[身分型政策] -> [permission boundary]
[permission boundary] -> [session policy]
```
同帳號：身分型與資源型政策取聯集。跨帳號：兩個帳號各評估一次，請求方的身分型政策與資源所在帳號的資源型政策都要允許。SCP、boundary、session policy 只能收窄，本身不給權限。

## H 把權限交出去
```callout warn 跨帳號給 role，不給 IAM user
role＝信任政策（誰能 assume）＋權限政策（能做什麼）。信任政策列對方的帳號或 role，不寫 `*`；對方是多客戶的服務時要求 `sts:ExternalId`，防 confused deputy。session 1～12 小時，role chaining 最長 1 小時。
```
| 提權路徑 | 怎麼變成管理員 |
|---|---|
| `iam:PassRole` 涵蓋高權限 role＋建 EC2 或 Lambda | 讓機器或函式以那個 role 執行 |
| `iam:CreatePolicyVersion` | 改寫自己身上的政策 |
| `iam:AttachUserPolicy` 涵蓋自己 | 替自己掛 AdministratorAccess |

`iam:*`、`*`、Allow 搭 `NotAction` 都包含它們。讓開發者自建 role 時，用 `iam:PermissionsBoundary` 條件強制掛 boundary。模擬器不檢查權限：允不允許要看政策本身。
