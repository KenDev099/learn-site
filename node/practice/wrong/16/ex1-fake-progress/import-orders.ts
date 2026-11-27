import type { Readable } from 'node:stream'

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
// 現在的版本先把整個檔案收進記憶體才開始處理：檔案一大就吃光記憶體，進度也要等全部讀完才開始回報
export async function importOrders(input: Readable, onProgress: (lines: number) => void): Promise<ImportResult> {
  // 錯誤：一邊收集一邊數 \n 假裝回報進度，其實還是全部收進記憶體才處理
  const chunks: Buffer[] = []
  let seen = 0
  for await (const chunk of input) {
    chunks.push(chunk)
    for (const b of chunk) if (b === 0x0a && ++seen % 10_000 === 0) onProgress(seen)
  }
  const revenue = new Map<string, number>()
  let lines = 0, badLines = 0
  for (const line of Buffer.concat(chunks).toString().split(/\r?\n/)) {
    if (line === '') continue
    lines++
    const row = parseLine(line)
    if (row) revenue.set(row.item, (revenue.get(row.item) ?? 0) + row.quantity * row.unitPrice)
    else badLines++
  }
  return { revenue, badLines }
}
