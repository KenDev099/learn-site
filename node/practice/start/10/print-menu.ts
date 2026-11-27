// 練習 2：印出 data/menu.json 的菜單，一行一個「品名 價格」
import { readFile } from 'node:fs/promises'

const menu: { items: { name: string, price: number }[] } = JSON.parse(await readFile('./data/menu.json', 'utf8'))
for (const item of menu.items) console.log(`${item.name} ${item.price}`)
