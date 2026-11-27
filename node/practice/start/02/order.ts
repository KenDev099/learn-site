// 練習 1：node order.ts --drink 拿鐵 --size L --qty 2  →  拿鐵 L ×2 = 260
import { parseArgs } from 'node:util'
import { menu, sizeExtra } from './menu.ts'

const usage = '用法：node order.ts --drink <品項> [--size S|M|L] [--qty|-q <數量>]'

// TODO 1：用 parseArgs 解析 --drink、--size（預設 M）、--qty（縮寫 -q，預設 1）
// TODO 2：檢查品項在 menu 裡、尺寸是 S/M/L、數量是正整數（字串要自己驗證再轉數字）
// TODO 3：任何錯誤用法：stdout 不印東西，console.error 印一行說明＋usage，process.exitCode = 2
// TODO 4：正確時印出「拿鐵 L ×2 = 260」：單價 = menu[品項] + sizeExtra[尺寸]
