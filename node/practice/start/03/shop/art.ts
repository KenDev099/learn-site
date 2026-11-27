// 練習 3：裝好 latte-art 之後執行 node art.ts tulip。這個檔案不用改
import { pour } from 'latte-art'

console.log(pour(process.argv[2] ?? 'heart'))
