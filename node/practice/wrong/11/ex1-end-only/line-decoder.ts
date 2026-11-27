import { Buffer } from 'node:buffer'

export class LineDecoder {
  private chunks: Buffer[] = []

  push(chunk: Buffer): string[] {
    this.chunks.push(chunk)
    return []
  }

  end(): string[] {
    const text = Buffer.concat(this.chunks).toString()
    this.chunks = []
    const lines = text.split(/\r?\n/)
    if (lines.at(-1) === '') lines.pop()
    return lines
  }
}
