import { formatPrice } from '#lib/price.ts'
import { menu, menuLines } from './routes/menu.ts'
import { reportLine } from './routes/admin/report.ts'

console.log(menuLines().join('\n'))
console.log(`最低消費 ${formatPrice(Math.min(...menu.map(item => item.price)))}`)
console.log(reportLine(3460))
