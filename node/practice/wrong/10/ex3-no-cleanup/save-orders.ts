// 練習 3：把訂單陣列存成 JSON 檔
import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'

// 先寫到同一個資料夾裡的暫存檔，寫完再 rename 蓋過目標：別人只會看到完整的舊檔或完整的新檔
export async function saveOrders(path: string, orders: unknown[]): Promise<void> {
  const tmp = `${path}.${randomUUID()}.tmp`   // 每次不同的名字，同時存兩次也不會互相干擾
  try {
    await writeFile(tmp, JSON.stringify(orders))
    await rename(tmp, path)
  } catch (err) {
    throw err
  }
}
