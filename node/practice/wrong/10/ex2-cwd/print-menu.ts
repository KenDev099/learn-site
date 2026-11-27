// 練習 2：印出 data/menu.json 的菜單，一行一個「品名 價格」
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// 以這個程式檔所在的資料夾為準，不管從哪裡執行都找得到
const file = join(process.cwd(), 'data', 'menu.json')
const menu: { items: { name: string, price: number }[] } = JSON.parse(await readFile(file, 'utf8'))
for (const item of menu.items) console.log(`${item.name} ${item.price}`)
