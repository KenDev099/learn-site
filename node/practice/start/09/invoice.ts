// 練習 3：開發票要呼叫一支舊程式 tools/legacy-invoice.ts（別的團隊的，不能改）
// 用法：node tools/legacy-invoice.ts <客人姓名> <品項 JSON>
// 成功時 stdout 印一行 JSON、結束碼 0；失敗時把原因印到 stderr、結束碼非 0
// 下面這版是同事寫的，能動，但有三個問題（見課程頁）
import { exec } from 'node:child_process'

export type Item = { product: string, qty: number }
export type Invoice = { invoiceNo: string, customer: string, lines: { product: string, qty: number, amount: number }[], total: number }

const TOOL = new URL('./tools/legacy-invoice.ts', import.meta.url).pathname

export function createInvoice(customerName: string, items: Item[]): Promise<Invoice> {
  return new Promise(resolve => {
    exec(`"${process.execPath}" "${TOOL}" "${customerName}" '${JSON.stringify(items)}'`, (err, stdout) => {
      resolve(JSON.parse(stdout || '{}'))
    })
  })
}
