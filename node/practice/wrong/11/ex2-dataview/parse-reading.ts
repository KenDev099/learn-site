// 錯誤：DataView 沒帶 byteOffset，buf 是大 Buffer 的一段（subarray、Buffer 池）時從錯的位置讀
import type { Buffer } from 'node:buffer'

export type Reading = { machineId: number, size: 'S' | 'M' | 'L', hot: boolean, extraShot: boolean, timestamp: number, totalCups: number }
const SIZES = { 1: 'S', 2: 'M', 3: 'L' } as const

export function parseReadings(buf: Buffer): Reading[] {
  if (buf.length % 12 !== 0) throw new RangeError(`長度 ${buf.length} 不是 12 的倍數`)
  const view = new DataView(buf.buffer)
  const out: Reading[] = []
  for (let o = 0; o < buf.length; o += 12) {
    const code = view.getUint8(o + 2)
    if (code !== 1 && code !== 2 && code !== 3) throw new RangeError(`杯型 ${code} 不合法`)
    const flags = view.getUint8(o + 3)
    out.push({ machineId: view.getUint16(o), size: SIZES[code], hot: (flags & 1) !== 0, extraShot: (flags & 2) !== 0, timestamp: view.getUint32(o + 4), totalCups: view.getUint32(o + 8) })
  }
  return out
}
