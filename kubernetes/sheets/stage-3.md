---
title: Kubernetes 階段 3：穩定上線
subtitle: 第 7～10 課一頁圖解：probe、優雅關機、資源、HPA、滾動更新、PDB、Job、CronJob
cols: 3
theme: shadcn
課程: Kubernetes 第 7～10 課
---
把服務的真實狀態告訴叢集。probe 決定流量與重啟，resources 決定排程與上限。滾動更新與 PDB 控制一次少幾個，Job 讓 migration 在新版上線前跑完。[回 Kubernetes 學習地圖](../index.html)

## A 三種 probe
| probe | 問什麼 | 失敗的後果 | 檢查 |
|---|---|---|---|
| startupProbe | 啟動完了沒 | 超過次數就重啟；成功前另外兩個不跑 | `/health/live` |
| readinessProbe | 能接流量嗎 | ok 只移出端點，不重啟 | `/health/ready`，必要的依賴 |
| livenessProbe | 卡死了嗎 | warn 重啟容器 | `/health/live`，只看程序本身 |

沒有 readinessProbe 時，容器一啟動 Pod 就算 Ready。`periodSeconds × failureThreshold` 決定多久發現問題；`timeoutSeconds` 要比健康檢查端點自己的等待長。

```callout err liveness 不要檢查依賴
資料庫一抖，所有 Pod 同時重啟，事故被放大。依賴交給 readiness；不確定要不要 liveness 時，寧可不設。慢啟動用 startupProbe，不要拉長 initialDelaySeconds。
```

## B Pod 終止：兩條線同時開始 {span=2}
```sequence
participants: Pod 刪除, EndpointSlice 控制器, kube-proxy 與 Gateway, kubelet, 應用程式
note Pod 刪除: 標記 Terminating，寬限期開始倒數
Pod 刪除 -> EndpointSlice 控制器: 同時開始
EndpointSlice 控制器 -> kube-proxy 與 Gateway: 標成不再 ready
kube-proxy 與 Gateway -> kube-proxy 與 Gateway: 更新轉送規則，通常要幾秒
Pod 刪除 -> kubelet: 同時開始
kubelet -> kubelet: preStop sleep，等轉送規則更新
kubelet -> 應用程式: SIGTERM 送到 PID 1
應用程式 -> 應用程式: 排空：readiness 回 503、做完手上的請求、關連線池
note kubelet: 寬限期到了還沒結束就 SIGKILL
```
沒有 preStop：應用收到 SIGTERM 就關門，其他節點的規則還沒更新，新連線被拒。
- `terminationGracePeriodSeconds` ≥ preStop＋最長的請求＋收尾時間；寬限期從 preStop 開始算。
- CMD 用 exec 形式；`sh -c` 時 PID 1 是 shell，SIGTERM 不會轉給 node。
- 沒有 HTTP 流量的 worker 不需要 preStop，寬限期要大於最長的 job。

## C 資源的 requests 與 limits
| 症狀 | 怎麼確認 | 原因 |
|---|---|---|
| Pod 一直 Pending | describe 的 `Insufficient cpu／memory` | no requests 放不下 |
| RESTARTS 增加、請求被斷線 | lastState `OOMKilled`、exit code 137 | no 記憶體超過 limit |
| 延遲變高、Pod 都正常 | `kubectl top` 的 CPU 貼著 limit | warn CPU 被節流，不重啟 |

requests 是保留量，排程器只看它，也是 HPA 使用率的分母。API 常見做法：CPU 只設 requests，記憶體 requests 與 limits 都設。Node 服務用 `--max-old-space-size` 把 heap 上限設在記憶體 limit 的 70～75%。單位：`128Mi` 不等於 `128M`，`128m` 是 0.128 byte。

## D QoS 與 namespace 的防護
| QoS 類別 | 條件 | 節點記憶體不足時 |
|---|---|---|
| Guaranteed | 每個容器的 CPU 與記憶體都設 requests ＝ limits | ok 最後被驅逐 |
| Burstable | 寫了 requests 或 limits 但不符合上面 | warn 超過 requests 越多越先走 |
| BestEffort | 完全沒寫 | no 第一個被驅逐 |

```kv cols=1
LimitRange: 替沒寫 resources 的容器補預設值
ResourceQuota: 限制 namespace 總量；超過時 ReplicaSet 建 Pod 被拒，原因在事件
量測: metrics-server、kubectl top 與監控，先量再設
in-place resize: 1.35 起可以不重建 Pod 調整資源
```

## E HPA 怎麼算副本數 {span=2}
$$ \text{期望副本數} = \left\lceil \text{目前副本數} \times \frac{\text{目前使用率}}{\text{目標使用率}} \right\rceil $$

```flow LR
[metrics-server] -> *HPA: 平均使用率，以 requests 為分母
HPA -> {比值在 10% 容忍度內?}
{比值在 10% 容忍度內?} -> [不動作]: 是
{比值在 10% 容忍度內?} -> [夾在 minReplicas 與 maxReplicas]: 否
[夾在 minReplicas 與 maxReplicas] -> [改 Deployment 的 replicas]: 擴容立刻；縮容回看 300 秒取最高
```
- 從 manifest 移除 `replicas`，否則每次 apply 都跟 HPA 搶；容器要有 requests 與 readinessProbe。
- HPA 不會加機器：節點不夠靠 Cluster Autoscaler／Karpenter；佇列 worker 用 KEDA。

## F 滾動更新與壞版本
| replicas | maxSurge／maxUnavailable | 最多幾個 Pod | 最少幾個可用 |
|---|---|---|---|
| 4 | 預設 25%／25%（＝1／1） | 5 | warn 3 |
| 4 | 1／0 | 5 | ok 4 |
| 3 | 預設 25%／25%（＝1／0） | 4 | ok 3 |

百分比時 surge 進位、unavailable 捨去。maxUnavailable 0、maxSurge 1 是安全的預設；`minReadySeconds` 讓新 Pod 穩定一段時間才算可用；Recreate 只用在新舊版不能並存時。

```callout warn Kubernetes 不會自動回滾
壞版本最多吃掉 maxUnavailable 的容量；progressDeadlineSeconds 到了只標成 ProgressDeadlineExceeded。部署腳本：`if ! rollout status --timeout` → `rollout undo` → 等回滾完成 → `exit 1`。
```
更新期間兩個版本同時在線：API 只增不刪，schema 照 expand／contract，contract 不和程式變更放同一次部署。

## G 節點維護：PDB 與分散 {span=2}
```flow LR
[kubectl drain] -> [cordon 標成不可排程]
[cordon 標成不可排程] -> [驅逐 API]: 逐一驅逐 Pod
[驅逐 API] -> {PDB 預算夠?}
{PDB 預算夠?} -> [Pod 正常關機，別處重建]: 夠
{PDB 預算夠?} -> [回 429，drain 稍後重試]: 不夠
```
| 中斷 | 例子 | 靠什麼撐住 |
|---|---|---|
| 自願 | drain、節點升級、Karpenter 整併 | ok PDB `maxUnavailable: 1` |
| 非自願 | 節點當機 | warn PDB 不參與；靠多副本、分散、readiness |

PDB 不要設得跟副本數一樣，否則節點維護永遠卡住。`topologySpreadConstraints` 讓副本平均分散；有 taint 的節點要用 `nodeTaintsPolicy: Honor` 排除，否則 Pod Pending、drain 卡住。

## H Job、migration 與 CronJob {span=3}
```flow LR
(部署開始) -> [migration Job migrate-v2]: 每個版本一個新名稱
[migration Job migrate-v2] -> {Complete 或 Failed?}
{Complete 或 Failed?} -> [滾動更新應用]: Complete
{Complete 或 Failed?} -> [停止部署，exit 1]: Failed，線上仍是舊版
```
| 欄位 | 作用 |
|---|---|
| `restartPolicy` | Never 或 OnFailure，不能用 Always |
| `backoffLimit` | 重試次數，預設 6，等待逐次加倍；migration 設 0 或 1 |
| `activeDeadlineSeconds` | 防止卡住 |
| `ttlSecondsAfterFinished` | 結束後自動清理 |
| `podFailurePolicy` | 依結束碼或 Pod 狀況 FailJob、Ignore、Count；需要 Never |
| CronJob `timeZone` | 寫明時區；沒寫用 kube-controller-manager 的時區，雲端與 kind 通常是 UTC |
| `concurrencyPolicy` | Allow（預設）、Forbid、Replace，依工作性質選 |

migration 只做舊版也相容的 expand，設 `lock_timeout`；部署腳本同時看 Complete 和 Failed。CronJob 再設 `startingDeadlineSeconds` 與 history limit；補跑用 `kubectl create job --from=cronjob/…`。Job 是「至少一次」，工作要冪等：報表 UPSERT、寄信先查紀錄、migration 記錄跑過的檔案。
