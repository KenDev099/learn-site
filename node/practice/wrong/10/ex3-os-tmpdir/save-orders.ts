// 錯：暫存檔放在系統暫存資料夾，可能是另一個檔案系統，rename 會 EXDEV
import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function saveOrders(path: string, orders: unknown[]): Promise<void> {
  const tmp = join(tmpdir(), `orders.${randomUUID()}.tmp`)
  try {
    await writeFile(tmp, JSON.stringify(orders))
    await rename(tmp, path)
  } catch (err) {
    await rm(tmp, { force: true })
    throw err
  }
}
