import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { Decimal128, MongoServerError, ObjectId } from 'mongodb'
import { useMongo } from '../../helpers/mongo.ts'
import { createStoresCollection } from './validation.ts'

const { db } = useMongo(7)
const col = () => db.collection('stores')

const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://img.example.tw/s/${i + 10}.jpg`, alt: `照片 ${i + 10}` }))
const valid = () => ({
  name: '信義門市',
  status: 'open',
  address: { city: '台北市', line: '信義區松高路 11 號' },
  photos: photos(20),
  featured: [{ productId: 12, name: '拿鐵', price: Decimal128.fromString('110') }],
})

async function rejected(doc: Record<string, unknown>, why: string) {
  try {
    await col().insertOne(doc)
  } catch (e) {
    assert.ok(e instanceof MongoServerError && e.code === 121, `${why}：要得到錯誤碼 121（DocumentValidationFailure），實際是 ${(e as Error).message}`)
    return
  }
  await col().deleteOne({ _id: doc._id as ObjectId })
  assert.fail(`${why}：這份文件不合法，卻寫進去了。validator 有設定嗎？validationAction 要是 error，不是 warn`)
}

describe('練習 2：stores 集合的 schema 驗證', { timeout: 30_000 }, () => {
  test('建立集合，validator 用 $jsonSchema，validationAction 是 error', async () => {
    await createStoresCollection(db)
    const [info] = await db.listCollections({ name: 'stores' }).toArray()
    assert.ok(info, 'createStoresCollection 要建立 stores 集合')
    const options = (info as { options?: Record<string, any> }).options ?? {}
    assert.ok(options.validator?.$jsonSchema, '集合的 validator 要用 $jsonSchema（在 createCollection 的選項裡設定），只在 Node 端檢查擋不住別的程式或 mongosh 寫入')
    assert.equal(options.validationAction ?? 'error', 'error', 'validationAction 要是 error：warn 只記在 log，不合法的文件照樣寫進去')
  })

  test('合法的文件寫得進去（20 張照片剛好可以）', async () => {
    try {
      await col().insertOne(valid())
    } catch (e) {
      assert.fail(`合法的文件被擋下：${(e as Error).message}\n${JSON.stringify((e as MongoServerError).errInfo?.details)}\n（additionalProperties: false 時，_id 也要列在 properties 裡）`)
    }
    await col().insertOne({ name: '台中門市', status: 'renovating' })
  })

  test('不合法的文件都被資料庫拒絕', async () => {
    const { name, ...noName } = valid()
    const { status, ...noStatus } = valid()
    await rejected(noName, '缺 name')
    await rejected({ ...valid(), name: '' }, 'name 是空字串')
    await rejected({ ...valid(), name: '店'.repeat(51) }, 'name 超過 50 字')
    await rejected({ ...valid(), name: 10 }, 'name 不是字串')
    await rejected(noStatus, '缺 status')
    await rejected({ ...valid(), status: 'opne' }, 'status 拼錯（要用 enum 限定只能是 open、closed、renovating）')
    await rejected({ ...valid(), photos: photos(21) }, '21 張照片（photos 最多 20 張，用 maxItems）')
    await rejected({ ...valid(), photos: [{ alt: '沒有網址' }] }, '照片沒有 url')
    await rejected({ ...valid(), photos: ['https://img.example.tw/s/1.jpg'] }, '照片是字串不是物件（items 要寫 bsonType: object）')
    await rejected({ ...valid(), address: '台北市信義區' }, 'address 是字串（要寫 bsonType: object）')
    await rejected({ ...valid(), featured: [{ productId: 12, name: '拿鐵', price: 110.5 }] }, 'price 是 double')
    await rejected({ ...valid(), featured: [{ productId: 12, name: '拿鐵', price: 110 }] }, 'price 是 int')
    await rejected({ ...valid(), tmp: true }, '多了 schema 沒有的欄位 tmp（用 additionalProperties: false）')
  })

  test('更新成不合法的內容也會被拒絕', async () => {
    const { insertedId } = await col().insertOne({ name: '高雄門市', status: 'open' })
    await assert.rejects(col().updateOne({ _id: insertedId }, { $set: { status: 'gone' } }), (e: unknown) => e instanceof MongoServerError && e.code === 121,
      '$set status: gone 要被驗證擋下（錯誤碼 121）')
    assert.equal((await col().findOne({ _id: insertedId }))?.status, 'open', '被擋下的更新不能生效')
  })
})
