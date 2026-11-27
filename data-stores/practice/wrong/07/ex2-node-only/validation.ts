// 只在 Node 端驗證：資料庫沒有 validator，別的程式或 mongosh 寫什麼都進得去
import type { Db } from 'mongodb'

export function isValidStore(doc: { name?: unknown; status?: unknown }) {
  return typeof doc.name === 'string' && ['open', 'closed', 'renovating'].includes(doc.status as string)
}

export async function createStoresCollection(db: Db): Promise<void> {
  await db.createCollection('stores')
}
