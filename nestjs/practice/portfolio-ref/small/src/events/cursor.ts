import { ApiError } from '../common/api-error.js'

// 游標＝上一頁最後一筆的 (startsAt, id)，編成 base64url。排序鍵要唯一，所以加上 id（第 2 課）
export type Cursor = { startsAt: Date; id: string }

export const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify([c.startsAt.toISOString(), c.id])).toString('base64url')

export function decodeCursor(raw: string): Cursor {
  try {
    const [s, id] = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    const startsAt = new Date(s)
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || Number.isNaN(startsAt.getTime())) throw new Error()
    return { startsAt, id }
  } catch {
    throw new ApiError(400, 'VALIDATION_FAILED', 'cursor 格式不正確')
  }
}
