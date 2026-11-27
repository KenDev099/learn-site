---
title: Kubernetes 階段 2：網路與設定
subtitle: 第 4～6 課一頁圖解：Service、叢集內 DNS、Gateway API、ConfigMap、Secret
cols: 3
theme: shadcn
課程: Kubernetes 第 4～6 課
---
呼叫端不直接連 Pod：叢集內用 Service 的 DNS 名稱，對外 HTTP 共用一個 Gateway；設定跟映像分開，放進 ConfigMap 與 Secret，改了設定要觸發滾動更新。[回 Kubernetes 學習地圖](../index.html)

## A Service 怎麼把流量送到 Pod {span=2}
```flow LR
[呼叫端 Pod] -> CoreDNS: 查 cafe-api
CoreDNS --> [呼叫端 Pod]: 回 ClusterIP
[呼叫端 Pod] -> [節點轉送規則]: 連 ClusterIP port 80
[節點轉送規則] -> [Ready 的 Pod]: 轉到 targetPort
*EndpointSlice -> [節點轉送規則]: kube-proxy 讀它寫規則
[控制平面的控制器] -> EndpointSlice: 寫入 selector 挑到且 Ready 的 Pod
```
Pod IP 會變、有好幾份、不知道誰準備好了，所以要 Service。Service 本身不是程序，也不做健康檢查，只看 Pod 的 Ready 狀態。kube-proxy 是 L4、以連線為單位分配，長連線會讓負載不平均。

## B Port、targetPort 與 DNS 名稱
| 欄位 | 是誰的 port | cafe-api |
|---|---|---|
| `port` | Service，呼叫端連這個 | 80 |
| `targetPort` | 容器真正在聽的 | `http`（具名 port） |
| `containerPort` | 容器宣告，可以取名 | `name: http`、3000 |

省略 targetPort 時等於 port。替容器 port 取名，targetPort 寫名字。

| 呼叫端寫 | 結果 |
|---|---|
| `cafe-api` | ok 同 namespace |
| `cafe-api.<ns>` | ok 跨 namespace |
| `cafe-api.<ns>.svc.cluster.local` | ok 完整名稱 |
| 跨 namespace 只寫短名稱 | no ENOTFOUND |

靠 resolv.conf 的 search 與 `ndots:5`。設定裡不寫 Pod IP 或 ClusterIP。BusyBox 的 nslookup 不套用 search，改用 `getent hosts`。

## C Service 的類型
| 類型 | 誰連得到 | 用途 |
|---|---|---|
| ClusterIP（預設） | ok 叢集內部 | 服務之間互相呼叫 |
| NodePort | warn 每個節點同一個 port | 很少直接用 |
| LoadBalancer | ok 外部 | 非 HTTP 或少數直接對外的服務 |
| headless | DNS 回每個 Ready Pod 的 IP | 呼叫端自己挑 Pod |
| ExternalName | DNS 回 CNAME | 用固定名稱連外部主機 |

本機的 LoadBalancer 由 cloud-provider-kind 開 Envoy 容器，用 `bin/url.mjs` 查 port，腳本不寫死 port。雲端上每個 LoadBalancer 都是一台要付錢的負載平衡器。

## D Service 沒有流量：照順序查
```flow TB
(連不上) -> {EndpointSlice 有 Pod?}
{EndpointSlice 有 Pod?} -> [比對 selector 與 Pod label、看 READY]: ENDPOINTS 是 unset
{EndpointSlice 有 Pod?} -> {PORTS 有值?}: 有 IP
{PORTS 有值?} -> [targetPort 名字找不到]: unset
{PORTS 有值?} -> [targetPort 數字不對或 DNS 名稱與 namespace]: 有數字仍失敗
```
`kubectl get endpointslice -l kubernetes.io/service-name=cafe-api` 一行就排除一半可能，不要先懷疑 DNS。

## E Gateway API：三種物件、兩種角色 {span=2}
```flow LR
GatewayClass -> Gateway: gatewayClassName 選實作
Gateway -> [listener port 協定 TLS 憑證]
*HTTPRoute -> Gateway: parentRefs 掛上去
HTTPRoute -> [Service cafe-api port 80]: backendRefs
HTTPRoute -> [Service web port 80]: backendRefs
group 平台團隊: GatewayClass, Gateway, listener port 協定 TLS 憑證
group 應用團隊: HTTPRoute
```
入口做四件事：依 port 接請求、依網域分辨、終結 TLS、依路徑轉給後端。控制器把物件變成真正的代理（本機是 Envoy，EKS 上是 ALB）。listener 的 allowedRoutes 用 Same 或 Selector，不用 All；跨 namespace 參照 Service 要對方建 ReferenceGrant。backendRefs 寫 Service 的 port，不是 containerPort。

## F Ingress 與 Gateway API
| | Ingress | Gateway API |
|---|---|---|
| 能描述什麼 | warn 只有主機與路徑，其他靠各家 annotation | ok 標頭、權重、轉址等有欄位 |
| 權限 | no 入口與路由在同一個物件 | ok Gateway 與 HTTPRoute 分開給 |
| 現況 | no API 已凍結，Ingress NGINX 已退役 | ok 新專案用 `gateway.networking.k8s.io/v1` |

搬舊 Ingress：ingress2gateway 當起點，逐項確認 annotation 的對應，兩邊並存、用同一組請求比對再切換。Extended 功能先查 GatewayClass 的 supportedFeatures。

## G HTTPRoute 規則與 HTTPS
- 優先順序：Exact 勝 PathPrefix，前綴長者勝，標頭多者勝；跟書寫順序無關。
- 同一個 match 裡是「而且」，同一個 rule 的 matches 之間是「或」；標頭條件要自己一個 rule。
- `weight` 是相對比例，用來做金絲雀。
- HTTPS：憑證放 tls Secret，用 `kubectl create secret tls` 從檔案建立、不進 git；listener 用 `tls.mode: Terminate`；HTTP listener 掛 `RequestRedirect`，用 `sectionName` 讓路由只掛在對的 listener。

```callout warn apply 成功不等於生效
讀 status 的 Accepted、ResolvedRefs、PartiallyInvalid，再實際打請求。本機實測：cloud-provider-kind 不支援 URLRewrite，Route 仍是 Accepted，那條規則被丟掉，流量默默落到別的後端。
```

## H ConfigMap 與 Secret {span=3}
| 設定 | 放哪裡 |
|---|---|
| `LOG_LEVEL`、`APP_ENV`、功能開關 | ConfigMap |
| 資料庫密碼、金流 API key、TLS 私鑰 | Secret |
| 幾 MB 的資料 | 都不放：映像或物件儲存，上限 1 MiB |

判斷標準：貼到公開頻道會不會出事。注入方式：`envFrom` 整包、`valueFrom` 單一 key、volume 掛成檔案；同名時 env 優先。機密優先用檔案搭配 `_FILE` 慣例。值一律寫成字串，`"true"` 要加引號。

| 改了設定 | Pod 看得到嗎 |
|---|---|
| 環境變數 | no 要建新 Pod |
| volume 檔案 | warn 約一分鐘內更新，應用要自己重讀 |
| `subPath` | no 永遠不更新 |

觸發滾動更新：`rollout restart`、checksum annotation，或「immutable＋改名」讓設定跟著 `rollout undo` 一起回滾。不要用 `kubectl delete pods` 套用新設定。

```callout err base64 不是加密
保護來自三層：RBAC（能建 Pod 就能讀該 namespace 的 Secret）、etcd 加密（EKS 1.28 起預設用 KMS）、外部 secret 管理（Secrets Manager＋External Secrets Operator）。機密不進 git，進了就輪替密碼。
```
引用不存在的 ConfigMap、Secret 或 key：Pod 卡在 CreateContainerConfigError，容器沒跑過、logs 看不到，原因在 describe 的 Events。不要用 `optional: true` 掩蓋必要的設定。
