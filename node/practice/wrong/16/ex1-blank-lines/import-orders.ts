import type { Readable } from 'node:stream'
import { createInterface } from 'node:readline'

export type ImportResult = { revenue: Map<string, number>, badLines: number }
type Row = { item: string, quantity: number, unitPrice: number }

// 一行「品項,數量,單價」→ Row；格式不對回傳 null（不用改）
export function parseLine(line: string): Row | null {
  const parts = line.split(',')
  if (parts.length !== 3) return null
  const [item, q, p] = parts
  const quantity = Number(q), unitPrice = Number(p)
  if (!item || !Number.isInteger(quantity) || quantity <= 0 || !Number.isInteger(unitPrice) || unitPrice <= 0) return null
  return { item, quantity, unitPrice }
}

// 練習 1：逐行處理，記憶體用量固定；每處理 10,000 行呼叫一次 onProgress(已處理行數)
export async function importOrders(input: Readable, onProgress: (lines: number) => void): Promise<ImportResult> {
  const revenue = new Map<string, number>()
  let lines = 0, badLines = 0
  // readline 負責跨 chunk 解碼、切行、去掉 \r\n 的 \r，最後一行沒有換行也會給出來
  // crlfDelay: Infinity：\r 和 \n 分在兩段、中間隔了很久，也當成同一個換行
  const rl = createInterface({ input, crlfDelay: Infinity })
  for await (const line of rl) {
    // 錯誤：沒有略過空行，空行被當成格式錯誤
    lines++
    const row = parseLine(line)
    if (row) revenue.set(row.item, (revenue.get(row.item) ?? 0) + row.quantity * row.unitPrice)
    else badLines++
    if (lines % 10_000 === 0) onProgress(lines)
  }
  return { revenue, badLines }
}
