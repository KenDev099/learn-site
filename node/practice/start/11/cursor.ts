// 分頁 cursor：把「上一頁最後一筆」的 { createdAt, id } 包成一個可以放進網址的字串
// 問題：用了 base64（會出現 + / =），而且 decodeCursor 什麼都沒驗證，
// 壞掉的輸入會讓 SyntaxError 漏出去，或回傳欄位型別不對的物件
import { Buffer } from 'node:buffer'

export type Cursor = { createdAt: string, id: number }

export class InvalidCursorError extends Error {
  constructor(message = 'cursor 格式不正確') {
    super(message)
    this.name = 'InvalidCursorError'
  }
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64')
}

export function decodeCursor(s: string): Cursor {
  return JSON.parse(Buffer.from(s, 'base64').toString())
}
