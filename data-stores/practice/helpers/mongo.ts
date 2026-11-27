// MongoDB（第 7～9 課）：每一課用自己的資料庫 ds_t<NN>，每個測試檔開始前 dropDatabase
// 用法：const { client, db } = useMongo(7)   // 在測試檔最上層呼叫；before() 連線並清空，after() 關掉連線
// 容器是單節點 replica set（rs0），所以交易可以用；從主機連要加 directConnection=true
import { after, before } from 'node:test'
import { MongoClient } from 'mongodb'
import { notRunning } from './service.ts'

export const MONGO_URL = 'mongodb://127.0.0.1:16417/?directConnection=true'

export function useMongo(lesson: number, options: ConstructorParameters<typeof MongoClient>[1] = {}) {
  const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 3_000, ...options })
  const db = client.db(`ds_t${String(lesson).padStart(2, '0')}`)
  before(async () => {
    try {
      await client.connect()
      await db.command({ ping: 1 })
    } catch (e) {
      throw notRunning('MongoDB（127.0.0.1:16417）', 'mongo', e)
    }
    await db.dropDatabase()
  })
  after(() => client.close())
  return { client, db }
}
