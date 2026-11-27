import { readFile } from 'node:fs/promises'

type MenuItem = { name: string, price: number }

const path = process.argv[2]
const menu: MenuItem[] = JSON.parse(await readFile(path, 'utf8'))
const cheapest = menu.reduce((a, b) => (b.price < a.price ? b : a))
console.log(`最便宜：${cheapest.name} ${cheapest.price} 元`)
