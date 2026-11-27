// 分頁 cursor：把「上一頁最後一筆」的 { createdAt, id } 包成一個可以放進網址的字串
import { Buffer } from 'node:buffer'

export type Cursor = { createdAt: string, id: number }

export class InvalidCursorError extends Error {
  constructor(message = 'cursor 格式不正確') {
    super(message)
    this.name = 'InvalidCursorError'
  }
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export function decodeCursor(s: string): Cursor {
  // Buffer.from 解 base64url 時會默默略過不合法的字元，所以先自己檢查字元
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new InvalidCursorError('cursor 含有 base64url 以外的字元')
  let data: unknown
  try {
    data = JSON.parse(Buffer.from(s, 'base64url').toString())
  } catch {
    throw new InvalidCursorError('cursor 的內容不是 JSON')
  }
  const { createdAt, id } = data as Record<string, unknown>
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt)) || new Date(createdAt).toISOString() !== createdAt) {
    throw new InvalidCursorError('createdAt 要是 ISO 時間字串')
  }
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) throw new InvalidCursorError('id 要是正整數')
  return { createdAt, id }
}
