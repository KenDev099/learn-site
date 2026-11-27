// 練習 1：讀菜單檔
import { readFile } from 'node:fs/promises'

export type Menu = { items: { name: string, price: number }[] }

// 讀菜單失敗時丟出的錯誤：用 new MenuLoadError(訊息, { cause: 原本的錯誤 }) 建立
export class MenuLoadError extends Error {
  name = 'MenuLoadError'
}

// 檔案不存在：回傳 { items: [] }
// 其他錯誤（沒有權限、是資料夾、JSON 格式錯）：丟出 MenuLoadError，訊息寫出是哪個檔案，cause 是原本的錯誤
export async function loadMenu(path: string): Promise<Menu> {
  let text: string
  try {
    text = await readFile(path, 'utf8')   // 直接讀，不先檢查存在
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { items: [] }
    throw new MenuLoadError(`讀不到菜單檔 ${path}：${(err as Error).message}`)
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new MenuLoadError(`菜單檔 ${path} 不是正確的 JSON`, { cause: err })
  }
}
