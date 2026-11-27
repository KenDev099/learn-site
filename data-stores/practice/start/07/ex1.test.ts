import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { Decimal128 } from 'mongodb'
import { useMongo } from '../../helpers/mongo.ts'
import { toDocument, type StoreInput } from './model.ts'

const { db } = useMongo(7)

const input: StoreInput = {
  name: '信義門市',
  city: '台北市',
  addressLine: '信義區松高路 11 號',
  hours: [{ day: 1, open: '07:30', close: '20:00' }, { day: 6, open: '09:00', close: '18:00' }],
  featured: [
    { id: 12, name: '拿鐵', price: '110', stock: 35, description: '雙份濃縮加牛奶' },
    { id: 15, name: '可頌', price: '70.5', stock: 8, description: '每天早上現烤' },
  ],
  promoEndsAt: '2026-12-31T15:59:59.000Z',
}

describe('練習 1：門市活動頁的文件模型', { timeout: 30_000 }, () => {
  test('toDocument 的結果存進 MongoDB 再讀回來，型別要對', async () => {
    const col = db.collection('stores')
    const { insertedId } = await col.insertOne(toDocument(structuredClone(input)))
    const doc = await col.findOne({ _id: insertedId })
    assert.ok(doc, '讀不到剛存進去的文件')
    assert.equal(doc.name, '信義門市')
    assert.ok(doc.promoEndsAt instanceof Date, `promoEndsAt 要存成 Date（BSON date），讀回來是 ${typeof doc.promoEndsAt}：字串無法正確比較時間，也不能用日期運算`)
    assert.equal(doc.promoEndsAt.toISOString(), input.promoEndsAt, 'promoEndsAt 的時間要跟輸入的 ISO 字串相同')
  })

  test('地址與營業時間內嵌在門市文件裡', async () => {
    const doc = await db.collection('stores').findOne({ name: '信義門市' })
    assert.deepEqual(doc?.address, { city: '台北市', line: '信義區松高路 11 號' }, 'address 要是內嵌物件 { city, line }')
    assert.ok(Array.isArray(doc?.hours), 'hours 要是內嵌在文件裡的陣列：營業時間永遠跟門市一起讀，不要放到另一個集合')
    assert.deepEqual(doc.hours, input.hours, 'hours 的內容要跟輸入相同')
    assert.equal(await db.collection('hours').countDocuments(), 0, '不要另外建 hours 集合')
  })

  test('推薦商品只存 productId、品名、價格快照，價格是 Decimal128', async () => {
    const doc = await db.collection('stores').findOne({ name: '信義門市' })
    assert.equal(doc?.featured?.length, 2, 'featured 要有 2 個商品')
    for (const [i, item] of doc.featured.entries()) {
      assert.deepEqual(Object.keys(item).sort(), ['name', 'price', 'productId'], `featured[${i}] 只能有 productId、name、price：庫存、描述會變動，留在商品的正式資料裡，不要整份內嵌`)
      assert.ok(item.price instanceof Decimal128, `featured[${i}].price 要是 Decimal128：用 number 存會變成 int 或 double，0.1 + 0.2 這類小數會有誤差`)
    }
    assert.deepEqual(doc.featured.map((f: { productId: unknown; name: string; price: Decimal128 }) => [f.productId, f.name, f.price.toString()]),
      [[12, '拿鐵', '110'], [15, '可頌', '70.5']], 'productId 是 number，價格要跟輸入的字串一樣精確（Decimal128.fromString）')
  })

  test('換一份輸入也要照樣轉換，不能只對範例資料有效', () => {
    const doc = toDocument({
      name: '台中門市', city: '台中市', addressLine: '西區公益路 68 號',
      hours: [{ day: 0, open: '10:00', close: '17:00' }],
      featured: [{ id: 21, name: '起司蛋糕', price: '120.25', stock: 3, description: '重乳酪' }],
      promoEndsAt: '2027-01-15T04:00:00.000Z',
    })
    assert.equal(doc.name, '台中門市', 'name 要來自輸入')
    assert.deepEqual(doc.address, { city: '台中市', line: '西區公益路 68 號' }, 'address 要用輸入的 city 與 addressLine 組成')
    assert.deepEqual(doc.hours, [{ day: 0, open: '10:00', close: '17:00' }], 'hours 要來自輸入')
    assert.deepEqual(doc.featured.map(f => [f.productId, f.name, f.price.toString()]), [[21, '起司蛋糕', '120.25']], 'featured 要逐一轉換輸入的商品')
    assert.equal(doc.promoEndsAt.toISOString(), '2027-01-15T04:00:00.000Z', 'promoEndsAt 要用 new Date(input.promoEndsAt)')
  })
})
