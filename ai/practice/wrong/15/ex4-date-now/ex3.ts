// 練習 3、4：把模型的串流用 SSE 轉送給前端
import http from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { MODEL, SYSTEM } from './lib.ts'
import { toLogRecord } from './ex1.ts'
import type { LlmLog } from './ex1.ts'

export const MAX_QUESTION = 2000
export const PROMPT_VERSION = 'support-v1'
// 串流出錯時給使用者看的固定訊息：不能帶內部細節（錯誤類型、堆疊、request id 以外的東西）
export const USER_ERROR = '助理暫時無法回答，請稍後再試。'

export type ChatDeps = {
  log?: (record: LlmLog) => void   // 練習 4：每個請求結束時呼叫一次
  now?: () => number               // 練習 4：計時用，測試會傳入假時鐘
}

// 已經寫好，不用改：讀完請求本體，回傳字串
export async function readBody(req: http.IncomingMessage): Promise<string> {
  let body = ''
  for await (const chunk of req) body += chunk
  return body
}

// 已經寫好，不用改：回一個 JSON（400、404 用）
export function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

// 練習 3：
// - 只處理 POST /chat，其他回 404 JSON
// - 本體是 JSON { question }：解析失敗、question 不是字串、trim 後是空字串、超過 MAX_QUESTION 個字元 → 400 JSON { error: '…' }，不呼叫 API
// - 通過後回 200，標頭 Content-Type: text/event-stream、Cache-Control: no-cache（再加 X-Accel-Buffering: no），
//   接著 res.flushHeaders() 先把標頭送出（不然要等第一次 write 才送，前端在模型思考時什麼都收不到）
// - 用 client.messages.stream 送出（MODEL、max_tokens 16000、system: SYSTEM、一則 user 訊息 = question）
// - 每收到一段文字，馬上送一個 delta 事件，data 是 {"text": 那段文字}
// - 正常結束送 done 事件，data 是 {"outputTokens": …, "stopReason": …}，然後結束回應
// - 出錯送 error 事件，data 是 {"message": USER_ERROR}，然後結束回應
// - 每個事件的格式：event: 名稱\ndata: JSON\n\n（最後一定要有空行）
// 練習 4：
// - 前端斷線（回應的 'close' 事件，而且回應還沒送完）時中斷上游：把 AbortSignal 傳給 SDK
// - 每個請求結束時呼叫一次 deps.log(toLogRecord({...}))：route '/chat'、PROMPT_VERSION、MODEL、
//   startedAt／endedAt／ttftMs 用 deps.now 量、成功時 message、失敗時 error、requestId（stream.request_id）、question、answer（已經送出的文字）
// - 斷線後不能有未處理的錯誤
function sendEvent(res: http.ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export function createChatServer(client: Anthropic, deps: ChatDeps = {}): http.Server {
  const now = Date.now
  return http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/chat') return sendJson(res, 404, { error: '找不到這個路徑' })
    let question: unknown
    try {
      question = JSON.parse(await readBody(req)).question
    } catch {
      return sendJson(res, 400, { error: '本體要是 JSON' })
    }
    if (typeof question !== 'string' || !question.trim()) return sendJson(res, 400, { error: '請輸入問題' })
    if (question.length > MAX_QUESTION) return sendJson(res, 400, { error: `問題不能超過 ${MAX_QUESTION} 個字` })

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()   // 標頭先送出：前端馬上知道連線成功，可以顯示「正在輸入」
    // 前端斷線：回應關閉了卻還沒送完 → 中斷上游，不再產生、不再計費
    const upstream = new AbortController()
    res.on('close', () => {
      if (!res.writableFinished) upstream.abort()
    })

    const startedAt = now()
    let ttftMs: number | null = null
    let answer = ''
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content: question }],
    }, { signal: upstream.signal })
    stream.on('text', text => {
      ttftMs ??= now() - startedAt
      answer += text
      sendEvent(res, 'delta', { text })
    })
    const base = { route: '/chat', promptVersion: PROMPT_VERSION, model: MODEL, startedAt, question } as const
    try {
      const message = await stream.finalMessage()
      sendEvent(res, 'done', { outputTokens: message.usage.output_tokens, stopReason: message.stop_reason })
      deps.log?.(toLogRecord({ ...base, endedAt: now(), ttftMs, message, requestId: stream.request_id, answer }))
    } catch (error) {
      // 斷線時連線已經關了，送事件也沒人收；其他錯誤給固定訊息，細節只進 log
      if (!upstream.signal.aborted) sendEvent(res, 'error', { message: USER_ERROR })
      deps.log?.(toLogRecord({ ...base, endedAt: now(), ttftMs, error, requestId: stream.request_id, answer }))
    } finally {
      res.end()
    }
  })
}
