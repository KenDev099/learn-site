---
title: Kubernetes 階段 5：正式環境與期末專題
subtitle: 第 14～16 課一頁圖解：除錯流程、事故紀錄、GitOps、Argo CD、EKS、升級、期末專題
cols: 3
theme: shadcn
課程: Kubernetes 第 14～16 課
---
出事時先蒐證再動手，修正一律回到 git 裡的宣告；正式環境讓 git 成為唯一的部署入口，上線前把需求翻成可以自動檢查的條目。[回 Kubernetes 學習地圖](../index.html)

## A 固定的除錯順序 {span=2}
```flow LR
(get pods -o wide) -> [describe 與 kubectl events]
[describe 與 kubectl events] -> [logs --previous 與 lastState]
[logs --previous 與 lastState] -> [exec 或 kubectl debug]
[exec 或 kubectl debug] -> [Service、DNS、NetworkPolicy、RBAC]
[Service、DNS、NetworkPolicy、RBAC] -> *[修在 manifest 或 chart]
```
- 先蒐證，不要先刪 Pod：新 Pod 有新名字，舊的事件、上一次的 log、lastState 全部消失。
- 先看最便宜的證據；一次只改一個變數；邊查邊記時間。
- 事件預設只保留 1 小時，正式環境要收進 log 系統。

## B 狀態字只指出去哪裡看
| 看到 | 去哪裡看 |
|---|---|
| Pending | FailedScheduling 事件 |
| ImagePullBackOff、CreateContainerConfigError | Failed 事件，原因在第一行 |
| CrashLoopBackOff、OOMKilled | 上一次的 log 與 exit code |
| Running 但 0/1 | Unhealthy 事件 |
| 1/1 卻不通 | EndpointSlice |
| Terminating 不消失 | finalizers、節點狀態；強制刪除是最後手段 |

exit code：大於 128 減 128 是訊號編號，137＝SIGKILL，143＝SIGTERM。137 不一定是 OOM，要看 reason。被 SIGKILL 的程序沒機會寫 log。

## C 沒有 shell 的映像怎麼查
```kv cols=1
臨時容器: kubectl debug -it pod/x --image=busybox:1.38.0 --target=api
看目標容器: /proc/1/environ 是實際拿到的環境變數，/proc/1/root 是檔案系統
--profile=general: 才有讀 /proc/1/environ 需要的 SYS_PTRACE
--copy-to: 建可以改指令的複本，不在 Service 流量裡
debug node/…: 節點根目錄掛在 /host
```
臨時容器加上去就移除不了；複本與 node-debugger Pod 用完要自己刪。exec、debug、port-forward 都是高權限，只給值班人員並開稽核 log。

## D 縮小範圍，修在宣告裡
```flow TB
[port-forward pod/ 直接打 Pod] -> {成功?}
{成功?} -> [看應用的 log]: 失敗
{成功?} -> [從叢集內用名字打 Service]: 成功
[從叢集內用名字打 Service] -> [看 EndpointSlice]: 失敗
[從叢集內用名字打 Service] -> [看 Gateway、HTTPRoute 的 status]: 成功但外面不通
```
`port-forward svc/` 不經過 Service。呼叫端連不出去時查 DNS、NetworkPolicy、`auth can-i`。

| 根因 | 讓症狀消失 | 修正根因 |
|---|---|---|
| readiness 路徑打錯 | no 刪掉 probe | ok 改成正確路徑 |
| Secret 的 key 打錯 | no 加 `optional: true` | ok 改成真正的 key |

止血可以在叢集上做，修正走正常部署。事故紀錄寫時間軸、影響、偵測、根因、修正與後續行動，後續行動至少一條是自動化的檢查。

## E GitOps：CI 不碰叢集 {span=2}
```flow LR
[app repo] -> CI: 合併到 main
CI -> [(registry)]: 映像 tag 用 commit SHA
CI -> [config repo PR]: yq 改 image.tag，專屬 token
[config repo PR] -> [config repo]: 合併，prod 要人核准
*[Argo CD] -> [config repo]: 定期拉取
[Argo CD] -> [叢集]: 持續調和
```
四個原則：宣告式、版本化在 git、自動拉取、持續調和。回滾是 `git revert`。Application 的 `source` 指 repo、path、targetRevision、`helm.valueFiles`；`syncPolicy` 有 automated、prune、selfHeal。prod 的 targetRevision 釘 tag 或 commit。

## F 同步、健康與 drift
| 狀態 | 值 | 意思 |
|---|---|---|
| 同步 | Synced／OutOfSync | 叢集跟 git 一不一樣 |
| 健康 | Healthy／Progressing／Degraded | 資源本身好不好 |

Synced 但 Degraded 很常見：同步成功不等於服務正常。PreSync hook 與 sync wave 控制順序。

```callout warn selfHeal 會改回手動修改
drift 是叢集偏離 git，救火也走 git；緊急時暫停自動同步並留紀錄，止血後寫回 git 再恢復。HPA 管的 replicas 用 `ignoreDifferences`＋`RespectIgnoreDifferences=true`。
```

## G 從 kind 到 EKS
| | kind | EKS |
|---|---|---|
| 控制平面 | 容器，看得到 etcd | AWS 代管 |
| 節點 | Docker 容器 | managed node group、Karpenter、Auto Mode、Fargate |
| CNI | kindnet | VPC CNI，Pod 用真的 VPC IP，子網路要夠大 |
| 對外流量 | cloud-provider-kind | Load Balancer Controller 實作 Gateway |
| 儲存 | local-path | EBS，綁可用區 |
| 身分 | kubeconfig 憑證 | IAM 與 access entries、Pod Identity |

升級：標準支援 14 個月＋延伸支援 12 個月；一次一個小版本；每一版控制平面 → 外掛 → 節點。先查 upgrade insights、外掛相容性、會卡住 drain 的 PDB、落後的節點群組。平台團隊管叢集，你管服務。

## H 期末專題：咖啡店服務上線 {span=3}
```flow LR
(deploy.sh) -> [migration Job]: migrator 帳號，失敗就停
[migration Job] -> [helm upgrade --wait --rollback-on-failure]
[helm upgrade --wait --rollback-on-failure] -> [煙霧測試 curl -f]: 會失敗的測試
```
| 工作負載 | 物件 | 關鍵 |
|---|---|---|
| api | Deployment＋Service＋HPA＋PDB | 不輸出 replicas、三種 probe、preStop 與寬限期 |
| worker | 沒有 Service 的 Deployment | 寬限期大於最長的 job，寄送冪等 |
| migration | 每版一次的 Job | 只做 expand，加 `lock_timeout` |

- 上線準備度檢查：把老闆的話翻成可以自動檢查的條目，每一項對應一個設定、一課、一個測試。
- chart 的上線標準還有 requests 與 limits、restricted、專屬 ServiceAccount、預設拒絕的 NetworkPolicy、機密只從 Secret 來。
- 回滾用 `helm rollback`，不碰資料庫，所以 migration 只做 expand。
- 驗收在流量下做：換版、回滾、再換版、drain，錯誤數是 0；收據數等於訂單數。
- 事故照第 14 課的流程查，修在 chart，從零部署驗證；runbook 的指令都能直接執行，ADR 寫出後果與 EKS 上的做法。
