// 練習 1：把原始的 HTTP/1.1 請求（Buffer）解析成物件
// 規則：
// - 標頭區到第一個 \r\n\r\n 為止，每一行用 \r\n 結尾；找不到 \r\n\r\n 就是格式錯誤
// - 請求行是「方法 目標 版本」三段，用一個空白分隔，版本是 HTTP/1.0 或 HTTP/1.1
// - 標頭行是「名稱:值」：名稱不能是空的、不能有空白；值去掉前後空白；名稱轉小寫；同名多個值用 ", " 合併
// - body 的長度看 Content-Length（位元組數，只能是數字）；沒有 Content-Length 就是空的 Buffer
//   多出來的位元組不屬於這個請求，不能放進 body；不夠就是格式錯誤
// - 任何格式錯誤都 throw new HttpParseError('說明')
export class HttpParseError extends Error {
  name = 'HttpParseError'
}

export type ParsedRequest = {
  method: string
  target: string
  version: string
  headers: Record<string, string>
  body: Buffer
}

export function parseRequest(raw: Buffer): ParsedRequest {
  throw new Error('還沒寫：parseRequest')
}
