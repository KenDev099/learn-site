import type { IncomingMessage, ServerResponse } from 'node:http'

// 回 JSON：先轉成 Buffer，Content-Length 才會是位元組數（第 11 課），中文也不會出錯
export function sendJson(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) {
  const body = Buffer.from(JSON.stringify(data))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    ...headers,
  })
  res.end(body)
}

export type FieldError = { field: string, message: string }

// 本課程的錯誤格式：{ error: { code, message } }，驗證錯誤再加 details
export function sendError(res: ServerResponse, status: number, code: string, message: string, extra: { headers?: Record<string, string>, details?: FieldError[] } = {}) {
  const error = extra.details ? { code, message, details: extra.details } : { code, message }
  sendJson(res, status, { error }, extra.headers)
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

// 練習 3：包住處理函式，讓任何錯誤都變成 500，伺服器繼續運作
export function withErrorHandling(handler: Handler): Handler {
  // async 包裝：handler 同步 throw 或回傳 rejected Promise，都會落到 catch
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (err) {
      console.error(err)   // 完整錯誤留在伺服器的 log，不回給客戶端
      // 標頭已經送出：沒辦法改成 500，只能中斷連線，讓客戶端知道回應不完整
      sendError(res, 500, 'INTERNAL', '伺服器發生錯誤')
    }
  }
}
