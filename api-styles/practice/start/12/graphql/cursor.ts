// 游標的編碼與解碼（不用改，第 5 課寫過）：游標代表訂單在排序中的位置 (ordered_at, id)
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
  if (typeof orderedAt !== 'string' || Number.isNaN(Date.parse(orderedAt))) badCursor()
  if (typeof id !== 'string' || !/^\d{1,10}$/.test(id)) badCursor()
  return { orderedAt, id }
}
