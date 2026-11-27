// 練習 3：開發票要呼叫一支舊程式 tools/legacy-invoice.ts（別的團隊的，不能改）
// 用法：node tools/legacy-invoice.ts <客人姓名> <品項 JSON>
// 成功時 stdout 印一行 JSON、結束碼 0；失敗時把原因印到 stderr、結束碼非 0
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export type Item = { product: string, qty: number }
export type Invoice = { invoiceNo: string, customer: string, lines: { product: string, qty: number, amount: number }[], total: number }

const TOOL = new URL('./tools/legacy-invoice.ts', import.meta.url).pathname
const execFileAsync = promisify(execFile)

export async function createInvoice(customerName: string, items: Item[]): Promise<Invoice> {
  try {
    // 不經過 shell：每個參數原封不動交給程式，名字裡的空白、引號、$() 都只是字
    const { stdout } = await execFileAsync(process.execPath, [TOOL, customerName, JSON.stringify(items)], {
      timeout: 2_000,   // 超過 2 秒送 SIGTERM（killSignal 預設）
    })
    return JSON.parse(stdout)
  } catch (err) {
    // 結束碼非 0、逾時被終止、找不到程式，都會到這裡；err.stderr 是外部程式說的原因
    const e = err as Error & { code?: number | string, signal?: string, killed?: boolean, stderr?: string }
    const why = e.killed ? `超過 2 秒沒有回應，已終止（${e.signal}）` : `結束碼 ${e.code}：${e.stderr?.trim()}`
    throw new Error(`開發票失敗，${why}`, { cause: err })
  }
}
