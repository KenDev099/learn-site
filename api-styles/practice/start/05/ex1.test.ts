import test from 'node:test'
import assert from 'node:assert/strict'
import { GraphQLError } from 'graphql'
import { mulberry32 } from '../../helpers/coffee.ts'
import { decodeCursor, encodeCursor } from './cursor.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())
const int = (n: number) => Math.floor(random() * n)
const b64url = (s: string) => Buffer.from(s).toString('base64url')

// 隨機的 (ordered_at, id)：時間到毫秒、id 位數不一
const keys = Array.from({ length: 200 }, () => ({
  orderedAt: new Date(Date.UTC(2026, int(12), 1 + int(28), int(24), int(60), int(60), int(1000))).toISOString(),
  id: String(1 + int(10 ** (1 + int(7)))),
}))

test('encodeCursor 與 decodeCursor 來回一致，游標只含 base64url 字元', opts, () => {
  for (const key of keys) {
    const c = encodeCursor(key)
    assert.equal(typeof c, 'string', 'encodeCursor 要回傳字串')
    assert.match(c, /^[A-Za-z0-9_-]+$/, `游標「${c}」含有 base64url 以外的字元（+ / = 會在網址裡被誤解）：用 Buffer.from(…).toString('base64url')，不是 'base64'`)
    assert.notEqual(c, key.id, '游標不能直接是 id：沒有 ordered_at 就無法從這個位置繼續，客戶端也會開始依賴它的內容')
    assert.deepEqual({ ...decodeCursor(c) }, key, `decodeCursor(encodeCursor(${JSON.stringify(key)})) 要拿回同一個 { orderedAt, id }`)
  }
})

test('同一個 id、不同時間的游標要不同（游標要包含排序鍵）', opts, () => {
  const a = encodeCursor({ orderedAt: '2026-10-20T00:30:00.000Z', id: '7' })
  const b = encodeCursor({ orderedAt: '2026-10-21T00:30:00.000Z', id: '7' })
  assert.notEqual(a, b, '游標要把 orderedAt 和 id 都編進去')
})

const valid = keys[int(keys.length)]
const bad: [string, string][] = [
  ['空字串', ''],
  ['不是 base64url 的字元', '!!!@@@'],
  ['標準 base64（含 = 補位）', Buffer.from(JSON.stringify([valid.orderedAt, valid.id])).toString('base64') + (JSON.stringify([valid.orderedAt, valid.id]).length % 3 ? '' : '==')],
  ['解碼後不是 JSON', b64url('not json {')],
  ['JSON 是物件不是陣列', b64url(JSON.stringify({ orderedAt: valid.orderedAt, id: valid.id }))],
  ['欄位型別不對（數字）', b64url(JSON.stringify([Date.parse(valid.orderedAt), Number(valid.id)]))],
  ['少了 id', b64url(JSON.stringify([valid.orderedAt]))],
  ['多出欄位', b64url(JSON.stringify([valid.orderedAt, valid.id, 'admin']))],
  ['時間不是日期', b64url(JSON.stringify(['yesterday', valid.id]))],
  ['id 不是數字字串', b64url(JSON.stringify([valid.orderedAt, `${valid.id} OR 1=1`]))],
  ['JSON 的 null', b64url('null')],
  // 下面三種 Date.parse／正規表示式看起來過得了，但 PostgreSQL 不接受，沒擋下就會在 SQL 出錯變成 Unexpected error.
  ['時間不是 toISOString() 的格式（Date.parse("1") 是 2001 年）', b64url(JSON.stringify(['1', valid.id]))],
  ['不存在的日期（2 月 30 日）', b64url(JSON.stringify(['2026-02-30T00:00:00.000Z', valid.id]))],
  ['id 超出 integer 範圍', b64url(JSON.stringify([valid.orderedAt, '9999999999']))],
]

test('不合法的游標一律丟 GraphQLError，extensions.code 是 BAD_USER_INPUT', opts, () => {
  for (const [label, cursor] of bad) {
    let err: unknown
    try { decodeCursor(cursor) } catch (e) { err = e }
    assert.ok(err, `${label}（"${cursor}"）：要丟出錯誤，不能回傳一個看起來正常的結果`)
    assert.ok(err instanceof GraphQLError, `${label}：要丟 graphql 的 GraphQLError（現在丟的是 ${(err as Error)?.constructor?.name}，Yoga 會把它遮罩成 Unexpected error.）`)
    assert.equal(err.extensions?.code, 'BAD_USER_INPUT', `${label}：extensions.code 要是 'BAD_USER_INPUT'`)
    assert.doesNotMatch(err.message, /JSON|token|position|Unexpected/i, `${label}：錯誤訊息不要帶出 JSON.parse 的內部訊息（現在是「${err.message}」），只說游標無效`)
  }
})
