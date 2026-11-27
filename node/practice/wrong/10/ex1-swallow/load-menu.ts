import { readFile } from 'node:fs/promises'
export type Menu = { items: { name: string, price: number }[] }
export class MenuLoadError extends Error {
  name = 'MenuLoadError'
}
export async function loadMenu(path: string): Promise<Menu> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return { items: [] }
  }
}
