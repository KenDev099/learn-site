// 練習 1：游標的編碼與解碼。游標代表「某張訂單在排序中的位置」＝ 它的 (ordered_at, id)
// 客戶端只能原樣傳回游標，不應該解析它；伺服器收到游標時要當成不可信的輸入檢查
import { GraphQLError } from 'graphql'

export type CursorKey = { orderedAt: string, id: string }   // orderedAt 是 ISO 8601 字串，id 是數字組成的字串

// base64url：只用 A–Z a–z 0–9 - _，不補 =，放進網址、JSON 都不用跳脫
export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify([key.orderedAt, key.id])).toString('base64url')
}

function badCursor(): never {
  // 訊息只說「游標無效」，不把 JSON.parse 的內部訊息傳給客戶端
  throw new GraphQLError('游標無效，請使用上一頁回傳的 endCursor', { extensions: { code: 'BAD_USER_INPUT' } })
}

export function decodeCursor(cursor: string): CursorKey {
  // Buffer.from(s, 'base64url') 遇到不合法的字元會直接略過、不會丟錯，所以先自己檢查字元
  if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]+$/.test(cursor)) badCursor()
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    badCursor()
  }
  // 能 parse 不代表內容對：形狀、型別、值都要檢查
  if (!Array.isArray(value) || value.length !== 2) badCursor()
  const [orderedAt, id] = value
  // 這兩個值會進 SQL：只收 PostgreSQL 一定接受的值，不然壞游標會在 SQL 才出錯，變成 Unexpected error.
  // 時間：toISOString() 的格式，而且轉回去一模一樣（Date.parse('1') 也算合法日期，2 月 30 日會被轉成 3 月 2 日）
  if (typeof orderedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(orderedAt)
    || Number.isNaN(Date.parse(orderedAt)) || new Date(orderedAt).toISOString() !== orderedAt) badCursor()
  // id：orders.id 是 integer，最大 2147483647
  if (typeof id !== 'string' || !/^\d{1,10}$/.test(id) || Number(id) > 2_147_483_647) badCursor()
  return { orderedAt, id }
}
