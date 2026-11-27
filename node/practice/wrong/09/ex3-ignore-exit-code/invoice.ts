import { execFile } from 'node:child_process'
export type Item = { product: string, qty: number }
export type Invoice = { invoiceNo: string, customer: string, lines: { product: string, qty: number, amount: number }[], total: number }
const TOOL = new URL('./tools/legacy-invoice.ts', import.meta.url).pathname
// 參數陣列、有逾時，但只看 stdout
export function createInvoice(customerName: string, items: Item[]): Promise<Invoice> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [TOOL, customerName, JSON.stringify(items)], { timeout: 2_000 }, (err, stdout) => {
      if (err?.killed) return reject(err)
      resolve(JSON.parse(stdout || '{}'))
    })
  })
}
