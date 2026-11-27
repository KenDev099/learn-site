import test from 'node:test'
import assert from 'node:assert/strict'

const opts = { timeout: 15_000 }
type Parsed = { method: string, target: string, version: string, headers: Record<string, string>, body: Buffer }
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const drinks = ['拿鐵', '美式咖啡', '卡布奇諾', '伯爵紅茶']
const pick = () => drinks[rand(0, drinks.length - 1)]

async function load() {
  const mod: { parseRequest?: unknown, HttpParseError?: unknown } = await import('./parse-request.ts')
  assert.equal(typeof mod.parseRequest, 'function', 'parse-request.ts 要 export function parseRequest(raw)')
  assert.equal(typeof mod.HttpParseError, 'function', 'parse-request.ts 要 export class HttpParseError（起始檔已經寫好，不要刪掉）')
  const parse = mod.parseRequest as (raw: Buffer) => Parsed
  const HttpParseError = mod.HttpParseError as new (...a: never[]) => Error
  const bad = (text: string | Buffer, why: string) => {
    let err: unknown
    try { parse(Buffer.isBuffer(text) ? text : Buffer.from(text)) } catch (e) { err = e }
    assert.ok(err instanceof HttpParseError, `${why}：要 throw new HttpParseError(…)，${err ? `收到 ${String(err)}` : '結果沒有丟出錯誤'}`)
  }
  return { parse: (text: string | Buffer) => parse(Buffer.isBuffer(text) ? text : Buffer.from(text)), bad }
}

test('GET 沒有 body：請求行拆成 method、target、version，body 是空的 Buffer', opts, async () => {
  const { parse } = await load()
  const target = `/menu?size=${['S', 'M', 'L'][rand(0, 2)]}&n=${rand(1, 99)}`
  const r = parse(`GET ${target} HTTP/1.1\r\nHost: localhost:3000\r\nAccept: */*\r\n\r\n`)
  assert.equal(r.method, 'GET')
  assert.equal(r.target, target, 'target 是請求行的第二段，原樣保留（包含 ? 後面的 query）')
  assert.equal(r.version, 'HTTP/1.1', 'version 不能殘留 \\r：行要用 \\r\\n 切開，不是 \\n')
  assert.deepEqual(r.headers, { host: 'localhost:3000', accept: '*/*' })
  assert.ok(Buffer.isBuffer(r.body), 'body 要是 Buffer')
  assert.equal(r.body.length, 0, '沒有 Content-Length 時 body 是空的 Buffer')
  assert.equal(parse('DELETE /orders/7 HTTP/1.0\r\n\r\n').version, 'HTTP/1.0', '沒有任何標頭的請求也要能解析，HTTP/1.0 也接受')
})

test('POST 中文 JSON body：依 Content-Length 的位元組數切出 body', opts, async () => {
  const { parse } = await load()
  const json = JSON.stringify({ drink: pick(), qty: rand(1, 9), note: '少冰，不要糖' })
  const bytes = Buffer.byteLength(json)
  const r = parse(`POST /orders HTTP/1.1\r\nHost: shop\r\nContent-Type: application/json\r\nContent-Length: ${bytes}\r\n\r\n${json}`)
  assert.equal(r.method, 'POST')
  assert.ok(Buffer.isBuffer(r.body), 'body 要是 Buffer')
  assert.equal(r.body.toString('utf8'), json, 'body 要剛好是 Content-Length 個位元組（中文一個字 3 個位元組）')
  assert.equal(r.headers['content-length'], String(bytes))
})

test('Content-Length 之後多出來的位元組不屬於這個請求', opts, async () => {
  const { parse } = await load()
  const json = JSON.stringify({ drink: pick(), size: '大杯' })
  const next = `GET /menu HTTP/1.1\r\nHost: shop\r\n\r\n`
  const r = parse(`POST /orders HTTP/1.1\r\nContent-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}${next}`)
  assert.equal(r.body.toString('utf8'), json, 'body 只能有 Content-Length 個位元組：要在 Buffer 上用位元組位置切（subarray），不能把整段轉成字串再用字串長度切')
})

test('body 是位元組，不一定是文字：二進位的 body 也要原封不動', opts, async () => {
  const { parse } = await load()
  const bytes = Buffer.from([0xff, 0x00, 0x80, 0xe6, 0x8b, rand(0, 255), 0xc3, 0x28])
  const head = Buffer.from(`POST /upload HTTP/1.1\r\nContent-Type: application/octet-stream\r\nContent-Length: ${bytes.length}\r\n\r\n`)
  const r = parse(Buffer.concat([head, bytes, Buffer.from('GET / HTTP/1.1\r\n\r\n')]))
  assert.deepEqual([...r.body], [...bytes], 'body 要直接從原本的 Buffer 切（subarray）：先轉成字串再轉回 Buffer，不是合法 UTF-8 的位元組（例如圖片）會被換成 U+FFFD')
})

test('標頭：名稱轉小寫、值去掉前後空白、同名的值用 ", " 合併', opts, async () => {
  const { parse } = await load()
  const id = `req-${rand(1000, 9999)}`
  const r = parse(`GET / HTTP/1.1\r\nHOST: shop\r\nX-Request-Id:   ${id}  \r\nAccept: text/html\r\naccept: application/json\r\nX-Empty:\r\nX-Url: http://a:1/b\r\n\r\n`)
  assert.equal(r.headers.host, 'shop', '標頭名稱要轉成小寫（HOST → host）')
  assert.equal(r.headers['x-request-id'], id, '值要去掉前後的空白')
  assert.equal(r.headers.accept, 'text/html, application/json', 'Accept 和 accept 是同一個標頭：兩個值用 ", " 合併，不能後面的蓋掉前面的')
  assert.equal(r.headers['x-empty'], '', '值可以是空的')
  assert.equal(r.headers['x-url'], 'http://a:1/b', '只用第一個冒號分開名稱和值，值裡面可以有冒號')
  assert.ok(!('HOST' in r.headers) && !('Accept' in r.headers), 'headers 的 key 只能有小寫的名稱')
})

test('格式錯誤要 throw HttpParseError', opts, async () => {
  const { bad } = await load()
  bad('GET / HTTP/1.1\r\nHost: shop\r\n', '缺少標頭結尾的空行')
  bad('GET / HTTP/1.1\nHost: shop\n\n', '行尾只有 \\n（規定要 \\r\\n）')
  bad('GET / HTTP/1.1\r\nHost: shop\nAccept: */*\r\n\r\n', '標頭裡混了只有 \\n 的行尾')
  bad('GET /menu\r\nHost: shop\r\n\r\n', '請求行少了版本')
  bad('GET  /menu HTTP/1.1\r\n\r\n', '請求行用了兩個空白')
  bad('GET /menu HTTP/2\r\n\r\n', '版本不是 HTTP/1.0 或 HTTP/1.1')
  bad('GET / HTTP/1.1\r\nHost shop\r\n\r\n', '標頭行沒有冒號')
  bad('GET / HTTP/1.1\r\n: shop\r\n\r\n', '標頭名稱是空的')
  bad('GET / HTTP/1.1\r\nHost : shop\r\n\r\n', '標頭名稱和冒號之間有空白')
})

test('Content-Length 只能是數字，body 不能比它短', opts, async () => {
  const { bad } = await load()
  for (const value of ['abc', '5abc', '-1', '0x10', '1.5', '', '5, 5'])
    bad(`POST /orders HTTP/1.1\r\nContent-Length: ${value}\r\n\r\nhello`, `Content-Length: ${JSON.stringify(value)}`)
  const body = Buffer.from(pick())
  bad(`POST /orders HTTP/1.1\r\nContent-Length: ${body.length + 2}\r\n\r\n${body}`, `Content-Length 是 ${body.length + 2}，body 只有 ${body.length} 個位元組`)
})
