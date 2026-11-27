// 實戰：咖啡店產品交付 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'delivery-progress'
export const STAGES = [
  ['階段 1：接手與第一個需求', [
    [1, '接手專案：把系統跑起來、讀 README、追一筆訂單從畫面到資料庫', '01-onboarding.html'],
    [2, '第一張需求單：釐清、驗收條件、切任務、寫 PR 說明', '02-first-ticket.html'],
    [3, '跨層功能：從資料表、API 到 Vue 畫面（預約取餐時間）', '03-pickup-time.html'],
    [4, '前後端契約與不同步發布：新增欄位的相容順序、共用型別、舊版前端仍在線上', '04-contracts-releases.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：修問題', [
    [5, '沒有重現步驟的 bug：從使用者回報與 log 找證據、重現、修復、補回歸測試', '05-bug-without-repro.html'],
    [6, '修好失敗的 CI：型別錯誤、flaky test、lockfile 與環境差異', '06-fix-ci.html'],
    [7, '審查別人的 PR：找出缺陷並寫出可執行的 review 意見', '07-code-review.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：錢與資料', [
    [8, '串接付款服務：結果不明、重複通知與漏通知、對帳與補單', '08-payments.html'],
    [9, '正式資料修復與回填：dry-run、批次、核對、可續跑與撤回', '09-data-repair.html'],
    [10, '依賴升級：讀 changelog、處理破壞性變更、分批上線', '10-dependency-upgrade.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：上線與維運', [
    [11, '尖峰前的壓測與容量驗證', '11-load-test.html'],
    [12, '線上事故演練：定位、止血、復原、事後檢討', '12-incident-drill.html'],
    [13, '期末專題：獨立交付一個跨層需求，附驗收報告與自評', '13-capstone.html'],
  ], 'sheets/stage-4.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
