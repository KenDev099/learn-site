import { lineTotal, type MenuItem } from './price.ts'

const latte: MenuItem = { name: '拿鐵', price: 110 }
const qty = Number(process.argv[2] ?? '1')
const line = `${latte.name} ×${qty} = ${lineTotal(latte, qty)}`
console.log(line, `（${Buffer.byteLength(line)} bytes）`)
