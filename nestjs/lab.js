// NestJS 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'nestjs-progress'
export const STAGES = [
  ['階段 1：從 Node 到 NestJS（框架的骨架）', [
    [1, '為什麼要框架：第一個 NestJS 專案', '01-why-nestjs.html'],
    [2, 'Controller：路由、參數與回應', '02-controllers.html'],
    [3, 'Provider 與依賴注入', '03-providers-di.html'],
    [4, 'Module：切分功能與封裝', '04-modules.html'],
    [5, '單元測試：Vitest 與 Testing Module', '05-unit-testing.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：請求管線與測試', [
    [6, '請求生命週期（一）：middleware 與 guard', '06-middleware-guards.html'],
    [7, 'Pipe 與 DTO 驗證', '07-pipes-validation.html'],
    [8, '例外與 exception filter：一致的錯誤格式', '08-exception-filters.html'],
    [9, 'Interceptor 與 RxJS 入門', '09-interceptors-rxjs.html'],
    [10, 'E2E 測試：從 HTTP 測整個應用', '10-e2e-testing.html'],
    [11, '設定管理：環境變數、驗證與 secret', '11-configuration.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：資料庫（Docker、Prisma 7 ＋ PostgreSQL）', [
    [12, 'Docker 入門：用容器跑 PostgreSQL 與 Redis', '12-docker-services.html'],
    [13, 'Prisma 入門：schema、migration 與 Prisma Client', '13-prisma-setup.html'],
    [14, 'CRUD、關聯與 Prisma 錯誤', '14-prisma-crud-relations.html'],
    [15, '交易與並發：庫存不能賣超', '15-transactions-concurrency.html'],
    [16, '查詢效能：N+1、分頁、索引與原生 SQL 報表', '16-query-performance.html'],
    [17, '資料庫整合測試與測試資料', '17-db-integration-tests.html'],
    [18, '分層、領域邏輯與交易邊界', '18-layering-domain.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：快取、背景工作與外部整合', [
    [19, '快取與 Redis', '19-caching-redis.html'],
    [20, '佇列與背景工作：BullMQ', '20-queues-bullmq.html'],
    [21, '排程與事件', '21-scheduling-events.html'],
    [22, '檔案上傳與 webhook', '22-uploads-webhooks.html'],
    [23, 'OpenAPI 文件與 API 演進', '23-openapi-versioning.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：上線、維運與架構（資深）', [
    [24, '日誌、健康檢查與優雅關機', '24-observability-shutdown.html'],
    [25, '除錯與效能：從錯誤訊息到事件迴圈', '25-debugging-performance.html'],
    [26, '模組邊界與架構決策', '26-architecture.html'],
    [27, '期末專題：咖啡店訂單 API', '27-capstone.html'],
  ], 'sheets/stage-5.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
