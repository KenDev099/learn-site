import { ApiError } from './api-error.js'

// 游標分頁（nestjs 課、node 課第 14 課）：游標＝上一頁最後一筆的 (createdAt, id)
// 游標只決定「從哪裡開始」，查詢一樣經過租戶條件：拿別的租戶的 id 當游標也看不到別人的資料（第 8 課）
type Row = { createdAt: Date; id: string }
export const PAGE = 20

export function decodeCursor(raw?: string): Row | null {
  if (!raw) return null
  try {
    const [c, id] = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    const createdAt = new Date(c)
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || Number.isNaN(createdAt.getTime())) throw new Error()
    return { createdAt, id }
  } catch {
    throw new ApiError(400, 'VALIDATION_FAILED', 'cursor 格式不正確')
  }
}

// asc：舊的在前；desc：新的在前（稽核紀錄）
export function after(c: Row | null, dir: 'asc' | 'desc') {
  if (!c) return {}
  const op = dir === 'asc' ? 'gt' : 'lt'
  return { OR: [{ createdAt: { [op]: c.createdAt } }, { createdAt: c.createdAt, id: { [op]: c.id } }] }
}

export function page<T extends Row, V>(rows: T[], limit: number, view: (r: T) => V) {
  const items = rows.slice(0, limit)
  const last = items[items.length - 1]
  return {
    items: items.map(view),
    nextCursor: rows.length > limit ? Buffer.from(JSON.stringify([last.createdAt.toISOString(), last.id])).toString('base64url') : null,
  }
}
