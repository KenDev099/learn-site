// 這一課共用的小工具：不用改這個檔案
import type { IncomingMessage, ServerResponse } from 'node:http'

// 回 JSON（第 13 課的 sendJson）
export function sendJson(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) {
  const body = Buffer.from(JSON.stringify(data))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    ...headers,
  })
  res.end(body)
}

// 回錯誤：RFC 9457 problem details（第 14 課），Content-Type 是 application/problem+json
export function sendProblem(res: ServerResponse, status: number, title: string, detail: string, headers: Record<string, string> = {}) {
  const body = Buffer.from(JSON.stringify({ type: 'about:blank', title, status, detail }))
  res.writeHead(status, {
    'content-type': 'application/problem+json',
    'content-length': String(body.length),
    ...headers,
  })
  res.end(body)
}

// 讀 JSON body（第 13 課做過完整版）：最多 10KB，太大或壞掉回傳 undefined
export async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 10 * 1024) return undefined
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return undefined }
}
