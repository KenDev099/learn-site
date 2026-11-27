---
title: AWS 階段 4：資料與機密
subtitle: 第 7～9 課一頁圖解：S3 深入、RDS 與 Aurora、KMS 與 Secrets Manager
cols: 3
theme: shadcn
課程: AWS 第 7～9 課
---
資料預設私有、加密、可還原，權限一次只給一個身分一件事。機密只留一份正本，程式在執行時才拿。[回 AWS 學習地圖](../index.html)

## A 靜態網站的兩種做法
| 做法 | bucket | 結果 |
|---|---|---|
| S3 website endpoint | no 要關掉 Block Public Access、Principal `*` | 同一個 bucket 裡的其他資料夾也可能被公開 |
| CloudFront＋OAC | ok 保持私有、Block Public Access 全開 | bucket policy 只允許這個 distribution（條件比對 SourceArn） |

SPA 的 403／404 由 CloudFront 回 index.html；收據這類資料放另一個 bucket。

## B 誤刪了：版本控制與 delete marker
```flow LR
[aws s3 rm latte.jpg] -> [delete marker 疊在最上面]
[delete marker 疊在最上面] -> [資料版本還在底下]
[刪掉那個 delete marker] -> [上一個版本重新成為目前版本]
```
還原是刪 delete marker，不是重新上傳舊版本。

## C SSE-KMS 的物件要兩把鑰匙
```flow LR
[task role] -> [S3 GetObject]: s3:GetObject
[S3 GetObject] -> [KMS Decrypt]: S3 代你解開資料金鑰
[KMS Decrypt] --> [task role]: 也要 kms:Decrypt
```
寫入要 `kms:GenerateDataKey`。key policy 預設那句 `arn:aws:iam::<帳號>:root` 把授權交給 IAM；拿掉它，IAM 政策對這把金鑰全部失效。

## D Multi-AZ 還是 read replica {span=2}
| | Multi-AZ | read replica |
|---|---|---|
| 複寫 | 同步 | 非同步，有延遲 |
| 用途 | ok 一個 AZ 故障時自動切換，端點不變但連線會斷 | ok 分擔讀取 |
| 平常接讀取嗎 | no 備援不接流量 | 接 |
| 要注意 | 應用程式要能重連 | warn 剛寫入的資料馬上讀，走 primary（read-your-writes） |

## E 連線數與還原
```flow LR
[幾百個 Lambda] -> [RDS Proxy]: 各自開連線
[RDS Proxy] -> [(RDS)]: 少量共用的連線
```
```callout warn PITR 還原成新的執行個體
自動備份加交易紀錄，可以還原到保留期間內任一時間點。還原出來是一台新資料庫、新端點：要改連線設定，或從新的那台把資料搬回去。PITR 要演練。
```

## F 信封加密
```sequence
App -> KMS: GenerateDataKey（AES_256、encryption context）
KMS --> App: 明文資料金鑰＋CiphertextBlob
note App: 用明文金鑰做 AES-256-GCM，存 CiphertextBlob、IV、tag、密文，明文金鑰丟掉
App -> KMS: Decrypt（CiphertextBlob、同一組 context）
KMS --> App: 明文資料金鑰
```
KMS Encrypt 最多 4,096 bytes。context 不同回 InvalidCiphertextException；context 會出現在 CloudTrail，不能放機密。刪金鑰有 7～30 天等待期，先 DisableKey 觀察。

## G 輪替四步與 staging label {span=2}
| 步驟 | 做什麼 | 標籤 |
|---|---|---|
| createSecret | 產生新密碼存成新版本 | 新版本 AWSPENDING，AWSCURRENT 不動 |
| setSecret | 資料庫改成新密碼 | 不變 |
| testSecret | 用新密碼實際連一次 | 不變 |
| finishSecret | 切換 | 新版本 AWSCURRENT，舊版自動 AWSPREVIOUS |

每一步都要冪等（Lambda 會重試）。單一使用者輪替：舊密碼在 setSecret 那一刻失效，程式遇到 `28P01` 強制刷新快取、只重試一次。交替使用者：舊值多撐一個週期。

## H 機密放哪裡、怎麼進到程式
| 東西 | 放哪裡 | 程式怎麼拿 |
|---|---|---|
| 會輪替的密碼、token | ok Secrets Manager | ECS `secrets` 注入（execution role 讀，只在啟動時一次），或程式自己讀並快取（TTL、合併同時的請求、失敗不快取） |
| 設定、功能開關 | ok Parameter Store 標準層（不另收費，每個值 4 KB） | 依路徑讀 |
| 任何機密 | no task definition 的 environment、Lambda 環境變數 | 每個舊版本都留著明文 |
