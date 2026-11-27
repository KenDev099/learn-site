// 錯：其他錯誤都包好了，但還是先 existsSync 再讀（TOCTOU）
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

export type Menu = { items: { name: string, price: number }[] }

export class MenuLoadError extends Error {
  name = 'MenuLoadError'
}

export async function loadMenu(path: string): Promise<Menu> {
  if (!existsSync(path)) return { items: [] }
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (err) {
    throw new MenuLoadError(`讀不到菜單檔 ${path}`, { cause: err })
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new MenuLoadError(`菜單檔 ${path} 不是正確的 JSON`, { cause: err })
  }
}
