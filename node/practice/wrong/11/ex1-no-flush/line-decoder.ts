// 把一段一段到達的位元組切成一行一行的文字（UTF-8）
// push(chunk)：回傳「這段資料讓哪些行完整了」；end()：資料結束，回傳剩下沒有換行的最後一行（沒有就回傳 []）
import type { Buffer } from 'node:buffer'
import { StringDecoder } from 'node:string_decoder'

const trimCR = (line: string) => line.endsWith('\r') ? line.slice(0, -1) : line

export class LineDecoder {
  private decoder = new StringDecoder('utf8')
  private rest = ''

  push(chunk: Buffer): string[] {
    // StringDecoder 把切在 chunk 尾巴、還不完整的字留到下一次
    const lines = (this.rest + this.decoder.write(chunk)).split('\n')
    this.rest = lines.pop() ?? ''
    return lines.map(trimCR)
  }

  end(): string[] {
    const last = this.rest
    this.rest = ''
    return last ? [trimCR(last)] : []
  }
}
