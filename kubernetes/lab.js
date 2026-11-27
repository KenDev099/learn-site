// Kubernetes 實戰 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'kubernetes-progress'
export const STAGES = [
  ['階段 1：起步：從 Compose 到叢集', [
    [1, '為什麼需要 Kubernetes：期望狀態、控制迴圈與本機叢集', '01-why-kubernetes.html'],
    [2, '第一個 Pod：映像、YAML 與 kubectl apply', '02-pods-yaml.html'],
    [3, 'Deployment 與 ReplicaSet：副本、自我修復與標籤', '03-deployments.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：網路與設定', [
    [4, 'Service 與叢集內 DNS：用名字找到會變動的 Pod', '04-services-dns.html'],
    [5, '對外流量：Gateway API（以及 Ingress 為什麼退場）', '05-gateway-api.html'],
    [6, 'ConfigMap 與 Secret：設定與機密', '06-config-secrets.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：穩定上線', [
    [7, '健康檢查與優雅關機：流量只送給準備好的 Pod', '07-probes-shutdown.html'],
    [8, '資源與自動擴展：requests、limits、OOMKilled 與 HPA', '08-resources-autoscaling.html'],
    [9, '不停機部署：滾動更新、回滾與 PodDisruptionBudget（資深）', '09-rollouts-pdb.html'],
    [10, 'Job 與 CronJob：資料庫 migration、批次與排程', '10-jobs-cronjobs.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：資料、安全與打包', [
    [11, '儲存與有狀態服務：PVC、StatefulSet，以及資料庫為什麼放 RDS', '11-storage.html'],
    [12, '權限與隔離：RBAC、ServiceAccount、NetworkPolicy 與 Pod Security（資深）', '12-security.html'],
    [13, 'Helm 打包與多環境設定（對照 Kustomize）', '13-helm.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：正式環境與期末專題', [
    [14, '除錯工作流程：從 Pod 狀態到根因（資深）', '14-debugging.html'],
    [15, 'GitOps 與 EKS：正式環境的叢集怎麼運作（資深）', '15-gitops-eks.html'],
    [16, '期末專題：把咖啡店 NestJS 服務搬上 Kubernetes 並處理事故', '16-capstone.html'],
  ], 'sheets/stage-5.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
