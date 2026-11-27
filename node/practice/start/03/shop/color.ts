// 練習 4：裝好 coffee-color 之後執行 node color.ts latte。這個檔案不用改
import { colorOf } from 'coffee-color'

console.log(colorOf(process.argv[2] ?? 'espresso'))
