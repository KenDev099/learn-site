// AI 應用開發：LLM、RAG 與 Agent 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'ai-progress'
export const STAGES = [
  ['階段 1：LLM 基礎與第一個 API 呼叫', [
    [1, 'LLM 在做什麼：token、context window 與每次不一樣的輸出', '01-what-is-llm.html'],
    [2, '第一個 API 呼叫：Messages API、回應結構與對話歷史', '02-first-api-call.html'],
    [3, '串流：邊產生邊顯示、中斷與首字延遲', '03-streaming.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：讓輸出可靠', [
    [4, 'Prompt 設計：system prompt、資料與指令分開、範例與輸出格式', '04-prompt-design.html'],
    [5, '結構化輸出與驗證：從顧客訊息擷取訂單', '05-structured-output.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：工具與 Agent', [
    [6, 'Tool use：讓模型呼叫你的函式', '06-tool-use.html'],
    [7, 'Agent 迴圈：上限、預算、重複偵測與人工確認（資深）', '07-agent-loop.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：RAG：讓模型根據你的資料回答', [
    [8, 'RAG 是什麼：切塊與 embedding', '08-chunking-embeddings.html'],
    [9, 'pgvector：在 PostgreSQL 裡存向量與搜尋', '09-pgvector.html'],
    [10, '混合搜尋、重排與引用來源', '10-hybrid-rerank-citations.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：上線：評估、安全、成本、可靠性與可觀測性', [
    [11, '評估：eval 集、評分器與 CI 回歸測試（資深）', '11-evals.html'],
    [12, 'LLM 資安：prompt injection、資料外洩與最小權限（資深）', '12-llm-security.html'],
    [13, '成本：token 預算、prompt caching、模型選擇與批次處理', '13-cost-caching.html'],
    [14, '可靠性：逾時、重試、fallback、限流與拒答處理', '14-reliability.html'],
    [15, '可觀測性與產品化：記錄、追蹤與把串流送到前端', '15-observability-sse.html'],
  ], 'sheets/stage-5.html'],
  ['階段 6：期末專題', [
    [16, '期末專題：咖啡店客服助理（RAG＋查訂單工具＋防護＋eval＋成本報告）', '16-capstone.html'],
  ], 'sheets/stage-6.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
