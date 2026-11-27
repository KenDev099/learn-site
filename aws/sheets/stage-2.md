---
title: AWS 階段 2：網路與入口
subtitle: 第 3～4 課一頁圖解：route table、NAT、安全群組與 NACL、VPC endpoint、排查順序、Route 53、ACM、ALB、CloudFront
cols: 3
theme: shadcn
課程: AWS 第 3～4 課
---
「連不到」是好幾層各自獨立的規則其中一層沒對上；先分逾時還是被拒絕，再從離自己近的一層查起。[回 AWS 學習地圖](../index.html)

## A 封包從私有子網路出去 {span=2}
```flow LR
[cafe-api] -> [安全群組 出站]
[安全群組 出站] -> [NACL 出站]
[NACL 出站] -> [私有 route table]: 0.0.0.0/0 → NAT
[私有 route table] -> [NAT gateway]
[NAT gateway] -> [公有 route table]: 0.0.0.0/0 → igw
[公有 route table] -> [internet gateway]
```
回應沿原路回來：NACL 要另外放行回程，安全群組自動放行。

## B route table 怎麼選路
```kv cols=1
最長前綴: 符合的路由裡挑前綴最長的，跟順序無關
local: VPC CIDR → local，每張表都有、刪不掉
main table: 沒有明確關聯的子網路用它
兩層: 指向 NAT 時，NAT 所在子網路也要有到 igw 的路由
```

## C 安全群組與 NACL
| | 安全群組 | NACL |
|---|---|---|
| 掛在 | 網路介面 | 子網路 |
| 狀態 | ok 有狀態，回應自動放行 | warn 無狀態，回程開臨時 port（常見 1024–65535） |
| 規則 | 只能允許，有一條允許就過 | 允許與拒絕，依編號第一條符合的決定 |
| 來源 | CIDR 或另一個安全群組 | 只能 CIDR |

db 的來源寫 app 的安全群組，不寫 VPC CIDR。

## D NAT 與 VPC endpoint
| 東西 | 重點 | 費用 |
|---|---|---|
| zonal NAT | warn 放公有子網路、只在一個 AZ，正式環境每個 AZ 一個 | 每小時＋每 GB |
| regional NAT | ok 2025-11 起，不需要公有子網路、自動跨 AZ | 每個 AZ 每小時＋每 GB |
| gateway endpoint | ok S3、DynamoDB；route table 加 prefix list 路由，每張私有表都要掛 | 不收費 |
| interface endpoint | 子網路裡的 ENI，多數服務；VPN 進來也能用 | 每個 AZ 每小時＋每 GB |

endpoint policy 只列自己的 bucket，只能收窄。

## E 排查順序 {span=2}
```flow LR
[逾時] -> [DNS]
[DNS] -> [路由]
[路由] -> [NACL 雙向]
[NACL 雙向] -> [安全群組]
[安全群組] -> [程式有沒有在聽]
[程式有沒有在聽] -> [OS 防火牆]
[connection refused] -> [程式有沒有在聽]: 網路是通的
```
Reachability Analyzer 分析設定、每次計費；Flow Logs 記錄實際流量：去程 REJECT 是進站被擋，去程 ACCEPT、回程 REJECT 只可能是 NACL。

## F 從網址到程式
```flow LR
[瀏覽器] -> [Route 53]: 查名稱
[瀏覽器] -> [ALB 443]: ACM 憑證做 TLS
[ALB 443] -> [規則 priority 小的先]
[規則 priority 小的先] -> [target group]: 只送健康的
[瀏覽器] -> [CloudFront]: 靜態檔
[CloudFront] -> [S3 或 ALB]: 快取沒有才回來源
```

## G Route 53
| 東西 | 重點 |
|---|---|
| alias | ok 指向 ALB、CloudFront；可放 apex；不收查詢費；TTL 跟著目標 |
| CNAME | no 不能放 apex |
| TTL | warn 切換前提前調低，舊的 TTL 要先過完 |
| weighted | 權重 0～255，0 不回答（除非全部是 0）；同名靠 SetIdentifier 區分 |
| failover | PRIMARY 健康回它，否則 SECONDARY |
| change batch | 同一批一起生效；UPSERT 可重複執行 |

同名的 hosted zone 可以建很多個，只有註冊商指向的那個生效：先找再建。

## H ACM、ALB、CloudFront
```callout warn 憑證續約失敗多半是驗證記錄被刪了
DNS 驗證的 CNAME 要一直留著；自動續約要「使用中」且驗證記錄查得到；匯入的憑證不會自動續約。CloudFront 用的憑證要建在 `us-east-1`；ALB 用的憑證建在 ALB 所在 region。
```
ALB 規則：host 不分大小寫，path 分大小寫且不含 query，`*`、`?` 是萬用字元不是正規表示式；idle timeout 預設 60 秒，長連線要送心跳。要固定 IP 或非 HTTP 協定用 NLB。CloudFront 的 invalidation 不即時、超過每月免費額度計費，部署靠檔名帶版本。
