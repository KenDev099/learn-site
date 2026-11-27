// 整個 API 共用的 HTTP 工具：回 JSON、problem details（第 14 課）、讀 body（第 13 課）。這個檔不用改
import type { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type pg from 'pg'
import type { Config } from './config.ts'
import type { Logger } from './logger.ts'

export const PROBLEM_BASE = 'https://coffee.example/problems/'
export const PROBLEMS = {
  'validation': { status: 400, title: '資料格式不對' },
  'not-found': { status: 404, title: '找不到資源' },
  'method-not-allowed': { status: 405, title: '不支援這個方法' },
  'out-of-stock': { status: 409, title: '庫存不足' },
  'invalid-transition': { status: 409, title: '訂單目前的狀態不能這樣改' },
  'request-in-progress': { status: 409, title: '同一個 Idempotency-Key 的請求還在處理中' },
  'payload-too-large': { status: 413, title: 'body 太大' },
  'unsupported-media-type': { status: 415, title: '不支援這個 Content-Type' },
  'idempotency-key-reused': { status: 422, title: 'Idempotency-Key 已經用在內容不同的請求' },
  'internal': { status: 500, title: '伺服器發生錯誤' },
  'upstream-unavailable': { status: 503, title: '依賴的服務暫時無法使用' },
} as const
export type ProblemKind = keyof typeof PROBLEMS
export type FieldError = { field: string, message: string }
export type ProblemExtra = { errors?: FieldError[], errorId?: string, headers?: Record<string, string> }

// 處理函式 throw new HttpError('not-found', '沒有編號 9 的商品')，app.ts 的錯誤邊界會把它變成 problem 回應
// detail（message）會給客戶端看，不能放內部細節
export class HttpError extends Error {
  kind: ProblemKind
  extra: ProblemExtra
  constructor(kind: ProblemKind, detail: string, extra: ProblemExtra = {}) {
    super(detail)
    this.name = 'HttpError'
    this.kind = kind
    this.extra = extra
  }
}

export function sendJson(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) {
  const body = Buffer.from(JSON.stringify(data))
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(body.length), ...headers })
  res.end(body)
}

export function sendProblem(res: ServerResponse, kind: ProblemKind, detail: string, { errors, errorId, headers = {} }: ProblemExtra = {}) {
  const { status, title } = PROBLEMS[kind]
  const problem = { type: PROBLEM_BASE + kind, title, status, detail, ...(errors && { errors }), ...(errorId && { errorId }) }
  const body = Buffer.from(JSON.stringify(problem))
  res.writeHead(status, { 'content-type': 'application/problem+json; charset=utf-8', 'content-length': String(body.length), ...headers })
  res.end(body)
}

export const BODY_LIMIT = 10 * 1024

// 讀 JSON body；有問題就丟 HttpError（415、413、400）
export async function readJson(req: IncomingMessage): Promise<unknown> {
  const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json') throw new HttpError('unsupported-media-type', 'Content-Type 要是 application/json')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > BODY_LIMIT) throw new HttpError('payload-too-large', `body 不能超過 ${BODY_LIMIT} 位元組`, { headers: { connection: 'close' } })
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError('validation', 'body 不是合法的 JSON')
  }
}

// 每個處理函式拿到的東西：請求、回應、網址、路徑參數，以及 createApp 收到的依賴
export type Ctx = {
  req: IncomingMessage
  res: ServerResponse
  url: URL
  params: string[]          // 路由正規表示式的捕捉群組，例如 /menu/(\d+) 的 ['2']
  config: Config
  pool: pg.Pool
  logger: Logger            // 已經帶著這個請求的 requestId（練習 6 之後）
  orderEvents: EventEmitter // 'status'：訂單換了狀態；'shutdown'：開始關機
}
export type Handler = (ctx: Ctx) => Promise<void>
