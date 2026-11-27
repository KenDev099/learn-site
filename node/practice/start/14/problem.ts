// 整個 API 共用的錯誤回應
import type { ServerResponse } from 'node:http'

export type FieldError = { field: string, message: string }

// 這個 API 會回的錯誤種類：狀態碼和標題。type 由 PROBLEM_BASE + 種類名稱組成，例如
// https://coffee.example/problems/validation（coffee.example 是範例用的網域）
export const PROBLEM_BASE = 'https://coffee.example/problems/'
export const PROBLEMS = {
  'validation': { status: 400, title: '資料格式不對' },
  'not-found': { status: 404, title: '找不到資源' },
  'method-not-allowed': { status: 405, title: '不支援這個方法' },
  'invalid-transition': { status: 409, title: '訂單目前的狀態不能這樣改' },
  'request-in-progress': { status: 409, title: '同一個 Idempotency-Key 的請求還在處理中' },
  'payload-too-large': { status: 413, title: 'body 太大' },
  'unsupported-media-type': { status: 415, title: '不支援這個 Content-Type' },
  'idempotency-key-reused': { status: 422, title: 'Idempotency-Key 已經用在內容不同的請求' },
  'internal': { status: 500, title: '伺服器發生錯誤' },
} as const
export type ProblemKind = keyof typeof PROBLEMS

// 練習 1：改成 RFC 9457 的 problem details
// 現在還是第 13 課的格式 { error: { code, message } }，Content-Type 也只是 application/json
export function sendProblem(res: ServerResponse, kind: ProblemKind, detail: string, extra: { errors?: FieldError[], headers?: Record<string, string> } = {}) {
  const { status } = PROBLEMS[kind]
  const error = extra.errors ? { code: kind, message: detail, details: extra.errors } : { code: kind, message: detail }
  const body = Buffer.from(JSON.stringify({ error }))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    ...extra.headers,
  })
  res.end(body)
}
