import { hash } from 'node:crypto'

// 練習 1：ETag 的兩個小工具，練習 2、3 也會 import 它們

// 依內容算出 ETag：同樣的內容永遠得到同一個值，內容一變就不同；強 ETag 要用雙引號包起來
export function etagOf(body: string | Buffer): string {
  return hash("sha256", body, "base64url")
}

// 請求的 If-None-Match 標頭是否「命中」目前的 ETag（命中就回 304）
// If-None-Match 用弱比較（weak comparison）：去掉 W/ 之後相同就算命中
// ponytail: 直接用逗號切；ETag 本身含逗號時會切錯，我們的 base64url ETag 不會有逗號
export function noneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false
  if (header.trim() === '*') return true
  const opaque = (tag: string) => tag.trim().replace(/^W\//, '')
  return header.split(',').some(tag => opaque(tag) === opaque(etag))
}
