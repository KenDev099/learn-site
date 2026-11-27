# AWS 課程詳細課綱（aws/）

課名：**AWS 雲端服務實戰**（選修；courses.js 第三欄：「接在部署與維運課的 AWS 之後：帳號與 IAM、VPC 除錯、負載平衡與網域、ECS Fargate、Lambda 與 API Gateway、事件與佇列、最後把作品部署上 AWS」）

狀態：v4（2026-11-19 精簡成 11 課，見下一節）。已完成：課綱、aws/lab.js、aws/index.html、practice/（compose.yaml、aws-config、env.sh、helpers/aws.ts、prepare.mjs、start／answer／wrong/01）、lessons/01-aws-big-picture.html；`node local-verify.mjs aws 01` 通過（2 題、7 個測試，約 75 秒，兩個同時跑也通過），`node ts-parity.mjs` 通過。課名、檔名以 `aws/lab.js` 的 STAGES 為準（這份課綱的標題是簡寫）。標「【已實測】」的是這台 Mac 上實際跑過的；標「【未驗證】」的要寫那一課的人自己先跑一次。

## 2026-11-19 精簡：20 課縮成 11 課，改成選修

**理由**：原本的 20 課跟既有的課重疊很多，對「轉職全端／後端工程師」的投入報酬中低。devops 第 18～19 課（VPC、EC2、RDS、S3、IAM、OIDC）和第 20 課（OpenTofu）已經是「部署需要的最小 AWS」，保留不動；這門課改成它們的延伸，只教部署上線後真的會遇到、devops 課沒展開的部分（跨帳號權限、連不到時怎麼查、對外入口、ECS 與 Lambda、資料與機密、事件），最後把作品部署上 AWS。另外，Moto 只有中繼資料、練不到真正行為的主題（VPC 的封包、ASG 擴展、EC2 開機、RDS 的資料庫行為）降低比重：連不連得到、會不會擴展這類行為用瀏覽器 TS 題推論，本機題只檢查設定寫對沒有。

上面「全課共用」的版本、模擬器選型、保護真 AWS 的三層、平行執行與 helper 都是實測過的資料，照舊適用。

舊課號對照（寫課的人看舊討論時用）：

| 舊 | 新 | 處理 |
|---|---|---|
| 1 | 1 | 不變（只改提到後續課號的地方） |
| 2＋3 | 2 | 合併：root、Identity Center、Budgets 回顧 devops 19；留 SSO profile、CloudTrail、跨帳號、boundary、提權路徑 |
| 4＋5 | 3 | 合併：VPC 回顧 devops 18；重點放在「為什麼連不到」；刪掉建整個 VPC 的本機題 |
| 6 | 4 | 不變 |
| 7、8 | — | 刪掉（EC2 回顧 devops 18；IMDSv2 與 instance profile 併進第 5 課一節；ASG 的擴展 Moto 練不到，kubernetes 課第 8 課有 HPA） |
| 9 | 5 | 加一節「EC2 還是 Fargate」 |
| 10＋15 | 6 | 合併 Lambda 與 API Gateway；刪掉 tokenBucket（system-design 課第 10 課教過限流） |
| 11 | 7 | 不變；S3 事件移到第 10 課 |
| 12 | 8 | 不變 |
| 13 | — | 刪掉（data-stores 課第 14 課）；第 10 課用 DynamoDB 條件寫入做冪等時回顧 |
| 14 | 9 | 不變 |
| 16＋17 的 S3 事件 | 10 | 加 S3 事件 → SQS 的本機題（Moto 已實測可用）；Step Functions、Scheduler 一段文字 |
| 18 | — | 刪掉（devops 課第 20 課）；期末用 OpenTofu 時回顧 |
| 19 | — | 刪掉；CloudWatch 告警、成本分攤標籤併進期末 |
| 20 | 11 | 改成「把作品部署上 AWS」 |

---

## 全課共用

### 讀者與定位

- 讀者：每天寫 Vue 3 的前端工程師，會 JS／TS，學後端與雲端；目標是能實作、能面試。
- 這門課是 devops 第 18～20 課的**延伸**。devops 第 18～19 課（VPC、EC2、RDS、S3、IAM、OIDC）與第 20 課（OpenTofu）是「部署需要的最小 AWS」，保留不動；這門課**不重教**那些內容，也不重教 data-stores 第 12 課（S3 presigned URL）、第 14 課（DynamoDB）、kubernetes 第 15 課（EKS）：用到時寫一兩句回顧＋連結。**練習題不能跟它們重複**，清單見「不重教、不能重複」與每一課的「不能重複」。

### 版本（全部以這台機器實際裝的為準，課文要寫出版本）

| 東西 | 版本 | 來源 |
|---|---|---|
| Node | 24.22.1（package.json engines `>=24.12.0`） | `node -v`【已實測】 |
| AWS SDK for JavaScript v3 | 全部 client 鎖 `3.1161.0`（與 data-stores 課一致）；credential-provider-node 3.972.97 | `practice/package.json`、lockfile【已實測】 |
| AWS CLI | v2 2.36.37 | `aws --version`【已實測】 |
| 模擬器 | Moto server `motoserver/moto:5.2.5`，digest `sha256:59a1965d845249b04def37a0e2565f9cc6c44543cb89b68e90f28f344b3b0d1a`（2026-10-27 發佈） | Docker Hub tags API【已實測】 |
| Docker | 29.6.2，Docker Desktop 只分到 8 GB | `docker version`【已實測】 |
| @types/node | 24.19.2 | package.json |

已安裝的 SDK 套件（不要再改 package.json，避免多人同時改 lockfile；真的缺套件時在回報裡提出，由一個人統一加）：client-acm、client-api-gateway、client-apigatewayv2、client-auto-scaling、client-cloudformation、client-cloudwatch、client-cloudwatch-logs、client-dynamodb、client-ec2、client-ecr、client-ecs、client-elastic-load-balancing-v2、client-eventbridge、client-iam、client-kms、client-lambda、client-organizations、client-rds、client-route-53、client-s3、client-secrets-manager、client-sfn、client-sns、client-sqs、client-ssm、client-sts、lib-dynamodb、s3-request-presigner。

### 模擬器選型（已決定：Moto server）

- **Moto server**（Apache-2.0，getmoto/moto）：一個映像涵蓋這門課幾乎所有服務的 API；不用帳號、不用 token、不連外。閒置記憶體實測約 45 MB；compose 設 `mem_limit: 1g` 與 `MOTO_EC2_LOAD_DEFAULT_AMIS=false`。第一次 `up` 含下載映像約 40 秒，之後幾秒。**實測**：載入預設 AMI 時，每建一個模擬帳號並呼叫 EC2 就多約 4 MB、而且不會釋放（第 1 課每跑一次 local-verify 多 40 MB）；關掉後跑三次 local-verify 都穩定在約 177 MB。AWS CLI 每次啟動約 1 秒，CLI 題的測試別呼叫太多次（第 1 課 local-verify 共 74 秒）。
- **LocalStack 不用**：2026-03-23 起 Docker Hub 上只剩一個需要帳號與 auth token 的映像（社群版停止），違反「不註冊任何服務」。
- **DynamoDB Local、Lambda RIE 不另外開**：DynamoDB 用 Moto 的實作就夠（data-stores 第 14 課提過 `amazon/dynamodb-local:3.3.2`，可在課文提一句）；Lambda 的 handler 直接在 Node 裡呼叫（見下）。
- **Garage 不用**：S3 也走 Moto，一個 endpoint 打天下；data-stores 課的 Garage 繼續只給那門課用。

### 練習環境怎麼啟動與重置

在 `learn/` 執行（課文、錯誤訊息一律這樣寫）：

```bash
npm --prefix aws/practice ci                                  # 第一次：安裝 SDK
docker compose -f aws/practice/compose.yaml up -d --wait      # 啟動模擬器（容器 learn-aws-moto，127.0.0.1:4580）
docker compose -f aws/practice/compose.yaml stop              # 不讀書時停掉
docker compose -f aws/practice/compose.yaml down              # 刪掉容器：模擬器裡的所有資料一起消失（重置）
```

- port 用 **4580**（5000、8000 已被佔用；Moto 容器內仍是 5000）。只綁 127.0.0.1。
- Moto 的資料只在記憶體：容器重啟就全部清空。這就是「重置」。**不要**呼叫 `POST /moto-api/reset`：它會清掉所有人的資料，平行執行時會讓別人的測試壞掉。
- 讀者想手動對模擬器下 CLI：開新的終端機視窗，`source aws/practice/env.sh`（清掉該視窗的 `AWS_*`，改成假金鑰＋模擬器＋`aws-config`；預設帳號 123456789012）。課文第 1 課已介紹，後面直接引用。
- 因為沒載入預設 AMI，之後若有題目要 RunInstances／launch template，先用 `RegisterImage` 建自己的 AMI 或確認 Moto 接受任意 `ami-` ID【未驗證】（精簡後沒有 EC2 的本機題）。
- `prepare.mjs` 每次跑測試前檢查模擬器活著（GET `http://localhost:4580/moto-api/`）；沒在跑時印出：「AWS 模擬器沒有在跑：在 learn 資料夾執行 docker compose -f aws/practice/compose.yaml up -d --wait」並以 1 結束。

### 絕對不碰真的 AWS（寫題的人必讀）

這台機器的 `~/.aws` 是正式環境的憑證。練習與 helper 的保護有三層：

1. `helpers/aws.ts` 被 import 時先**刪掉 process.env 裡所有 `AWS_` 開頭的變數**，再設定：假的金鑰（`AKIAFAKE…`／`fake`）、`AWS_ENDPOINT_URL=http://localhost:4580`、`AWS_REGION=ap-northeast-1`、`AWS_CONFIG_FILE=<practice>/aws-config`、`AWS_SHARED_CREDENTIALS_FILE=/dev/null`、`AWS_EC2_METADATA_DISABLED=true`。學習者自己 `new S3Client({})` 也只會連到模擬器、只會拿到假金鑰。
2. helper 建立的每個 client 都明確傳 `endpoint`，並在 middleware 檢查請求的 hostname 只能是 `localhost`／`127.0.0.1`，否則直接丟錯（「endpoint 沒設定」會變成測試失敗，不會送出去）。
3. 執行學習者的 shell 腳本（AWS CLI）時，`runCli` 從頭組環境（不繼承 process.env）：`HOME` 指到暫存資料夾（CLI 讀不到 `~/.aws`）、上面的變數、加上這一題帳號的臨時憑證。就算某處漏了 endpoint，假憑證也不可能在真的 AWS 通過驗證。

寫題的人：**不要**在測試、helper、課文範例裡用 `--profile`、`AWS_PROFILE` 指向真的 profile；不要在自己的終端機對真的 AWS 下任何指令（包含唯讀）來「確認行為」。課文「在真的 AWS 帳號上做一次」只寫給讀者自己做。

### 平行執行與命名

- **每個題目資料夾一個 Moto 帳號**：Moto 支援多帳號，`sts:AssumeRole` 到 `arn:aws:iam::<帳號>:role/…` 會拿到屬於那個帳號的憑證（role 不必存在）。helper 用題目資料夾的名稱（`work/01`、`verify/01-<pid>-<label>`）算 SHA-256，取出 12 位數字當帳號 ID（避開 Moto 預設的 123456789012）。不同資料夾的資源（含 S3 bucket 名稱）互相看不到，所以 4～6 個人同時跑 `local-verify.mjs` 不會互撞。【已實測：AssumeRole 到 210987654321 後 GetCallerIdentity 回傳該帳號】
- **例外：S3 bucket 名稱跨帳號共用**（Moto 跟真 AWS 一樣，別的帳號已用的名稱會回 `BucketAlreadyExists`）【已實測】。所以 bucket 名稱一定要帶帳號 ID：`cafe-<NN>-ex<M>-<用途>-<帳號>`。
- 資源名稱仍然帶課號與題號：`cafe-<NN>-ex<M>-…`（bucket 例：`cafe-01-ex2-menu-<帳號>`）。測試在 `after()` 刪掉自己建的東西；殘留的也只在那個 verify 帳號裡，不影響別人，容器重啟就清空。
- Moto 只有一個容器，全課共用，不要在測試裡建新的容器。

### 共用 helper：`practice/helpers/aws.ts`

題目資料夾兩層深，import `'../../helpers/aws.ts'`。提供（第 1 課已實作，後面的人照用、要加函式就加在這個檔，不另開 helper 檔）：

- `ENDPOINT`、`REGION`、`START_CMD`（訊息裡用的啟動指令）
- `requireMoto()`：before() 用，模擬器沒開就丟出說明怎麼修的錯誤
- `accountFor(dir)`：題目資料夾 → 12 位帳號
- `session(dir)`：AssumeRole 進該帳號，回傳 `{ account, credentials }`
- `client(Ctor, sess, extra?)`：建任何 SDK v3 client（S3 自動 `forcePathStyle: true`），附 localhost 檢查
- `runCli(dir, script, args, sess, opts)`：用隔離的環境跑學習者的 bash 腳本
- `spyAws()`：在 PATH 前面放一個會記錄參數再轉給真的 `aws` 的 `aws`，用來檢查腳本呼叫了哪些指令（例如「帳號不對時不能呼叫任何會改東西的指令」）
- `awsVerb(args)`、`isReadOnly(args)`：從 spy 記錄的參數取出「服務 子指令」、判斷是不是只讀（get-／list-／describe-／head-、s3 ls）
- `readJson`、`readText`：讀學習者的檔案，不存在時給清楚訊息
- 平行寫課時**不要改 helpers/aws.ts**（多人同時改會衝突）：自己那一課需要的輔助函式寫在測試檔裡或 `start/NN/` 的共用檔；確定好幾課都要再在回報裡提出，由一個人併進 helper。
- 本機題的寫法照第 1 課：測試檔 `exN.test.ts`、`node:test`＋`node:assert/strict`；學習者的函式從參數接收 client（測試用 `client(Ctor, sess)` 建好傳入），不要讓學習者自己 `new XxxClient()`；模擬器比 AWS 寬鬆的地方，用 `client.middlewareStack.add(…, { step: 'initialize' })` 記下送出的 input 再檢查（範例：第 1 課 ex4.test.ts 的 `s3For`）。

### 模擬器跟真 AWS 不同的地方（課文遇到時一定要明講）

| 項目 | Moto 的行為 | 真 AWS | 課文怎麼處理 |
|---|---|---|---|
| IAM 權限 | 預設**不檢查**：任何憑證都能做任何事 | 每個請求都經過 policy 評估 | 權限題用瀏覽器 TypeScript 判斷，或檢查 policy 文件本身；不能說「模擬器沒擋所以權限是對的」 |
| 憑證 | 任何假金鑰都收；AssumeRole 的 role 不必存在 | 金鑰要真的存在、信任政策要允許 | 第 1、2 課說明 |
| 一致性 | 寫完立刻讀得到（GSI、S3 list 都是） | DynamoDB GSI、部分讀取是最終一致 | 第 10 課用 DynamoDB 做冪等時明講；需要時用瀏覽器題模擬延遲 |
| Lambda | 這門課**不執行**模擬器裡的 Lambda（Moto 要掛 Docker socket 另起容器，太重）；只用它存函式設定、權限、event source mapping 的設定 | 真的在 Firecracker microVM 執行、有冷啟動 | handler 寫成 `export const handler = async (event, context) => …`，測試直接 import 並傳入事件呼叫 |
| 網路 | VPC、子網路、route table、安全群組只是**資料**，沒有真的封包 | 真的路由與過濾 | 第 3 課連不連得到用瀏覽器 TS 依規則推論，模擬器只用來檢查設定 |
| EC2／ECS／ASG | 只有中繼資料，不會開機、不會跑容器、ASG 不會依負載擴展 | 真的執行 | 練「設定寫對沒有」；行為用瀏覽器 TS 模擬 |
| RDS | 只有中繼資料，沒有真的 PostgreSQL | 真的資料庫 | 第 8 課的 SQL 連到 PostgreSQL 課；連線數、PITR 用 TS 題 |
| 計費、配額、節流 | 沒有計費、不限流 | 有 | 費用只在「真的 AWS」一節寫計費項目 |
| 時間 | 憑證的 Expiration 用容器時鐘算，不會真的過期失效 | 會過期 | 不要出依賴過期的本機題 |
| S3 CreateBucket | 在 ap-northeast-1 **不帶** `CreateBucketConfiguration.LocationConstraint` 也會成功【已實測】 | us-east-1 以外的 region 必須帶，否則 `IllegalLocationConstraintException` | 測試用 middleware 攔下學習者送出的 CreateBucket 輸入檢查；課文明講模擬器較寬鬆 |
| Lambda CreateFunction | 會檢查 `Role` 指的 IAM role 存在（不存在回 `InvalidParameterValueException`）【已實測】 | 還會檢查信任政策允許 lambda.amazonaws.com | 測試先用 IAM 建 role |
| 自己 `new XxxClient({})` | 連到模擬器，但用預設帳號 123456789012，不是題目的帳號【已實測】 | — | 學習者的函式一律從參數接收 client，不要自己建 |
| 已實測可用 | S3（含 bucket 通知 → SQS）、SQS（visibility timeout、redrive 到 DLQ）、SNS → SQS（RawMessageDelivery）、EventBridge rule → SQS（依 event pattern 過濾）、KMS GenerateDataKey／Decrypt、DynamoDB 條件寫入、EC2 DescribeAvailabilityZones（含 AZ ID，如 ap-northeast-1a＝apne1-az4）、DescribeRegions、CreateVpc | — | 其他服務寫課時先實測 |
| 錯誤訊息 | 錯誤碼大多一致，訊息文字可能不同 | — | 測試比對錯誤的 `name`（例 `NoSuchBucket`），不比對訊息文字 |

### 「在真的 AWS 帳號上做一次（選做）」格式（第 1 課定，後面照做）

放在每一課「練習」之前、最後一個概念 `<h2>` 之後：`<h2>在真的 AWS 帳號上做一次（選做）</h2>`。內容依序：

1. 一句話：不判分、不影響進度；用第 1 課建議的**獨立練習帳號**，不要用公司帳號。
   - 第 1 課例外：帳號只有 root，還沒有給 CLI 用的身分，所以只在主控台開 root MFA 與建 Budgets（只做監看與通知的預算不收費，官方定價頁 2026-11 查證）。第 2 課建立 Identity Center 使用者與 `learn-sandbox` SSO profile，第 2 課之後一律用 CLI。
2. `<div class="callout warn"><strong>費用：</strong>…</div>`：會不會產生費用；有的話列出**計費項目**（例：NAT gateway 每小時＋每 GB 處理量、公開 IPv4 每小時），**不寫沒查證的金額**，附官方定價頁連結。免費方案的說法也要查官方頁面，並寫出查證日期。
3. `<pre>` 一步一個指令（AWS CLI v2 2.36.37），每一步上面一行 `#` 註解說這步做什麼、看哪裡。所有指令帶 `--profile learn-sandbox`（第 1 課建立的練習 profile 名稱，全課統一），不用 `--region` 以外的隱含設定。少寫主控台點擊路徑。
4. `<h3>清除</h3>`＋`<pre>`：刪除指令（反向順序），再一行確認已清乾淨的查詢指令（應該回傳空清單）。
5. 指令只能對照官方文件（AWS CLI Command Reference、各服務 User Guide）查證，寫課的人不能實測：每個指令的參數名都要在 CLI reference 確認過；資源名稱用 `cafe-learn-…` 前綴。

### 寫課的人最容易踩的坑

- 模擬器沒擋 ≠ AWS 會放行。見上表。
- 本機題的測試只透過 helper 建 client；不要在測試裡讀 `process.env.AWS_*`（已被清掉）。
- S3 用 path style（helper 已設）；CLI 對自訂 endpoint 的 addressing style 【未驗證】，CLI 題目先避開 s3 子指令，或寫課時實測。
- 錯誤用 `err.name` 判斷（SDK v3：`NoSuchBucket`、`ConditionalCheckFailedException`…）。
- 金額、免費額度、配額數字一律查官方頁面並寫日期，查不到不寫。
- 瀏覽器 TS 題依 AUTHORING 的引擎規則；TS 型別錯誤以 5.9.3／7.0.2 一致為準，跑 `ts-parity.mjs`。

---

## 不重教、不能重複

| 主題 | 出處 | 這門課怎麼處理 |
|---|---|---|
| VPC、子網路、CIDR 計算與規劃、安全群組入門、EC2、RDS、S3 的角色、成本估算 | devops 課第 18 課（練習：CIDR、SG 檢查器、成本估算） | 第 3、5、7、8 課回顧；不出 CIDR 計算、SG 檢查器、成本估算題 |
| root、MFA、Identity Center、Budgets、同帳號 policy 評估、GitHub OIDC 信任政策 | devops 課第 19 課（練習：budgetFor、同帳號聯集評估、OIDC 信任政策） | 第 2 課回顧；只做跨帳號、boundary、提權路徑、SSO 設定檔、CloudTrail |
| OpenTofu（HCL、state、plan、模組） | devops 課第 20 課（練習：本機 Docker provider、讀 plan、state 加密、SCP 的 explicit deny 選擇題） | 期末用到時回顧；不另開 IaC 課 |
| S3 presigned URL、上傳確認、生命週期 | data-stores 課第 12 課（createUpload、confirmUpload、getReceiptUrl、tmp/ 生命週期與孤兒清理） | 第 7 課回顧 |
| DynamoDB key 設計、single-table | data-stores 課第 14 課（customerItem／orderItems、recentOrders、shardKey、registerCoupon） | 第 10 課做冪等時回顧條件寫入 |
| EKS、GitOps | kubernetes 課第 15 課 | 第 5 課一句對照 ECS vs EKS |
| log、指標、追蹤、告警的通用觀念 | devops 課第 21～25 課 | 期末只寫 CloudWatch 的設定 |
| 限流、冪等、佇列送達語意、saga | system-design 課第 9、10、12、13 課 | 第 6、10 課回顧；不出 token bucket 題 |

## 階段與課程

（檔名照 `aws/lessons/NN-slug.html`；以 `lab.js` 的 STAGES 為準）

### 階段 1：帳號與身分

#### 1. 雲端與 AWS 全貌：region、責任分工、三種操作方式與帳單 — `01-aws-big-picture.html`
（已完整寫出，見檔案。這課是範本。2026-11-19 只改了提到後續課號的地方。）

- 重點：region／AZ（AZ ID）、全球 vs 區域服務；共同責任模型；主控台／CLI／SDK 都在呼叫同一組 API；ARN；SDK v3 的憑證鏈；計費模型。
- 練習：練習 1 本機 ex1 `whoami.sh`、練習 2 瀏覽器 TS `parseArn`、練習 3 瀏覽器 TS `credentialSource`、練習 4 本機 ex4 `menu-bucket.ts`、練習 5～7 選擇題。
- 不能重複：devops 18 的 CIDR、安全群組、成本估算，devops 19 的 budgetFor。

#### 2. 帳號與 IAM 延伸：SSO 設定檔、CloudTrail、跨帳號 role、permission boundary 與提權路徑 — `02-account-iam.html`

- 情境：店長用 root 的 access key 寫在 `.env` 給外包，金鑰外洩後一夜開了幾十台機器；事後要查誰做了什麼。另一個團隊的帳號要讀咖啡店的報表 bucket，同事直接給了 `s3:*` on `*`。
- 不重教：root 只做少數事並開 MFA、人員走 IAM Identity Center、Budgets 只通知不停機、同帳號的身分型 policy 評估、GitHub OIDC 的信任政策（devops 課第 19 課）。課文開頭一段回顧＋連結。
- 重點：
  1. `aws configure sso` 產生的 `[profile …]` 與 `[sso-session …]` 怎麼讀；`aws sso login --profile`；token 快取在 `~/.aws/sso/cache`；CLI 2.36 的 `aws login`【寫課時查 CLI reference 確認用途與最低版本】。「在真的 AWS 帳號上做一次」建立 Identity Center 使用者與 `learn-sandbox` profile（第 1 課已預告）。
  2. CloudTrail：預設 90 天 Event history（管理事件）vs 自己建 trail 存 S3（長期、data event 要另外開、要付費）；`lookup-events` 查「誰在什麼時候刪了這個 bucket」。
  3. 身分型 vs 資源型 policy：同帳號取聯集、**跨帳號兩邊都要允許**。評估順序：明確 Deny → SCP → 資源型 → permission boundary → session policy → 身分型（官方「Policy evaluation logic」）；boundary 與 SCP 只能收窄。
  4. role＝信任政策＋權限政策；`sts:AssumeRole`、`ExternalId`（防 confused deputy）、`MaxSessionDuration`、session policy。
  5. `iam:PassRole` 為什麼危險；permission boundary 讓開發者自己建 role 又不會提權；IAM Access Analyzer 一句。
  6. 模擬器不檢查權限：這課用 Moto 建 role、policy、assume role，**判斷有沒有權限**用瀏覽器 TS。
- 💡 實務上：新人拿到的是 SSO 入口網址而不是金鑰；事故調查第一步查 CloudTrail；跨帳號給權限用 role＋ExternalId，不是給對方 IAM user。
- 練習：
  - 練習 1（瀏覽器 TS）`auditConfig(configText, credentialsText)`：解析 `~/.aws/config`＋`credentials`（INI），回傳風險清單：有 `aws_access_key_id` 的 profile、`[default]` 指向 prod 帳號、SSO profile 缺 `sso_region`、`sso_session` 指到不存在的 `[sso-session]`、同一個帳號＋role 重複兩個 profile 名稱。mustFail：把 `[profile x]` 與 credentials 檔的 `[x]` 當成不同 profile；忽略註解行；只看 config 不看 credentials。
  - 練習 2（瀏覽器 TS）`crossAccountAllowed({ caller, identityPolicies, bucketPolicy, boundary? }, req)`：跨帳號＋boundary 的評估。mustFail：跨帳號仍取聯集；boundary 當成會給權限；忽略 boundary 裡的 Deny。（devops 19 練習 2 只做同帳號聯集）
  - 練習 3（本機，SDK）`setup-reporting.ts`：建 role `cafe-02-ex3-reporting`，信任政策只允許另一個指定帳號且要求 `sts:ExternalId`；inline policy 只能 `s3:GetObject` 指定 bucket 的 `reports/*`。測試讀回 role 與 policy 文件（GetRole、GetRolePolicy，policy 文件是 URL 編碼）比對，再用另一個帳號 AssumeRole 確認拿得到憑證。mustFail：Principal 寫 `*`；沒有 ExternalId 條件；Resource 寫整個 bucket；Action 用 `s3:*`。（devops 19 練習 3 是 OIDC 信任政策）
  - 練習 4（瀏覽器 TS）`escalationPaths(policy)`：找出能提權的組合（`iam:PassRole` Resource `*`＋`lambda:CreateFunction`／`ec2:RunInstances`；`iam:CreatePolicyVersion`；`iam:AttachUserPolicy` 給自己）。mustFail：只比對完整字串、忽略 `iam:*`；忽略 NotAction。
  - 選擇題：CloudTrail Event history 看得到 S3 物件讀取嗎；boundary 給了 s3:* 而身分政策沒有，能不能讀；跨帳號 bucket policy 已允許但對方 role 沒權限。
- 用到：第 1 課；devops 19（延伸）。

### 階段 2：網路與入口

#### 3. VPC 與「為什麼連不到」：route table、NAT、安全群組、NACL、VPC endpoint 與排查順序 — `03-vpc-connectivity.html`

- 情境：cafe-api 在私有子網路，結帳時呼叫金流商 API 一直逾時；另一邊連 RDS 逾時；S3 的流量全部走 NAT，月底帳單爆。
- 不重教：VPC、CIDR、公有／私有子網路、IGW、安全群組入門（devops 課第 18 課）、IP／port／DNS／TCP（devops 課第 4 課）。課文一段回顧。
- 重點：
  1. 公有 vs 私有子網路的差別只在 route table；最長前綴優先、`local` 路由；子網路沒關聯就用 main table。
  2. NAT gateway 放公有子網路、每個 AZ 一個才不會單點，計費是每小時＋處理量。
  3. 安全群組有狀態、只能寫允許、來源寫 SG；NACL 無狀態、有編號順序與 Deny、回程要開 ephemeral port（1024–65535）。
  4. gateway endpoint（S3、DynamoDB，免費、改 route table）vs interface endpoint（PrivateLink，ENI＋計費、私有 DNS）；endpoint policy。
  5. 排查順序：DNS → 路由 → NACL（雙向）→ SG → 目的地程式有沒有在聽 → OS 防火牆；「逾時」多半是網路層、「connection refused」多半是程式沒在聽。VPC Reachability Analyzer 與 Flow Logs（ACCEPT／REJECT 怎麼讀）。
  6. 模擬器：VPC 只是資料，沒有真的封包；連不連得到全部用瀏覽器 TS 依規則推論。
- 💡 實務上：S3 流量改走 gateway endpoint 省 NAT 處理費；NAT 只放一個 AZ 的代價；CIDR 跟公司內網撞到就無法 peering。
- 練習：
  - 練習 1（瀏覽器 TS）`routeFor(routeTables, subnetId, destIp)`＋`diagnoseEgress(vpc, subnetId)`：最長前綴匹配回傳 target，再回傳私有子網路連不出去的原因（沒有 0.0.0.0/0、NAT 在私有子網路、NAT 所在子網路沒有 IGW 路由）。mustFail：第一個符合就回傳；忽略 main table；只檢查第一層路由。（devops 18 是 CIDR 計算與規劃）
  - 練習 2（瀏覽器 TS）`roundTrip(nacls, sgs, packet)`：NACL 無狀態（規則編號由小到大、第一個符合就決定、最後的 `*` deny，回程另外判斷 ephemeral port）＋SG 有狀態。mustFail：找最寬鬆的規則；回程沿用去程判斷；SG 也要求回程規則。（devops 18 練習 2 只有 SG）
  - 練習 3（瀏覽器 TS）`parseFlowLogs(lines)`：依 (srcaddr, dstaddr, dstport) 彙整 REJECT，判斷可能原因（SG 擋：只有去程 REJECT；NACL 擋回程：去程 ACCEPT 回程 REJECT）。mustFail：把 NODATA／SKIPDATA 行當成資料；欄位順序寫死成非預設格式。
  - 練習 4（本機，SDK）`lockdown.ts`：建 alb-sg、app-sg、db-sg，規則用 SG 參照（不是 CIDR），再建 S3 gateway endpoint 掛到私有 route table，endpoint policy 只允許指定 bucket。測試讀回設定。mustFail：db-sg 來源寫 VPC CIDR；endpoint 沒掛 route table；endpoint policy 用 `*` Resource。
  - 選擇題：「逾時」先查什麼；interface vs gateway endpoint 給 S3 選哪個；SG 要不要開回應 port。
- 用到：第 1 課；devops 4、18。

#### 4. 對外入口：Route 53、ACM、ALB 與 CloudFront — `04-edge.html`

- 情境：咖啡店官網與 API 要用 `cafe.example.com`，憑證過期造成整站掛掉；靜態圖片從台灣以外很慢。
- 重點：Route 53 hosted zone、記錄類型（A、AAAA、CNAME、alias；apex 不能 CNAME）、TTL 與切換時的快取、routing policy（simple、weighted、failover、latency）與健康檢查；ACM（DNS 驗證、自動續約的條件、**CloudFront 用的憑證必須在 us-east-1**）；ALB（L7、listener、rule、target group、健康檢查參數與 deregistration delay、HTTP→HTTPS 轉址）vs NLB 一段（L4、固定 IP）；CloudFront（edge、cache key、TTL、origin、invalidation 要錢且非即時、OAC 留到第 7 課）。TLS 回顧 devops 5、反向代理回顧 devops 12。
- 💡 實務上：DNS 切換前先把 TTL 調低；憑證續約失敗多半是 DNS 驗證記錄被刪；ALB idle timeout 與長連線。
- 練習：
  - 練習 1（瀏覽器 TS）`resolve(zone, name, type)`：alias 展開、CNAME 鏈、weighted 依權重與給定的 random、failover 依健康狀態。mustFail：apex 允許 CNAME；weighted 權重 0 仍被選；failover 不看健康檢查。
  - 練習 2（瀏覽器 TS）`matchListener(rules, req)`：ALB listener rule 依 priority 比對 host-header、path-pattern（`*`、`?`）、http-method，回傳 forward／redirect／fixed-response。mustFail：依陣列順序不依 priority；path-pattern 當 regex；host 大小寫。
  - 練習 3（本機，SDK）`dns-cutover.ts`：建 hosted zone `cafe-04.test`，一次 ChangeResourceRecordSets batch：UPSERT `api` 的 weighted 記錄（舊 90／新 10）、TTL 60。測試讀回。【未驗證 Moto 對 weighted 的支援程度；不行就改成檢查送出的 ChangeBatch】mustFail：分兩次請求；SetIdentifier 重複；用 CREATE 導致第二次執行失敗。
  - 選擇題：CloudFront 憑證放哪個 region；為什麼改了 DNS 有人還連舊的；ALB vs NLB 何時選 NLB。
- 用到：第 3 課；devops 5、12。

### 階段 3：運算

#### 5. 容器上 AWS：ECR、ECS Fargate、task role 與 execution role — `05-ecs-fargate.html`

- 情境：cafe-api 容器化後要上 AWS；部署後 task 一直 STOPPED，訊息是拉不到映像／拿不到 secret。
- 重點：
  1. ECR（repository、tag 不可變、lifecycle policy、掃描）。
  2. task definition（CPU／記憶體組合、container definition、port、awslogs、secrets 從 Secrets Manager／SSM 注入）。
  3. **execution role**（ECS 代理人拉映像、寫 log、讀 secret）vs **task role**（你的程式呼叫 AWS）；第 1 課的憑證鏈 container 那一步。
  4. service（desired count、awsvpc 每個 task 一個 ENI、ALB 整合（第 4 課）、minimumHealthyPercent／maximumPercent、circuit breaker 回滾）。
  5. EC2 還是 Fargate（原第 7 課留下的一節）：EC2 回顧 devops 18；instance profile 與 IMDSv2（`HttpTokens=required`、hop limit，IMDSv1 被 SSRF 偷憑證，回顧 auth 課第 22 課）、Session Manager 取代 SSH；什麼時候值得自己管機器。ECS vs EKS 一句連 kubernetes 15。
- 💡 實務上：兩種 role 搞混是最常見的 STOPPED 原因；映像用 digest 或不可變 tag；Fargate 的 CPU 記憶體只能用規定組合。
- 練習：
  - 練習 1（瀏覽器 TS）`diagnoseStopped(reason, taskDef, network)`：判斷要改 execution role、task role、網路（私有子網路沒 NAT／endpoint 拉不到 ECR，第 3 課）還是記憶體。mustFail：全部歸 task role；忽略 assignPublicIp。
  - 練習 2（瀏覽器 TS）`validateTaskDef(td)`：Fargate CPU／記憶體合法組合、awsvpc、secrets 的 valueFrom 是 ARN、沒有 `latest`、logConfiguration 存在。mustFail：只檢查 CPU 不檢查記憶體範圍；接受 `:latest`。【組合表寫課時查官方「Task size」並寫日期】
  - 練習 3（本機，SDK）`deploy-api.ts`：ECR repository（tag immutable、scan on push）、RegisterTaskDefinition（兩個 role 分開、secrets 用 Secrets Manager ARN）、CreateCluster、CreateService（Fargate、私有子網路、不給公開 IP、circuit breaker＋rollback）。測試讀回。mustFail：兩個 role 同一個；assignPublicIp ENABLED；沒開 circuit breaker；secret 寫在 environment 明文。
  - 選擇題：task 讀 S3 失敗該改哪個 role；minimumHealthyPercent 100／maximumPercent 200 的部署過程；為什麼 IMDSv2 要求 token。
- 用到：第 2、3、4 課；devops 7～10、18；kubernetes 15（延伸）。

#### 6. Lambda 與 API Gateway：handler、冷啟動、並行、HTTP API 與授權 — `06-lambda-api-gateway.html`

- 情境：收據 PDF 產生與手機點餐 API 想改成無伺服器；尖峰時一部分請求 429、一部分逾時，資料庫連線數爆掉。
- 重點：
  1. handler（`export const handler = async (event, context)`，ESM）；執行環境生命週期（init、invoke、freeze、重用；handler 外面的程式只在冷啟動跑一次）；provisioned concurrency；SnapStart（Node 有沒有支援寫課時查）。
  2. 並行：帳號配額、reserved concurrency（上限，不是保證）、同步呼叫被 throttle 回 429、非同步會重試與 destination／DLQ。
  3. timeout 與 `context.getRemainingTimeInMillis()`；記憶體＝CPU；打包（zip、layer、container image，esbuild）；execution role＋resource-based policy（誰能呼叫我）。
  4. API Gateway：REST API vs HTTP API（查官方比較表）；payload format 2.0（`requestContext`、`rawPath`、`body` 是字串、`isBase64Encoded`）；JWT authorizer／Lambda authorizer（快取）／IAM；CORS（回顧 auth 課第 5 課）；節流（帳號層級與 route 層級，限流演算法回顧 system-design 課第 10 課）；整合逾時上限（查證）。
  5. 模擬器：handler 直接在 Node 呼叫；Moto 只存函式設定、resource policy、API 設定。
- 💡 實務上：在 handler 外建 SDK client；Lambda 連 RDS 用 RDS Proxy（第 8 課）；Lambda timeout 要比 API Gateway 的整合逾時短；authorizer 快取導致權限變更延遲。
- 練習：
  - 練習 1（本機）`receipt.ts`：handler 外建立 client（測試計算建構次數，呼叫三次只能建一次）、剩不到 1 秒時停止並回 `batchItemFailures`。mustFail：每次 invoke 建 client；忽略剩餘時間；整批丟例外。
  - 練習 2（瀏覽器 TS）`simulateConcurrency(arrivals, durationMs, reserved)`：同時執行數、哪些被 throttle、哪些是冷啟動。mustFail：環境用完不重用；reserved 當成最低保證。
  - 練習 3（本機）`orders-handler.ts`：HTTP API v2 事件的路由 handler（GET /orders/{id}、POST /orders），解析 base64 body、驗證 JSON、依 `requestContext.authorizer.jwt.claims.sub` 只回自己的訂單。測試用假事件。mustFail：body 當物件；忽略 isBase64Encoded；用 query 參數的 userId 而不是 claims。
  - 練習 4（本機，SDK）`create-api.ts`：建 execution role、CreateFunction、HTTP API＋Lambda 整合（payload 2.0）、JWT authorizer、stage 預設節流、CORS 只允許咖啡店前端網域、AddPermission 限定這個 API 的 SourceArn。測試讀回。【未驗證 Moto 的 apigatewayv2 authorizer、CORS 支援】mustFail：AddPermission 不限 SourceArn；CORS 允許 `*` 且帶 credentials；route 沒掛 authorizer。
  - 選擇題：handler 外的程式什麼時候執行；reserved concurrency 設 0 的效果；API 回 504 先查什麼。
- 用到：第 2 課；node 課的 event loop、ESM；auth 課的 JWT、CORS（回顧）。

### 階段 4：資料與機密

#### 7. S3 深入：policy、版本、加密、靜態網站與 CloudFront OAC — `07-s3-deep-dive.html`

- 情境：前端 Vue 網站放 S3，有人為了能看到網頁把 bucket 設成公開，結果收據資料夾也被公開。
- 重點：bucket policy vs IAM vs ACL（ACL 預設停用、Object Ownership）；Block Public Access 四個設定；版本控制與 delete marker；生命週期（轉儲存類別、非目前版本、未完成分段）；加密（SSE-S3 預設、SSE-KMS 與 bucket key、強制 `aws:SecureTransport`）；靜態網站兩種做法（website endpoint 需公開 vs **CloudFront＋OAC 私有 bucket**，推薦後者；SPA 的 403/404 → index.html）；強一致。presigned URL 回顧 data-stores 12。
- 不能重複：data-stores 12 的 createUpload、confirmUpload、getReceiptUrl、lifecycle（tmp/ 規則與孤兒清理）。
- 💡 實務上：部署 Vue SPA；誤刪救回（版本）；KMS 加密的 bucket 要同時給 kms:Decrypt。
- 練習：
  - 練習 1（瀏覽器 TS）`oacBucketPolicy(bucket, distributionArn)` 與 `isPublic(policy, bpa)`。mustFail：Principal `*`；條件用 SourceAccount 而不是 SourceArn；Resource 漏 `/*`。
  - 練習 2（本機，SDK）`site-bucket.ts`：建 bucket、開版本控制、SSE-KMS＋bucket key、BPA 全開、bucket policy 拒絕非 HTTPS。測試讀回各設定。mustFail：沒開 bucket key；用 Allow 處理 SecureTransport；BPA 只開兩項。
  - 練習 3（本機，SDK）`restore.ts` `restoreDeleted(s3, bucket, key)`：找出最新的 delete marker 並刪除它來還原。mustFail：重新上傳舊版本；刪掉的是資料版本；不處理分頁。
  - 選擇題：OAC vs website endpoint；刪除開了版本控制的物件發生什麼；SSE-KMS 的 bucket 只給 s3:GetObject 會怎樣。
- 用到：第 2、4 課；data-stores 12（延伸）、vue 課的 SPA 路由（回顧）。

#### 8. RDS 與 Aurora：Multi-AZ、read replica、備份與 PITR、RDS Proxy、連線數 — `08-rds-aurora.html`

- 情境：開幕活動 Lambda 擴到幾百個並行，RDS 回 `too many connections`；有人想用 read replica 解決結帳後立刻查訂單查不到的問題。
- 不重教：RDS 是代管的資料庫、放私有子網路（devops 18）；交易、連線池、複寫觀念（PostgreSQL 課第 18、36、37 課）。
- 重點：RDS vs Aurora 架構（查證官方）；Multi-AZ（同步備援、切換、DNS 端點不變但連線會斷）vs read replica（非同步、讀到舊資料）；自動備份與 PITR（還原成**新的**執行個體）；`max_connections` 由記憶體決定（查證）；RDS Proxy（連線池、Lambda 必備、IAM 認證）；參數群組、維護時段；Aurora Serverless v2 一句。
- 模擬器：Moto 只有中繼資料，這課以瀏覽器 TS 為主。
- 💡 實務上：應用程式要能重連；讀寫分離要處理 read-your-writes；PITR 要演練。
- 練習：
  - 練習 1（瀏覽器 TS）`routeQuery(q, session, replicaLagMs, now)`：寫入後同一個 session N 秒內的讀走 primary、交易內全部走 primary。mustFail：所有 SELECT 都走 replica；交易內的 SELECT 走 replica。
  - 練習 2（瀏覽器 TS）`connectionBudget({ maxConnections, services })`：各服務連線池上限總和是否超過、要不要 RDS Proxy。mustFail：忽略保留給維運的連線；Lambda 用平均而非最大並行。
  - 練習 3（本機，SDK）`restore-plan.ts` `pitr(rds, sourceId, time)`：檢查時間範圍，RestoreDBInstanceToPointInTime 還原成新名稱。【未驗證 Moto 支援；不行就改成檢查送出的參數】mustFail：還原到原名稱；不檢查範圍；時間用本地時區字串。
  - 選擇題：Multi-AZ 能不能分擔讀取；PITR 後 app 要改什麼；Lambda 直連 RDS 的問題。
- 用到：第 3、6 課；PostgreSQL 課、devops 18、24（回顧）。

#### 9. 機密與加密：KMS、envelope encryption、Secrets Manager 與 Parameter Store — `09-kms-secrets.html`

- 情境：資料庫密碼寫在 task definition 的環境變數；離職員工的筆電裡有 `.env`。
- 重點：KMS key（AWS managed vs customer managed、key policy 是主要授權、grant）；envelope encryption（GenerateDataKey → 用明文 data key 加密 → 丟掉明文、存密文 key）；KMS Encrypt 的大小上限（查證）；encryption context；Secrets Manager（輪替、AWSCURRENT／AWSPENDING、跨帳號）vs SSM Parameter Store（SecureString、階層）；程式端快取與輪替時的雙密碼期。加密與雜湊的觀念回顧 auth 課第 23 課、設定與機密回顧 devops 11。
- 💡 實務上：ECS（第 5 課）／Lambda（第 6 課）怎麼注入；輪替時舊連線怎麼辦；key 刪除有等待期（查證天數）。
- 練習：
  - 練習 1（本機，SDK＋node:crypto）`envelope.ts` `seal`／`open`：GenerateDataKey＋AES-256-GCM，只存密文 data key；encryption context 不一致要解不開。【已實測 GenerateDataKey／Decrypt；context 不符是否報錯【未驗證】，不行就檢查請求參數】mustFail：存明文 data key；IV 固定；用 KMS Encrypt 加密整份資料；忽略 auth tag。
  - 練習 2（本機，SDK）`get-secret.ts`：帶快取（TTL、`now()` 注入）讀 Secrets Manager；認證錯誤時強制刷新一次再重試。mustFail：每次請求都呼叫 API；永不過期；無限重試。
  - 練習 3（瀏覽器 TS）`rotationPlan(state)`：照輪替四步驟推進 stage 標籤。mustFail：先移 AWSCURRENT 再測試；AWSPREVIOUS 沒保留。
  - 選擇題：Secrets Manager vs Parameter Store；key policy 沒給帳號 root 會怎樣；envelope encryption 的好處。
- 用到：第 2、5 課；auth 23、devops 11（回顧）。

### 階段 5：事件與上線

#### 10. SQS、SNS、EventBridge 與 S3 事件：visibility timeout、DLQ、fan-out 與冪等 — `10-messaging.html`

- 情境：結帳後要寄收據、加點數、通知廚房；收據寄了兩封，另一邊點數漏加；門市每晚上傳的銷售 CSV 有時沒被處理。
- 不重教：至少一次送達、冪等、outbox、saga 的觀念（system-design 課第 9、12、13 課）；DynamoDB 的 key 設計（data-stores 課第 14 課）。
- 重點：SQS standard vs FIFO；visibility timeout 要比處理時間長、處理中延長；long polling；DLQ 與 maxReceiveCount、redrive；SNS fan-out（filter policy、raw delivery、queue policy）；EventBridge（event bus、event pattern、archive／replay）；**冪等**：idempotency key＋DynamoDB 條件寫入；S3 event notification → SQS → Lambda（key 是 URL 編碼、`s3:TestEvent`、partial batch response）；Step Functions（Standard vs Express、Retry／Catch）與 EventBridge Scheduler 各一段，不出題。三者怎麼選。
- 模擬器：S3 → SQS、SQS redrive、SNS → SQS、EventBridge rule → SQS 已實測可用；SNS filter policy【未驗證】。
- 💡 實務上：重複處理一定會發生；DLQ 要有告警；EventBridge pattern 寫錯會靜默不觸發；S3 key 的空白變 `+`。
- 練習：
  - 練習 1（本機，SDK）`worker.ts` `pollOnce(sqs, ddb, queueUrl, handle)`：long polling、DynamoDB 條件寫入做冪等、成功才刪訊息。測試讓訊息重送、超過 maxReceiveCount 進 DLQ。mustFail：收到就刪；冪等用記憶體 Set；處理前先寫完成標記。
  - 練習 2（瀏覽器 TS）`matchPattern(pattern, event)`：EventBridge event pattern（巢狀、陣列 OR、prefix、numeric、exists、anything-but）。mustFail：陣列當 AND；prefix 對數字；exists false 判斷錯。
  - 練習 3（本機，SDK）`fanout.ts`：SNS topic → 兩個 SQS（kitchen 只收 `type=drink`、receipts 全收、raw delivery），queue policy 限制 SourceArn。mustFail：沒 filter；queue policy 沒限制 SourceArn；用 body 過濾卻沒設 FilterPolicyScope。
  - 練習 4（本機）`ingest.ts` SQS 事件 handler：解開 body 裡的 S3 事件（忽略 `s3:TestEvent`）、`decodeURIComponent(key.replace(/\+/g, ' '))`、依 `bucket/key/versionId` 冪等、回 batchItemFailures。測試用 Moto 真的上傳檔案、從佇列讀出真實格式的事件。mustFail：沒解 URL 編碼；把 TestEvent 當錯誤；整批失敗。
  - 選擇題：visibility timeout 比處理時間短；FIFO 能不能保證只處理一次；S3 直接觸發 Lambda vs 中間放 SQS。
- 用到：第 6、7 課；system-design 9、12（延伸）、data-stores 14（回顧）。

#### 11. 期末專題：把作品部署上 AWS — `11-capstone.html`

- 作品：新的作品專案課 `portfolio/` 的多租戶 NestJS 後台（**還在規劃**，課綱定案後再回來補細節：模組、資料表、需要的 AWS 服務以那門課為準）。這一課假設它是一個容器化的 NestJS API＋PostgreSQL＋檔案上傳＋背景工作。
- 三段：
  1. **架構與取捨**（瀏覽器題＋ADR）：給需求（流量、預算、團隊人數、RPO／RTO、租戶隔離），在 `design.json` 選每一層（運算：ECS Fargate vs Lambda；資料庫：RDS 單 AZ vs Multi-AZ；檔案：S3＋OAC；背景工作：SQS worker；機密：Secrets Manager）並寫理由；測試檢查硬性限制（RPO 5 分鐘必須開 PITR、單一 AZ 不符可用性要求、預算排除每 AZ 一個 NAT 等）。ADR 格式回顧 system-design 課第 18 課。
  2. **部署到模擬器**（本機）：用 OpenTofu（回顧 devops 20）或 SDK 建出 ECR、ECS service（兩個 role 分開）、ALB target group、RDS（中繼資料）、S3、Secrets Manager、SQS＋DLQ、CloudWatch log group（保留天數）與一個 alarm、成本分攤標籤（原第 19 課的內容，只寫設定，觀念回顧 devops 21～25）。【未驗證：OpenTofu 的 AWS provider 要下載（連外），比照 devops 的 `tofu.sh` 把 provider 鏡像進映像，並實測 provider 對 Moto 的 plan／apply；不行就用 SDK】測試讀回資源，再跑一次確認冪等。
  3. **事故**（start 裡已埋好）：(a) execution role 與 task role 搞混，task 拿不到 secret；(b) worker 的 visibility timeout 比處理時間短，同一個檔案處理兩次；(c) S3 key 有空白，worker 找不到物件；(d) task role 少了 `kms:Decrypt`（模擬器不會擋：測試檢查 policy 文件，課文明講這點）。讀者寫 `postmortem.md`（測試檢查結構）並修好。
- 「在真的 AWS 帳號上做一次」：把作品真的部署一次，列出每小時計費的資源（NAT、ALB、RDS、Fargate、公開 IPv4）與清除順序。
- 階段檢核。
- 用到：全課；devops 20（OpenTofu）。
