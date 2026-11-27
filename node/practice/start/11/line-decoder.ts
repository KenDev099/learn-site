// 把一段一段到達的位元組切成一行一行的文字（UTF-8）
// push(chunk)：回傳「這段資料讓哪些行完整了」；end()：資料結束，回傳剩下沒有換行的最後一行（沒有就回傳 []）
// 問題：每段各自 toString，字被切在兩段之間時會變成 �；也只認得 \n，Windows 的 \r\n 會在行尾留下 \r
import type { Buffer } from 'node:buffer'

export class LineDecoder {
  private rest = ''

  push(chunk: Buffer): string[] {
    const lines = (this.rest + chunk.toString()).split('\n')
    this.rest = lines.pop() ?? ''
    return lines
  }

  end(): string[] {
    const last = this.rest
    this.rest = ''
    return last ? [last] : []
  }
}
