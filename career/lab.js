// 面試與職涯 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'career-progress'
export const STAGES = [
  ['階段 1：看懂流程，準備材料', [
    [1, '招聘流程：每一關在檢查什麼', '01-hiring-process.html'],
    [2, '履歷：用數字寫出影響力', '02-resume-impact.html'],
    [3, '作品集與 GitHub：把期末專題變成看得懂的作品', '03-portfolio-github.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：面試實戰', [
    [4, '行為面試：STAR 與故事庫', '04-behavioral-star.html'],
    [5, '現場寫程式：邊寫邊說，一起解題', '05-live-coding.html'],
    [6, '帶回家作業：範圍、測試、README 與取捨說明', '06-take-home.html'],
    [7, '系統設計面試：45 分鐘的流程與限時演練（資深）', '07-system-design-interview.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：Offer 與職涯成長', [
    [8, '評估 offer 與談薪：算清楚總報酬、問對問題', '08-offers-negotiation.html'],
    [9, '走向資深與 staff：範圍、主導、影響力與可持續的節奏（資深）', '09-senior-growth.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：期末專題', [
    [10, '期末專題：轉職全端的求職包與第一年成長計畫', '10-capstone.html'],
  ], 'sheets/stage-4.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
