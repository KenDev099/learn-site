// 用 cause 把原本的錯誤包起來：執行 node examples/cause.ts 看 stack trace
import { readFile } from 'node:fs/promises'

async function loadMenu(path: string) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (err) {
    throw new Error(`讀不到菜單：${path}`, { cause: err })
  }
}

async function openShop() {
  const menu = await loadMenu('data/menu-2026.json')
  console.log(menu)
}

await openShop()
