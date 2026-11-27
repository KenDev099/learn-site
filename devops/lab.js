// 部署與維運 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'devops-progress'
export const STAGES = [
  ['階段 1：伺服器基本功', [
    [1, '部署與維運全貌：從 git push 到使用者', '01-big-picture.html'],
    [2, 'Shell 基本功：檔案、管線、權限與腳本', '02-shell.html'],
    [3, '程序、訊號與資源：程式跑起來之後', '03-processes-signals.html'],
    [4, '網路基礎：IP、port、DNS、TCP', '04-networking.html'],
    [5, 'HTTPS 與 TLS：憑證是怎麼被信任的', '05-tls.html'],
    [6, '在伺服器上跑服務：SSH 與 systemd', '06-ssh-systemd.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：容器化', [
    [7, '容器是什麼：映像、容器與隔離', '07-containers.html'],
    [8, 'Dockerfile：把咖啡店 API 裝進映像', '08-dockerfile.html'],
    [9, '多階段建置與映像安全', '09-multi-stage-security.html'],
    [10, 'Docker Compose：一次啟動整套服務', '10-compose.html'],
    [11, '設定與 secret：同一個映像跑在每個環境', '11-config-secrets.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：流量與擴展', [
    [12, 'Nginx 反向代理：流量的入口', '12-nginx.html'],
    [13, '無狀態與水平擴展', '13-scaling.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：自動化交付', [
    [14, 'Git 協作與救援：分支、合併、revert、bisect', '14-git.html'],
    [15, 'CI：用 GitHub Actions 自動檢查每個 PR', '15-ci.html'],
    [16, 'CD 與部署策略：不可變映像、藍綠、金絲雀、回滾', '16-cd.html'],
    [17, '部署時的資料庫 migration', '17-deploy-migrations.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：雲端與基礎設施即程式碼', [
    [18, '雲端與 AWS 核心服務：VPC、EC2、RDS、S3', '18-aws-architecture.html'],
    [19, 'AWS IAM 與帳號安全：最小權限、角色與 OIDC', '19-aws-iam.html'],
    [20, '基礎設施即程式碼：OpenTofu', '20-iac.html'],
  ], 'sheets/stage-5.html'],
  ['階段 6：可觀測性與可靠性', [
    [21, '集中 log 與錯誤追蹤', '21-logs.html'],
    [22, '指標與 SLO：用數字描述服務好不好', '22-metrics-slo.html'],
    [23, '分散式追蹤：OpenTelemetry', '23-tracing.html'],
    [24, '備份與災難復原：沒還原過的備份不算備份', '24-backup-dr.html'],
    [25, '告警、值班與事故處理', '25-alerting-incidents.html'],
  ], 'sheets/stage-6.html'],
  ['階段 7：期末專題', [
    [26, '期末專題：把咖啡店 API 安全地送上線並維運', '26-capstone.html'],
  ], 'sheets/stage-7.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
