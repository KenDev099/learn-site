// 練習 1：游標的編碼與解碼。游標代表「某張訂單在排序中的位置」＝ 它的 (ordered_at, id)
// 客戶端只能原樣傳回游標，不應該解析它；伺服器收到游標時要當成不可信的輸入檢查
import { GraphQLError } from 'graphql'

export type CursorKey = { orderedAt: string, id: string }   // orderedAt 是 ISO 8601 字串，id 是數字組成的字串

export function encodeCursor(key: CursorKey): string {
  // ✗ 直接用 id 當游標：沒有 ordered_at 就無法從「這個位置之後」繼續，客戶端也看得出內容
  return key.id
}

export function decodeCursor(cursor: string): CursorKey {
  // ✗ 什麼都不檢查
  return { orderedAt: '', id: cursor }
}
