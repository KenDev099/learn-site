// 作品專案課：課程清單。本機練習借用 nestjs/practice（data-practice="nestjs" data-task="pfNN"），引擎在 ../local.js
import { startLesson } from '../course.js'

export const KEY = 'portfolio-progress'
export const STAGES = [
  ['階段 A：小專案走完一次', [
    [1, '從需求到 schema：開一個新專案', '01-requirements-to-schema.html'],
    [2, '分層 API、驗證與錯誤格式', '02-layers-validation-errors.html'],
    [3, '測試：單元與 E2E', '03-testing.html'],
    [4, 'Docker 化：映像、Compose 與 migration', '04-docker-compose.html'],
    [5, 'CI、部署與 README：一個專案的完整樣子', '05-ci-deploy-readme.html'],
  ], 'sheets/stage-1.html'],
  ['階段 B1：多租戶 SaaS 的平台地基（先學完 auth、devops、system-design）', [
    [6, '作品規劃：範圍、架構與第一份 ADR', '06-plan-the-saas.html'],
    [7, '帳號、租戶與 token', '07-signup-login-refresh.html'],
    [8, '租戶隔離（一）：上下文與 Prisma extension', '08-tenant-isolation-prisma.html'],
    [9, '租戶隔離（二）：PostgreSQL RLS 當第二道防線', '09-rls-defense-in-depth.html'],
    [10, '成員、邀請與租戶內 RBAC', '10-members-invitations-rbac.html'],
  ], 'sheets/stage-2.html'],
  ['階段 B2：平台功能', [
    [11, '稽核紀錄', '11-audit-log.html'],
    [12, '檔案上傳', '12-file-uploads.html'],
    [13, '背景工作：匯出', '13-background-jobs.html'],
    [14, '方案、用量限制與限流', '14-plans-limits.html'],
  ], 'sheets/stage-3.html'],
  ['階段 B3：上線與作品', [
    [15, 'OpenAPI：把契約交給前端', '15-openapi-contract.html'],
    [16, '可觀測性：從一個 requestId 查到底', '16-observability.html'],
    [17, 'CI/CD 與部署', '17-ci-cd-deploy.html'],
    [18, '資安檢查：用探針攻擊自己的作品', '18-security-review.html'],
    [19, '包裝作品：README、架構圖、ADR 與 demo', '19-package-the-portfolio.html'],
  ], 'sheets/stage-4.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
