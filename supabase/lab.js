// Supabase 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'supabase-progress'
export const STAGES = [
  ['階段 1：起步：一個 Postgres 加上一組服務', [
    [1, 'Supabase 是什麼：一個 Postgres 加上一組服務', '01-what-is-supabase.html'],
    [2, '表與自動產生的 API：supabase-js 的查詢、關聯與型別', '02-data-api.html'],
    [3, 'API key、角色與 GRANT：誰能碰到哪張表', '03-keys-roles-grants.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：權限：Row Level Security', [
    [4, 'RLS 實戰：auth.uid()、USING 與 WITH CHECK，以及 API 看到的結果', '04-rls-basics.html'],
    [5, 'RLS 常見模式：多租戶、角色、security definer、view 與漏洞清單', '05-rls-patterns.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：Auth 與檔案', [
    [6, 'Auth：登入、session、伺服器端驗證與 profiles', '06-auth-sessions.html'],
    [7, 'Storage：bucket、policy、signed URL 與上傳', '07-storage.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：伺服器端邏輯與上線', [
    [8, '伺服器端邏輯放哪裡：資料庫函式（RPC）與 Edge Functions', '08-rpc-edge-functions.html'],
    [9, '期末專題：咖啡店點餐上線，修好權限漏洞，決定要不要留在 Supabase', '09-capstone.html'],
  ], 'sheets/stage-4.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
