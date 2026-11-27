// 練習 2：BFF 呼叫下游時要帶什麼。downstreamOptions 給 BFF 用，callerOf 給庫存服務用
import type { CallOptions, HandlerContext } from '@connectrpc/connect'

// 一個 GraphQL 請求的 context（只列這一題用到的）
export type RequestCtx = {
  headers: Headers         // 客戶端送進 BFF 的 HTTP 標頭
  deadline: number         // 整個請求必須在這個時間點（毫秒）之前完成
  newId: () => string      // 產生新的 request id（測試會注入）
  requestId?: string       // 可以把這個請求用的 id 存在這裡
}

export const MIN_BUDGET_MS = 20

// BFF 每次呼叫庫存服務：client.getStock(req, downstreamOptions(ctx, now))
export function downstreamOptions(ctx: RequestCtx, now: () => number): CallOptions {
  // 同一個 GraphQL 請求只決定一次 id：沿用客戶端（或 gateway）送來的，沒有才產生，存進 ctx 讓之後的呼叫共用
  ctx.requestId ??= ctx.headers.get('x-request-id') ?? ctx.newId()
  // 白名單：只轉送下游需要的標頭。cookie 之類的不往內部送
  const headers = new Headers(ctx.headers)
  headers.set('x-request-id', ctx.requestId)
  return { timeoutMs: ctx.deadline - now() - MIN_BUDGET_MS, headers }
}

// 庫存服務的 handler 裡：從收到的 metadata 讀出是誰、哪個請求在呼叫
export function callerOf(ctx: HandlerContext): { requestId: string | null, hasAuth: boolean } {
  return { requestId: ctx.requestHeader.get('x-request-id'), hasAuth: ctx.requestHeader.has('authorization') }
}
