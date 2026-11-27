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
export function createChatServer(client: Anthropic, deps: ChatDeps = {}): http.Server {
  throw new Error('TODO')
}
