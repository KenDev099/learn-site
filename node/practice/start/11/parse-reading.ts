// 解析咖啡機上傳的二進位紀錄。每筆 12 個位元組（數字都是 big-endian）：
//   位置 0–1   uint16  機台編號
//   位置 2     uint8   杯型：1 = S、2 = M、3 = L
//   位置 3     uint8   旗標：bit0 = 熱飲、bit1 = 加濃縮（其他位元不用管）
//   位置 4–7   uint32  時間戳記（Unix 秒）
//   位置 8–11  uint32  這台機器的累計杯數
// 長度不是 12 的倍數、或杯型不是 1–3 時，丟 RangeError
import type { Buffer } from 'node:buffer'

export type Reading = {
  machineId: number
  size: 'S' | 'M' | 'L'
  hot: boolean
  extraShot: boolean
  timestamp: number
  totalCups: number
}

export function parseReadings(buf: Buffer): Reading[] {
  // TODO
  return []
}
