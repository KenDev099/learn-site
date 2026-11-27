---
title: Kubernetes 階段 4：資料、安全與打包
subtitle: 第 11～13 課一頁圖解：PVC、StatefulSet、RDS、RBAC、NetworkPolicy、Pod Security、Helm、Kustomize
cols: 3
theme: shadcn
課程: Kubernetes 第 11～13 課
---
資料放在活得比 Pod 久的地方，正式資料庫交給 RDS；權限、網路、Pod 內容各有一道關，只開需要的路；多環境用一份範本加每個環境的差異。[回 Kubernetes 學習地圖](../index.html)

## A 資料放在哪裡會不見 {span=2}
```timeline h
容器可寫層 | 到容器重啟為止 | 暫存檔也不要寫這裡
emptyDir | 到 Pod 刪除為止 | 暫存資料，設 sizeLimit
*PersistentVolume | 活過 Pod | 新 Pod 掛回同一個 PV，資料都在
```
```flow LR
Pod -> PVC: claimName
PVC -> StorageClass: 沒有對應的 PV
StorageClass -> [CSI driver]: 動態建立
[CSI driver] -> *PV: 例如 EBS 磁碟
PVC --> PV: Bound
```
WaitForFirstConsumer 讓磁碟建在 Pod 所在的節點或可用區；綁定後 Pod 只能待在那裡。暫存檔放 emptyDir 並設 `sizeLimit`，搭配 `readOnlyRootFilesystem` 讓其他地方都不能寫；長期檔案放 S3。

## B 存取模式（access mode）與回收政策（reclaim policy）
| 存取方式 | 意思 | 常見的儲存 |
|---|---|---|
| ReadWriteOnce | 同時只能掛在一個節點 | EBS、local-path，雲端磁碟多半是它 |
| ReadWriteOncePod | 只有一個 Pod 能掛 | 要 CSI driver 支援 |
| ReadWriteMany | 多個節點同時讀寫 | EFS、NFS |

多副本共享檔案優先用 S3。

```callout warn reclaim policy 預設 Delete
PVC 刪了磁碟就沒了；刪 namespace 會刪掉裡面所有 PVC。Retain 只是多一層保護，能救回資料的是備份。
```

## C Deployment 掛磁碟與 StatefulSet
| | Deployment | StatefulSet |
|---|---|---|
| Pod 名稱 | 隨機，重建就換 | 固定 `pg-0`、`pg-1` |
| DNS | 只有 Service 名稱 | headless Service 給 `pg-0.pg` |
| 磁碟 | 所有副本共用同一個 PVC | `volumeClaimTemplates` 每個 Pod 一個 |
| 啟動 | 同時 | 預設依序 |
| Pod 重建後 | 新名字、新身分 | 同一個名字，掛回同一個 PVC |

Deployment 掛一顆 RWO 磁碟：1 個副本、`strategy.type: Recreate`。刪除 StatefulSet 預設保留 PVC。StatefulSet 不會複寫資料，誰是主節點、怎麼切換是資料庫自己的事。

## D 正式資料庫放哪裡
| 工作 | RDS／ElastiCache | 叢集裡自己跑 |
|---|---|---|
| 備份與 PITR | ok 自動 | warn 自己寫 Job、自己演練還原 |
| 主節點故障 | ok Multi-AZ 自動切換 | no 自己設複寫；EBS 綁可用區 |
| 升級與修補 | ok 維護時段套用 | warn 自己換映像、自己測 |
| 費用 | warn 比同規格 EC2 高 | warn 機器便宜，其他都是人力 |

咖啡店正式環境用 RDS 與 ElastiCache；要自管就用 operator，仍要懂資料庫維運。叢集內的 postgres 只給開發與測試。應用連固定名稱 `db`，用 ExternalName（CNAME）指到外部；要驗證 TLS 主機名稱時，改由每個環境的設定提供真正的端點。

## E 請求進叢集的三道關與 RBAC {span=2}
```flow LR
[kubectl、CI、Pod] -> [認證：你是誰]
[認證：你是誰] -> [授權 RBAC：能不能做]
[授權 RBAC：能不能做] -> [准入 PSA：內容合不合規]
[准入 PSA：內容合不合規] -> *[API server 接受請求]
[授權 RBAC：能不能做] -> [403 Forbidden]: 沒有規則允許
```
Pod 之間的連線另外由 NetworkPolicy 控制。RBAC 只有允許：Role／ClusterRole 列出 apiGroup × 資源 × verb，RoleBinding／ClusterRoleBinding 綁給身分。

```callout warn 最小權限的陷阱
不用 `*`；不碰 Secret，list 也算讀；exec 與建立 Pod 都是高權限；內建的 edit 可以讀寫 Secret。寫完用 `kubectl auth can-i … --as system:serviceaccount:<ns>:<名稱>` 驗證。
```

## F ServiceAccount 與 NetworkPolicy
- ServiceAccount 是 Pod 的身分，kubelet 掛進有期限、會輪替的 projected token。每個應用用自己的 ServiceAccount，不呼叫 API 的設 `automountServiceAccountToken: false`；只需要特定物件時用 `resourceNames`。
- NetworkPolicy：被選到的方向只剩列出的流量，兩端都要允許。做法是預設拒絕＋放行 DNS＋逐條打開需要的路。
- 同一個元素裡的 namespaceSelector 與 podSelector 是「而且」，多一個 `-` 就變成「或」。
- 要 CNI 支援才有效，不支援時物件照樣建立、什麼都不擋。

```callout err 預設拒絕把 DNS 也擋了
log 出現 `EAI_AGAIN`：不是資料庫掛了，是名字查不到。放行 kube-system 裡 CoreDNS 的 UDP／TCP 53。
```

## G Pod Security 與 AWS 權限
| 等級 | 給誰用 |
|---|---|
| privileged | kube-system、CNI、儲存外掛 |
| baseline | 還沒改完的舊應用 |
| restricted | 一般應用，咖啡店的目標 |

restricted 要 `runAsNonRoot`、`allowPrivilegeEscalation: false`、`drop: [ALL]`、seccomp `RuntimeDefault`。enforce 只擋 Pod：Deployment 建立成功卻沒有 Pod，所以 warn 要設成跟 enforce 一樣。

| AWS 權限做法 | 結果 |
|---|---|
| access key 放進 Secret | no 長期金鑰外洩難察覺 |
| 加在節點 IAM 角色 | no 同節點每個 Pod 都拿得到 |
| Pod Identity 或 IRSA | ok ServiceAccount 對應最小權限的 IAM 角色 |

## H Helm 與 Kustomize {span=3}
```flow LR
[values.yaml] -> [values-prod.yaml]: -f 只寫差異
[values-prod.yaml] -> [--set image.tag]: 部署時傳入
[--set image.tag] -> [templates 產生 YAML]
[templates 產生 YAML] -> *[release revision]: 存在 namespace 的 Secret
```
| 比較 | Helm | Kustomize |
|---|---|---|
| 做法 | 範本＋values | base＋overlay，`kubectl apply -k` |
| 版本紀錄與回滾 | ok history、rollback 內建 | warn 靠 git 或 rollout undo |
| 設定改了觸發滾動更新 | checksum annotation 放 Pod 範本 | configMapGenerator 名稱帶雜湊 |
| 適合 | 安裝第三方軟體、發佈給別人用 | 環境之間只差 tag、副本數、資源 |

- chart＝Chart.yaml（`version` 是 chart 的版本、`appVersion` 是應用程式的版本）＋values.yaml＋templates；共用名稱與 labels 放 `_helpers.tpl`，selector 只放 name 與 instance。
- 部署前跑 `helm template`、`helm lint`、kubeconform；縮排錯 lint 照樣通過。`image.tag` 用 `required`，機密參照既有的 Secret。
- `helm upgrade --install --wait --timeout 3m --rollback-on-failure` 一個指令完成部署、等待與失敗回滾。Helm 4 新安裝預設 server-side apply。
- 三個陷阱：Pod 範本的 checksum annotation、開 HPA 不輸出 replicas、migration 用 pre-upgrade hook 或由部署腳本先跑。兩者可以混用，一個團隊選一種主要做法。
