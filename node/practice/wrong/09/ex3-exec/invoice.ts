import { exec } from 'node:child_process'
import { promisify } from 'node:util'
export type Item = { product: string, qty: number }
export type Invoice = { invoiceNo: string, customer: string, lines: { product: string, qty: number, amount: number }[], total: number }
const TOOL = new URL('./tools/legacy-invoice.ts', import.meta.url).pathname
const execAsync = promisify(exec)
// 有逾時、有看結束碼，但經過 shell
export async function createInvoice(customerName: string, items: Item[]): Promise<Invoice> {
  const { stdout } = await execAsync(`"${process.execPath}" "${TOOL}" "${customerName}" '${JSON.stringify(items)}'`, { timeout: 2_000 })
  return JSON.parse(stdout)
}
