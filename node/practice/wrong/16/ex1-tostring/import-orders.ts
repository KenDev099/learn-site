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

// 錯誤：每個 chunk 各自 toString，切在中文字中間就變成 �
export async function importOrders(input: Readable, onProgress: (lines: number) => void): Promise<ImportResult> {
  const revenue = new Map<string, number>()
  let lines = 0, badLines = 0, rest = ''
  const handle = (line: string) => {
    if (line === '') return
    lines++
    const row = parseLine(line)
    if (row) revenue.set(row.item, (revenue.get(row.item) ?? 0) + row.quantity * row.unitPrice)
    else badLines++
    if (lines % 10_000 === 0) onProgress(lines)
  }
  for await (const chunk of input) {
    const parts = (rest + chunk.toString()).split(/\r?\n/)
    rest = parts.pop() ?? ''
    for (const line of parts) handle(line)
  }
  handle(rest)
  return { revenue, badLines }
}
