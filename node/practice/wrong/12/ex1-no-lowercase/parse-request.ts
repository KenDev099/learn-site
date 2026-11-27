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
  // 在 Buffer 上找空行：位置是位元組的位置，後面切 body 才不會錯
  const end = raw.indexOf('\r\n\r\n')
  if (end === -1) throw new HttpParseError('找不到標頭結尾的空行（\\r\\n\\r\\n）')

  const lines = raw.subarray(0, end).toString('utf8').split('\r\n')
  if (lines.some(line => line.includes('\n'))) throw new HttpParseError('行尾要是 \\r\\n，不能只有 \\n')

  const parts = lines[0].split(' ')
  if (parts.length !== 3 || !parts[0] || !parts[1]) throw new HttpParseError(`請求行要是「方法 目標 版本」：${lines[0]}`)
  const [method, target, version] = parts
  if (version !== 'HTTP/1.1' && version !== 'HTTP/1.0') throw new HttpParseError(`不支援的版本：${version}`)

  const headers: Record<string, string> = {}
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':')
    const name = line.slice(0, colon)
    if (colon < 1 || /\s/.test(name)) throw new HttpParseError(`壞掉的標頭行：${line}`)
    const value = line.slice(colon + 1).trim()
    headers[name] = name in headers ? `${headers[name]}, ${value}` : value
  }

  const start = end + 4
  let length = 0
  if ((headers['content-length'] ?? headers['Content-Length']) !== undefined) {
    if (!/^\d+$/.test((headers['content-length'] ?? headers['Content-Length']))) throw new HttpParseError(`Content-Length 要是數字：${(headers['content-length'] ?? headers['Content-Length'])}`)
    length = Number((headers['content-length'] ?? headers['Content-Length']))
  }
  if (raw.length - start < length) throw new HttpParseError(`body 不足 ${length} 個位元組`)
  return { method, target, version, headers, body: raw.subarray(start, start + length) }
}
