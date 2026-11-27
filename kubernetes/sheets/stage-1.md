---
title: Kubernetes 階段 1：起步：從 Compose 到叢集
subtitle: 第 1～3 課一頁圖解：期望狀態、控制迴圈、本機叢集、Pod、Deployment
cols: 3
theme: shadcn
課程: Kubernetes 第 1～3 課
---
Kubernetes 是宣告式的：你寫下期望狀態，控制器不斷讓實際狀態收斂。要改結果就改 YAML 再 apply，服務交給 Deployment 管，不直接建 Pod。[回 Kubernetes 學習地圖](../index.html)

## A Compose 做不到、Kubernetes 接手的事
| 情境 | Compose＋nginx（一台主機） | Kubernetes |
|---|---|---|
| 程序崩潰 | ok `restart: unless-stopped` 重開 | ok 容器崩潰就重開 |
| 主機當機 | no 整個服務停擺，手動或自己寫腳本 | ok 副本在別台重建 |
| 流量變三倍 | warn 手動 `--scale` 再改 upstream | ok 自動擴展（第 8 課） |
| 擴到三台主機 | no Compose 只管一台 | ok 排程器依可分配的 CPU、記憶體挑節點 |
| 不停機部署 | warn 自己寫腳本 | ok 滾動更新與回滾 |
| 多團隊共用 | no 沒有權限分隔與配額 | ok namespace、權限、資源配額 |

代價：學習成本、叢集本身要維運和升級（EKS 每個叢集每月有固定費用）、YAML 量。要不要用是取捨：一個服務、一台主機、小團隊時，Compose 加 systemd 和監控就夠。

## B 期望狀態與控制迴圈 {span=2}
```flow LR
(你) -> [API server]: 寫 YAML，kubectl apply 期望狀態
[API server] -> [(etcd)]: 存入，只有 API server 讀寫
*控制器 -> [API server]: 觀察實際狀態、比對期望狀態
控制器 -> [縮小差距的動作]: 例如少一份就補一個 Pod
[縮小差距的動作] --> 控制器: 再觀察，永不停止
```
比對並動作叫調和（reconcile），一直重複就是控制迴圈，像冷氣的恆溫器。手動 `kubectl delete pod`、`kubectl edit` 會被控制器或下一次 apply 蓋掉。

## C 叢集裡有誰
```kv cols=1
API server: 唯一入口；kubectl、控制器、scheduler、kubelet 都只跟它說話
etcd: 存所有物件的鍵值資料庫，只有 API server 讀寫
scheduler: 依 Pod 宣告的需求量挑節點，不是看當下用量
controller manager: 跑很多個控制迴圈
kubelet: 節點上的代理，叫 runtime 跑容器並回報狀態
container runtime: 真正啟動容器；kind 和 EKS 都用 containerd
kube-proxy: 設定節點網路規則，讓名字找得到一群副本
```
EKS 的 control plane 由 AWS 代管；kind 把每個節點跑成一個 Docker 容器。

## D 這門課的本機叢集與 kubeconfig {span=2}
```flow LR
[cluster.mjs up] -> [kind 叢集 learn-k8s]: 讀 kind.yaml
[kind 叢集 learn-k8s] -> [1 control-plane＋2 worker]: kindest/node v1.37.0，digest 釘住
[cluster.mjs up] -> [kubernetes/practice/.kube/config]: kubeconfig 只寫這裡
[export KUBECONFIG] -> [kubernetes/practice/.kube/config]
kubectl -> [current-context 指的叢集]: 每個指令都送去，不會再確認
```
- `kind create cluster` 會寫進 `~/.kube/config` 並切換 current-context，這門課一律用 `cluster.mjs up`；`stop`、`start`、`down` 管理叢集。
- `KUBECONFIG` 只在設定它的終端機視窗有效；腳本開頭先檢查 context，不對就停。
- Docker Desktop 記憶體上限至少設 6 GB。kind 沒有雲端負載平衡器，三個節點回報的資源數字一樣。
- 看叢集：`get`、`describe`、`api-resources`、`explain`、`-o yaml`、`-o jsonpath`。

## E Pod 的 manifest 與映像
```kv cols=1
apiVersion／kind: 物件屬於哪個 API 群組與版本、什麼種類
metadata: 名字與 label
spec: 你要的樣子；status 由叢集填
containers[].env: 值一律是字串，"0"、"true" 要加引號
containerPort: 只是宣告，不是 -p；對外靠 Service、Gateway
command／args: 換掉映像的 ENTRYPOINT／CMD
```
Pod 是最小的部署單位：容器共用 IP 與 volume、一起排到同一個節點。不知道欄位就 `kubectl explain`；寫完先跑 kubeconform 與 `--dry-run=server`。Pod 大部分欄位建立後不能改。

| 映像寫法 | 沒寫 imagePullPolicy 時 | 在 kind 上 |
|---|---|---|
| `:latest` 或沒寫 tag | 填成 Always | no 去 registry 找不到，ImagePullBackOff，kind load 過也一樣 |
| 明確 tag 或 digest | 填成 IfNotPresent | ok 用 kind load 進節點的映像 |

kind 的節點看不到 Mac 上 Docker 的映像，要 `kind load docker-image`。一律寫明確 tag 加 `imagePullPolicy: IfNotPresent`；正式環境用 commit SHA 或 digest。

## F Pod 卡住看哪裡
| 容器 Waiting reason | 通常原因 | 去哪裡看 |
|---|---|---|
| ContainerCreating | 正常過渡 | 等一下 |
| ErrImagePull、ImagePullBackOff | tag 打錯、latest、沒權限 | describe 的 Events |
| CrashLoopBackOff | 容器啟動後結束、一直被重開 | `logs --previous` |
| CreateContainerConfigError | 引用的 ConfigMap／Secret 不存在 | describe 的 Events |

phase（Pending、Running、Succeeded、Failed、Unknown）只是大方向；一直崩潰的容器，Pod 仍是 Running。`port-forward` 經過 API server、只在你的電腦有效，只用來除錯。

## G 一個 Pod 多個容器
```timeline h
initContainers | 依序執行，每個 exit 0 才換下一個 | 例如用 nc -z 真的檢查資料庫，不用 sleep 猜
*原生 sidecar | 寫在 initContainers 加 restartPolicy Always | 比主容器早啟動、晚關閉；1.33 起正式功能
containers | 主容器 | 同一個 Pod 用 localhost 互通，檔案靠共用 volume
```
sidecar 寫成 containers 的第二個容器：沒有啟停順序，用在 Job 會讓 Job 永遠不結束。兩個程式不需要 localhost 或同一個檔案就拆成兩個 Pod。

## H Deployment：副本、自我修復與換版本 {span=3}
```flow LR
*Deployment -> ReplicaSet: 名稱加 Pod 範本雜湊
ReplicaSet -> Pod: 依 spec.template 建 N 份
Pod --> ReplicaSet: ownerReferences
ReplicaSet --> Deployment: ownerReferences
```
- 單獨的 Pod 被刪或節點壞掉就不會回來；Deployment 底下的 Pod 被刪，ReplicaSet 馬上補。刪 Deployment 會連帶刪掉底下的物件。
- selector 要挑得到 template 的 label、建立後不能改、不要跟別的 Deployment 重疊（HPA、PDB、`kubectl -l` 會算錯）。用 `app.kubernetes.io/name`＋`app.kubernetes.io/instance`，不放 version。
- 節點失聯：約 50 秒後 NotReady，Pod 再等 300 秒才被驅逐重建。這段時間靠其他節點的副本撐住。數字是 1.37 的預設值，正式叢集可能調過。

```sequence
participants: 你, Deployment, 新 ReplicaSet, 舊 ReplicaSet
你 -> Deployment: 改 Pod 範本，例如 image v2
Deployment -> 新 ReplicaSet: 擴大
Deployment -> 舊 ReplicaSet: 縮小，縮到 0 但保留
你 -> Deployment: rollout status --timeout
note Deployment: 新版起不來就卡住，不會自動回滾
你 -> Deployment: rollout undo
```
只改 replicas 不產生新 revision。change-cause 要自己寫 annotation 才會出現在 `rollout history`。undo 之後要把 manifest 改回好版本，否則下次 apply 又部署壞版本。副本數改 manifest，不要靠 `kubectl scale`；要自動調整用 HPA。
