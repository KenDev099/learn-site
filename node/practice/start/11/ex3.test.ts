import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'

const opts = { timeout: 15_000 }
type Cursor = { createdAt: string, id: number }
type Mod = { encodeCursor: (c: Cursor) => string, decodeCursor: (s: string) => Cursor, InvalidCursorError: new (...a: never[]) => Error }

async function load(): Promise<Mod> {
  const mod: Partial<Record<keyof Mod, unknown>> = await import('./cursor.ts')
  assert.equal(typeof mod.encodeCursor, 'function', 'cursor.ts 要 export encodeCursor')
  assert.equal(typeof mod.decodeCursor, 'function', 'cursor.ts 要 export decodeCursor')
  assert.equal(typeof mod.InvalidCursorError, 'function', 'cursor.ts 要 export InvalidCursorError')
  return mod as Mod
}
const randomCursor = (): Cursor => ({
  createdAt: new Date(Date.UTC(2020, 0, 1) + Math.floor(Math.random() * 2e11)).toISOString(),
  id: 1 + Math.floor(Math.random() * 10 ** (1 + Math.floor(Math.random() * 8))),
})
const b64url = (text: string) => Buffer.from(text).toString('base64url')

test('encode 再 decode 拿回一樣的資料，輸出只有 base64url 的字元', opts, async () => {
  const { encodeCursor, decodeCursor } = await load()
  for (let i = 0; i < 200; i++) {
    const c = randomCursor()
    const s = encodeCursor(c)
    assert.equal(typeof s, 'string', 'encodeCursor 要回傳字串')
    assert.match(s, /^[A-Za-z0-9_-]+$/, `${s} 含有 + / = 之類的字元，放進網址要跳脫。用 'base64url'，不是 'base64'`)
    assert.deepEqual(decodeCursor(s), c, '解回來要和原本的 { createdAt, id } 一樣')
  }
  const c = randomCursor()
  const extra = b64url(JSON.stringify({ ...c, role: 'admin' }))
  assert.deepEqual(decodeCursor(extra), c, 'cursor 是不可信的輸入：只回傳驗證過的 { createdAt, id }，不能把整個解出來的物件（含多出來的欄位）原樣交出去')
})

test('各種壞掉的 cursor 都丟 InvalidCursorError，不能讓 SyntaxError、TypeError 漏出去', opts, async () => {
  const { encodeCursor, decodeCursor, InvalidCursorError } = await load()
  const good = encodeCursor({ createdAt: '2026-10-31T08:00:00.000Z', id: 42 })
  const cases: [string, string][] = [
    ['', '空字串'],
    ['!!!', '不是 base64url 的字元'],
    [good + '!!', '合法 cursor 後面加了別的字元（Buffer.from 會默默略過不認得的字元，要自己先檢查）'],
    [Buffer.from('{"createdAt":"2026-10-31T08:00:00.000Z","id":4242}').toString('base64'), '標準 base64（含 =），不是我們發出去的格式'],
    [b64url('hello'), '合法 base64url，但內容不是 JSON'],
    [b64url('{"createdAt":"2026-10-31T08:00:00.000Z"'), '不完整的 JSON'],
    [b64url('null'), 'JSON 是 null'],
    [b64url('123'), 'JSON 是數字'],
    [b64url('"拿鐵"'), 'JSON 是字串'],
    [b64url('{"id":42}'), '缺 createdAt'],
    [b64url('{"createdAt":"2026-10-31T08:00:00.000Z"}'), '缺 id'],
    [b64url('{"createdAt":"2026-10-31T08:00:00.000Z","id":"42"}'), 'id 是字串'],
    [b64url('{"createdAt":"2026-10-31T08:00:00.000Z","id":0}'), 'id 是 0'],
    [b64url('{"createdAt":"2026-10-31T08:00:00.000Z","id":-3}'), 'id 是負數'],
    [b64url('{"createdAt":"2026-10-31T08:00:00.000Z","id":1.5}'), 'id 不是整數'],
    [b64url('{"createdAt":1761897600000,"id":42}'), 'createdAt 是數字'],
    [b64url('{"createdAt":"昨天","id":42}'), 'createdAt 不是時間'],
    [b64url('{"createdAt":"2026-10-31","id":42}'), 'createdAt 不是完整的 ISO 時間字串'],
  ]
  for (const [input, why] of cases) {
    assert.throws(() => decodeCursor(input), (err: unknown) => {
      assert.ok(err instanceof InvalidCursorError, `${why}：丟出的是 ${(err as Error)?.name}，要包成 InvalidCursorError（API 才能統一回 400）`)
      return true
    }, `${why}：要丟 InvalidCursorError，不能回傳`)
  }
})
