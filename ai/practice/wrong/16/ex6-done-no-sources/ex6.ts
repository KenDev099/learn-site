// 練習 6：HTTP 端點：身分、限流、驗證、功能旗標，最後用 SSE 把結果送給前端
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Session, TenantLimiter } from './kit.ts'
import type { Reply } from './ex3.ts'

export const MAX_QUESTION_CHARS = 2000
export const FALLBACK_TEXT = 'AI 客服暫停服務，請直接詢問店員，或撥打門市電話。'
export const ERROR_TEXT = '系統暫時有問題，請稍後再試，或直接詢問店員。'

export type ChatDeps = {
  makeAssistant: (session: Session) => { ask(question: string): Promise<Reply> }   // 練習 3 的 createAssistant，其他 deps 已經綁好
  limiter: TenantLimiter
  enabled: () => boolean      // 功能旗標：false 時不呼叫模型，回固定訊息（模型供應商出事時的回退方式）
}

// 已經寫好，不用改：讀 JSON 本體、回 JSON、寫一個 SSE 事件（每個事件以空行結尾）
async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = ''
  for await (const part of req) raw += part
  try { return JSON.parse(raw) } catch { return null }
}
function sendJson(res: ServerResponse, status: number, body: object) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body))
}
function sendEvent(res: ServerResponse, event: string, data: object) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// POST /chat，依序檢查：
// 1. 其他路徑或方法：404 JSON
// 2. 身分：header x-customer-id 要是正整數（正式環境由登入的 session 提供，這裡模擬），不是就 401 JSON；
//    body 裡就算有 customerId 也不能用（顧客自己填得了）
// 3. 限流：limiter.take(String(customerId)) 是 false 就 429 JSON
// 4. body 要是 { question: 非空字串 }，長度（Array.from）不能超過 MAX_QUESTION_CHARS，不是就 400 JSON
// 5. 回 200，content-type: text/event-stream、cache-control: no-cache，然後：
//    enabled() 是 false：delta { text: FALLBACK_TEXT }、done { status: 'disabled', sources: [] }，不建立助理
//    否則先送 status { text: '查詢中…' }，再 makeAssistant({ customerId }).ask(question)，
//    送 delta { text: answer }、done { status, sources }；ask 丟錯就送 error { message: ERROR_TEXT }（不送內部錯誤訊息）
//    最後 res.end()
// JSON 錯誤回應的格式：{ error: '說明' }
export function createChatServer(deps: ChatDeps): Server {
  return createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/chat') return sendJson(res, 404, { error: '找不到' })
    const header = String(req.headers['x-customer-id'] ?? '')
    if (!/^[1-9]\d*$/.test(header)) return sendJson(res, 401, { error: '請先登入' })
    const customerId = Number(header)
    if (!deps.limiter.take(String(customerId))) return sendJson(res, 429, { error: '問得太快了，請稍後再試' })
    const body = await readJson(req) as { question?: unknown } | null
    const question = body?.question
    if (typeof question !== 'string' || question.trim() === '' || Array.from(question).length > MAX_QUESTION_CHARS) {
      return sendJson(res, 400, { error: `question 要是 1～${MAX_QUESTION_CHARS} 字的文字` })
    }
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' })
    if (!deps.enabled()) {
      sendEvent(res, 'delta', { text: FALLBACK_TEXT })
      sendEvent(res, 'done', { status: 'disabled', sources: [] })
      return res.end()
    }
    sendEvent(res, 'status', { text: '查詢中…' })
    try {
      const out = await deps.makeAssistant({ customerId }).ask(question)
      sendEvent(res, 'delta', { text: out.answer })
      sendEvent(res, 'done', { status: out.status })
    } catch {
      sendEvent(res, 'error', { message: ERROR_TEXT })
    }
    res.end()
  })
}
