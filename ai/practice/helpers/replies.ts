// 假的 API 回應：測試用這些函式組出 fakeAnthropic 要回放的內容
// 形狀照 @anthropic-ai/sdk 1.3.0（API 版本 2026-10-21）的型別，跟 claude-opus-5-5 真正的回應一樣：
// content 常以一個空的 thinking block 開頭（display 預設 omitted），所以只讀 content[0] 的寫法會錯
import type Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5-5'
let seq = 0
const nextId = (prefix: string) => `${prefix}_test_${String(++seq).padStart(4, '0')}`

export function text(s: string): Anthropic.TextBlock {
  return { type: 'text', text: s, citations: null }
}

// Opus 5.5 的 thinking 一定開著；display 預設 omitted，thinking 欄位是空字串，signature 照樣有值
export function thinking(): Anthropic.ThinkingBlock {
  return { type: 'thinking', thinking: '', signature: 'sig_test' }
}

export function toolUse(id: string, name: string, input: unknown): Anthropic.ToolUseBlock {
  return { type: 'tool_use', id, name, input, caller: { type: 'direct' } }
}

export function usage(u: Partial<Anthropic.Usage> = {}): Anthropic.Usage {
  return {
    input_tokens: 20, output_tokens: 10,
    cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: null,
    inference_geo: null, output_tokens_details: null, server_tool_use: null, service_tier: 'standard', speed: 'standard',
    ...u,
  }
}

type MessageOpts = {
  stop_reason?: Anthropic.StopReason
  stop_details?: Anthropic.RefusalStopDetails | null
  usage?: Partial<Anthropic.Usage>
  id?: string
  model?: string
}

// 一個完整的 Message（非串流的回應本體）。也可以直接拿來當函式的參數，例如 readAnswer(message([...]))
export function message(content: Anthropic.ContentBlock[], o: MessageOpts = {}): Anthropic.Message {
  return {
    id: o.id ?? nextId('msg'), type: 'message', role: 'assistant', model: o.model ?? MODEL,
    content, container: null, diagnostics: null,
    stop_reason: o.stop_reason ?? 'end_turn', stop_sequence: null, stop_details: o.stop_details ?? null,
    usage: usage(o.usage),
  }
}

// 拒答：HTTP 200，stop_reason 'refusal'；category 傳 null 代表沒有對應的類別，傳 undefined 代表連 stop_details 都是 null
export function refusal(category?: Anthropic.RefusalStopDetails['category'], explanation: string | null = null, content: Anthropic.ContentBlock[] = [thinking()]): Anthropic.Message {
  return message(content, {
    stop_reason: 'refusal',
    stop_details: category === undefined ? null : { type: 'refusal', category, explanation },
  })
}

// 任意 JSON 回應（Batches 的 create／retrieve 等）
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'request-id': nextId('req'), ...headers } })
}

// JSONL 回應（Batches 的 results）
export function jsonl(rows: unknown[]): Response {
  return new Response(rows.map(r => JSON.stringify(r)).join('\n') + '\n', { status: 200, headers: { 'content-type': 'application/binary', 'request-id': nextId('req') } })
}

// API 錯誤：例如 apiError(429, 'rate_limit_error', 'Rate limited', { 'retry-after': '3' })、apiError(529, 'overloaded_error', 'Overloaded')
export function apiError(status: number, type: string, msg: string, headers: Record<string, string> = {}): Response {
  return json({ type: 'error', error: { type, message: msg }, request_id: nextId('req') }, status, headers)
}

// ---- 串流（SSE） ----
// 一個串流事件就是一個物件，例如 { type: 'message_start', message: … }
export type StreamEvent = { type: string; [k: string]: unknown }
// sse() 的清單除了事件，也可以放：
//   Promise：串流讀到這裡就停住，等它 resolve 才繼續（測試用來控制時機，例如等學習者先處理前面的事件）
//   函式：讀到這裡時呼叫它（例如 () => clock.set(900)，讓下一個事件「發生在」900ms）
export type SseItem = StreamEvent | Promise<unknown> | (() => unknown)

// 把事件編成 text/event-stream 的 Response。一次只產生一個事件（讀的人要下一個才產生），所以 Promise 和函式的位置就是事件之間的時間點
// chunked: true 時每個事件拆成兩段送出，確認解析不依賴「一段剛好一個事件」
export function sse(items: SseItem[], { chunked = false }: { chunked?: boolean } = {}): Response {
  const enc = new TextEncoder()
  const queue = [...items]
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (queue.length) {
        const item = queue.shift()!
        if (item instanceof Promise) { await item; continue }
        if (typeof item === 'function') { await item(); continue }
        const bytes = enc.encode(`event: ${item.type}\ndata: ${JSON.stringify(item)}\n\n`)
        if (chunked) {
          const mid = Math.floor(bytes.length / 2)
          controller.enqueue(bytes.slice(0, mid))
          controller.enqueue(bytes.slice(mid))
        } else controller.enqueue(bytes)
        return
      }
      controller.close()
    },
  }, { highWaterMark: 0 })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': nextId('req') } })
}

// 常見的一段文字串流：message_start →（thinking block）→ 一個 text block 分成 parts 送出 → message_delta → message_stop
// 回傳事件陣列，測試可以在中間插入 Promise 或函式再交給 sse()
export function textEvents(parts: string[], o: { thinking?: boolean; stop_reason?: Anthropic.StopReason; usage?: Partial<Anthropic.Usage>; id?: string } = {}): StreamEvent[] {
  const withThinking = o.thinking ?? true
  const u = usage(o.usage)
  const start = message([], { id: o.id, usage: { ...u, output_tokens: 1 } })
  const events: StreamEvent[] = [{ type: 'message_start', message: { ...start, stop_reason: null } }]
  let index = 0
  if (withThinking) {
    events.push(
      { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: 'sig_test' } },
      { type: 'content_block_stop', index },
    )
    index++
  }
  events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '', citations: null } })
  for (const p of parts) events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: p } })
  events.push(
    { type: 'content_block_stop', index },
    { type: 'message_delta', delta: { stop_reason: o.stop_reason ?? 'end_turn', stop_sequence: null, stop_details: null, container: null }, usage: { output_tokens: u.output_tokens, input_tokens: u.input_tokens, cache_creation_input_tokens: u.cache_creation_input_tokens, cache_read_input_tokens: u.cache_read_input_tokens, server_tool_use: null } },
    { type: 'message_stop' },
  )
  return events
}

// 串流中途的錯誤事件（HTTP 已經是 200，錯誤在 SSE 裡），例如 errorEvent('overloaded_error', 'Overloaded')
export function errorEvent(type: string, msg: string): StreamEvent {
  return { type: 'error', error: { type, message: msg } }
}
