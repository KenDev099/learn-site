// 打烊後的排程工作（不用改這個檔案）：兩個函式都有 bug，練習 2 用來觸發程序層級的錯誤
import { setTimeout as sleep } from 'node:timers/promises'

type Line = { drink: string, qty: number, product?: { price: number } }

// 同步的 bug：被下架的商品 product 是 undefined，讀 .price 會丟出 TypeError
export function buildDailyReport(lines: Line[]) {
  return lines.reduce((sum, line) => sum + line.product!.price * line.qty, 0)
}

// 非同步的失敗：上傳報表一定失敗；呼叫的人忘了 await，就變成沒人處理的 rejection
export async function uploadReport(tag: string) {
  await sleep(10)
  throw new Error(`報表上傳失敗（${tag}）`)
}
