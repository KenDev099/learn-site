// Node.js 核心 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'node-progress'
export const STAGES = [
  ['階段 1：Node 與開發環境', [
    [1, 'Node 是什麼：在瀏覽器外跑 JavaScript', '01-what-is-node.html'],
    [2, '程序與設定：參數、環境變數、輸出入與結束碼', '02-process-config.html'],
    [3, 'npm 與套件：semver、lockfile 與供應鏈', '03-npm-packages.html'],
    [4, '模組系統：ESM、CommonJS 與套件解析', '04-modules.html'],
    [5, '用 Node 跑 TypeScript', '05-typescript-in-node.html'],
    [6, '測試與除錯入門', '06-testing-debugging.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：非同步與 event loop', [
    [7, 'Node 的 event loop', '07-event-loop.html'],
    [8, 'EventEmitter 與取消', '08-events-cancellation.html'],
    [9, '別卡住 event loop：worker 與子程序', '09-blocking-and-workers.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：檔案與位元組', [
    [10, '檔案系統：路徑、錯誤碼與原子寫入', '10-file-system.html'],
    [11, 'Buffer 與編碼', '11-buffer-encoding.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：HTTP 服務', [
    [12, 'HTTP 協定與 curl', '12-http-protocol.html'],
    [13, '用 node:http 寫伺服器', '13-http-server.html'],
    [14, 'REST API 設計', '14-rest-api-design.html'],
    [15, 'HTTP 快取與條件請求', '15-http-caching.html'],
    [16, 'Stream 與背壓', '16-streams-backpressure.html'],
    [17, '呼叫外部 API：逾時、重試與併發', '17-calling-external-apis.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：上線前的準備', [
    [18, '錯誤處理策略', '18-error-handling.html'],
    [19, '結構化 log 與 request context', '19-structured-logging.html'],
    [20, '連接 PostgreSQL：連線池與交易', '20-postgres-pool-transactions.html'],
    [21, '優雅關機與健康檢查', '21-graceful-shutdown.html'],
    [22, '測試策略：mock、假時鐘與假上游', '22-testing-strategy.html'],
  ], 'sheets/stage-5.html'],
  ['階段 6：資深工程師的功課', [
    [23, '效能分析與記憶體洩漏', '23-profiling-memory.html'],
    [24, '多核心與水平擴展', '24-scaling.html'],
    [25, 'Node 安全', '25-security.html'],
    [26, '期末專題：不用框架的咖啡店訂單 API', '26-capstone.html'],
  ], 'sheets/stage-6.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
