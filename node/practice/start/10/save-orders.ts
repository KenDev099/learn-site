// 練習 3：把訂單陣列存成 JSON 檔
import { writeFile } from 'node:fs/promises'

// 要做到：寫入期間別人讀到的，永遠是完整的舊內容或完整的新內容；失敗時不留下暫存檔
export async function saveOrders(path: string, orders: unknown[]): Promise<void> {
  await writeFile(path, JSON.stringify(orders))
}
