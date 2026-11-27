// 第 13 課的小工具（不用改這個檔案）：回 JSON、讀 JSON body、把錯誤變成 500
import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendProblem } from './problem.ts'

export function sendJson(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) {
  const body = Buffer.from(JSON.stringify(data))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    ...headers,
  })
  res.end(body)
}

export const BODY_LIMIT = 10 * 1024

// 讀 JSON body。有問題時已經用 sendProblem 回應了，回傳 undefined（JSON.parse 不會回傳 undefined，不會搞混）
export async function readJson(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
  const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json') return void sendProblem(res, 'unsupported-media-type', 'Content-Type 要是 application/json')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > BODY_LIMIT) return void sendProblem(res, 'payload-too-large', `body 不能超過 ${BODY_LIMIT} 位元組`, { headers: { connection: 'close' } })
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return void sendProblem(res, 'validation', 'body 不是合法的 JSON')
  }
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

// 任何錯誤都變成 500，細節只留在伺服器的 log
export function withErrors(handler: Handler): Handler {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (err) {
      console.error(err)
      if (res.headersSent) return void res.destroy()
      sendProblem(res, 'internal', '伺服器發生錯誤')
    }
  }
}

// /orders/42 → 42；不是這個形狀回傳 null
export function orderIdFrom(pathname: string): number | null {
  const match = /^\/orders\/(\d+)$/.exec(pathname)
  return match ? Number(match[1]) : null
}
