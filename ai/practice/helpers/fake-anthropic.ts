// 這門課的判分方式：你的程式用的是真正的 @anthropic-ai/sdk，只是把它的 fetch 換成假的
// 假 fetch 依序回放測試準備好的回應（script），並把你實際送出的每個請求記在 requests，測試可以檢查 model、max_tokens、messages…
// 完全離線、不需要 API key、每次結果都一樣
import Anthropic from '@anthropic-ai/sdk'
import { apiError, json } from './replies.ts'

export type FakeRequest = {
  method: string
  path: string                      // 例如 '/v1/messages'（不含網域與查詢字串）
  query: Record<string, string>
  headers: Record<string, string>   // 標頭名稱一律小寫
  body: any                         // JSON.parse 後的請求本體；沒有本體時是 null
  signal: AbortSignal | null        // SDK 傳給 fetch 的 signal：測試可以檢查 requests[0].signal?.aborted
}
// 一步回應：Message 這類一般物件會變成 200 的 JSON；Response（apiError()、sse()、jsonl()…）原樣回傳
// 也可以是函式，依請求內容決定回應
export type Reply = Response | object
export type Step = Reply | ((req: FakeRequest) => Reply | Promise<Reply>)

export function fakeAnthropic(script: Step[], options: { maxRetries?: number; timeout?: number } = {}) {
  const requests: FakeRequest[] = []
  const queue = [...script]

  const fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    const signal = init.signal ?? null
    const raw = typeof init.body === 'string' ? init.body : null
    const req: FakeRequest = {
      method: init.method ?? 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(new Headers(init.headers)), body: raw ? JSON.parse(raw) : null, signal,
    }
    requests.push(req)
    if (signal?.aborted) throw signal.reason
    const step = queue.shift()
    // 用 400 回應而不是丟錯：SDK 不會重試 400，你的程式也不該重試，訊息會原樣出現在測試結果裡
    if (step === undefined) return apiError(400, 'invalid_request_error', `假的 API：測試只準備了 ${script.length} 個回應，你的程式送了第 ${requests.length} 個請求（多呼叫了一次 API）`)
    const reply = typeof step === 'function' ? await step(req) : step
    const res = reply instanceof Response ? reply : json(reply)
    return signal && res.body ? abortable(res, signal) : res
  }

  const client = new Anthropic({
    apiKey: 'test-key', baseURL: 'https://api.anthropic.com', fetch,
    maxRetries: options.maxRetries ?? 0, timeout: options.timeout ?? 600_000,
  })
  return { client, requests, remaining: () => queue.length }
}

// 跟真的 fetch 一樣：signal 中斷時，正在讀的 body 也會出錯
function abortable(res: Response, signal: AbortSignal): Response {
  const reader = res.body!.getReader()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener('abort', () => {
        try { controller.error(signal.reason) } catch {}
        reader.cancel(signal.reason).catch(() => {})
      }, { once: true })
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (signal.aborted) return
        if (done) controller.close()
        else controller.enqueue(value)
      } catch (e) {
        try { controller.error(e) } catch {}
      }
    },
  }, { highWaterMark: 0 })
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers })
}

