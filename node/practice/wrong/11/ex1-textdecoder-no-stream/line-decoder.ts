import type { Buffer } from 'node:buffer'

const trimCR = (line: string) => line.endsWith('\r') ? line.slice(0, -1) : line

export class LineDecoder {
  private decoder = new TextDecoder()
  private rest = ''

  push(chunk: Buffer): string[] {
    const lines = (this.rest + this.decoder.decode(chunk)).split('\n')
    this.rest = lines.pop() ?? ''
    return lines.map(trimCR)
  }

  end(): string[] {
    const last = this.rest + this.decoder.decode()
    this.rest = ''
    return last ? [trimCR(last)] : []
  }
}
