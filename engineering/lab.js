// 資深工程師的工作方法 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'engineering-progress'
export const STAGES = [
  ['階段 1：從需求到交付：釐清、驗收、估計與溝通', [
    [1, '需求釐清：從模糊需求到業務規則與例外情境', '01-clarifying-requirements.html'],
    [2, '驗收條件與範圍切分：Given/When/Then、MVP 與垂直切片', '02-acceptance-criteria-slicing.html'],
    [3, '估工：拆解工作、估區間與處理不確定性', '03-estimating-work.html'],
    [4, '交付溝通：進度回報、風險升級與範圍協商', '04-delivery-communication.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：接手舊程式：讀懂、鎖住、安全修改', [
    [5, '接手既有系統：讀程式、追資料流、確認實際行為', '05-taking-over-code.html'],
    [6, '特徵測試與安全重構：先鎖住行為再小步修改', '06-characterization-refactoring.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：放大影響力：寫作、帶人與 AI 輔助', [
    [7, '技術寫作：提案摘要、操作手冊與交接文件', '07-technical-writing.html'],
    [8, '帶人與知識傳承：onboarding、可執行的回饋、在 code review 裡教人', '08-mentoring.html'],
    [9, '用 AI 輔助開發：驗證產出、測試、資安與機密風險', '09-ai-assisted-development.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：期末專題', [
    [10, '期末專題：接手咖啡店舊專案的一個需求變更，從釐清需求到交付', '10-capstone.html'],
  ], 'sheets/stage-4.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
