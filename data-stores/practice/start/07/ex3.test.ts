import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ObjectId, type Collection, type Document } from 'mongodb'
import { useMongo } from '../../helpers/mongo.ts'
import { addPhoto, checkIn, ensureCheckinIndex, renamePromo, type Checkin, type Store } from './updates.ts'

const { db } = useMongo(7)
const stores = () => db.collection<Store>('stores')
const checkins = () => db.collection<Checkin>('checkins')
const storeId = new ObjectId()
const otherId = new ObjectId()
const photo = (i: number) => ({ url: `https://img.example.tw/${i}.jpg`, alt: `照片 ${i}` })

// 每個回傳 Promise 的方法都晚 30 ms 才完成：「先讀再寫」的寫法在並發時一定會重疊
function slow<T extends Document>(col: Collection<T>): Collection<T> {
  return new Proxy(col, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target)
      if (typeof v !== 'function') return v
      return (...args: unknown[]) => {
        const r = v.apply(target, args)
        return r instanceof Promise ? r.then(async (x: unknown) => { await new Promise(res => setTimeout(res, 30)); return x }) : r
      }
    },
  })
}

describe('練習 3：部分更新', { timeout: 30_000 }, () => {
  test('addPhoto 加到最後面，只保留最新 20 張', async () => {
    await stores().insertMany([
      { _id: otherId, name: '台中門市', status: 'open', photos: [photo(99)], promos: [{ id: 12, title: '台中限定' }] },
      { _id: storeId, name: '信義門市', status: 'open', photos: [], promos: [{ id: 11, title: '早鳥拿鐵' }, { id: 12, title: '週末可頌' }, { id: 13, title: '雙杯優惠' }] },
    ])
    for (let i = 10; i < 35; i++) await addPhoto(stores(), storeId, photo(i))
    const doc = await stores().findOne({ _id: storeId })
    assert.equal(doc?.photos.length, 20, `加了 25 張後要剩 20 張，實際 ${doc?.photos.length} 張：$push 要搭配 $each 與 $slice，陣列才不會無限成長`)
    assert.deepEqual(doc.photos.map((p: { url: string }) => p.url), Array.from({ length: 20 }, (_, i) => photo(i + 15).url),
      '要留下最新的 20 張（15～34），最舊的在前：$slice 用負數 -20 是保留最後 20 個，正數 20 會留下最舊的')
    assert.deepEqual((await stores().findOne({ _id: otherId }))?.photos, [photo(99)], '其他門市的照片不能被改到')
  })

  test('同時加 5 張照片，一張都不能少，其他欄位不變', async () => {
    await stores().updateOne({ _id: storeId }, { $set: { photos: [] } })
    const col = slow(stores())
    await Promise.all([40, 41, 42, 43, 44].map(i => addPhoto(col, storeId, photo(i))))
    const doc = await stores().findOne({ _id: storeId })
    assert.equal(doc?.photos.length, 5, `同時加 5 張，只剩 ${doc?.photos.length} 張：先讀整份、改好再 replaceOne 寫回，後寫的會蓋掉先寫的；用 $push 只改這個陣列`)
    assert.equal(doc.name, '信義門市', 'name 不能被改掉')
    assert.equal(doc.promos.length, 3, 'promos 不能被改掉')
  })

  test('renamePromo 只改 id 相符的那一個活動', async () => {
    await renamePromo(stores(), storeId, 12, '週末可頌買一送一')
    await renamePromo(stores(), storeId, 13, '雙杯 85 折')
    const doc = await stores().findOne({ _id: storeId })
    assert.deepEqual(doc?.promos, [{ id: 11, title: '早鳥拿鐵' }, { id: 12, title: '週末可頌買一送一' }, { id: 13, title: '雙杯 85 折' }],
      '只能改 id 相符的活動：用 arrayFilters（promos.$[p].title）或位置運算子 $，不要寫死 promos.0')
    assert.deepEqual((await stores().findOne({ _id: otherId }))?.promos, [{ id: 12, title: '台中限定' }], '其他門市的同 id 活動不能被改到：篩選條件要有 _id: storeId')
    assert.equal(doc.photos.length, 5, '其他欄位不能被改掉')
  })

  test('ensureCheckinIndex 建立 { storeId: 1, date: 1 } 的唯一索引', async () => {
    await ensureCheckinIndex(checkins())
    const indexes = await checkins().listIndexes().toArray()
    const idx = indexes.find(i => JSON.stringify(i.key) === JSON.stringify({ storeId: 1, date: 1 }))
    assert.ok(idx, `找不到 { storeId: 1, date: 1 } 的索引，現有：${indexes.map(i => JSON.stringify(i.key)).join('、')}`)
    assert.equal(idx.unique, true, '這個索引要是 unique：並發的 upsert 只有靠唯一索引才不會建立兩份同一天的文件')
  })

  test('checkIn 第一次建立當天的文件，之後只把 count 加 1，不覆蓋其他欄位', async () => {
    const now = new Date('2026-11-01T16:30:00Z')   // 台北已經是 11/2
    await checkIn(checkins(), storeId, now)
    const first = await checkins().find({ storeId }).toArray()
    assert.equal(first.length, 1, '第一次 checkIn 要建立一份文件（upsert）')
    assert.equal(first[0].date, '2026-11-02', 'date 用 taipeiDate(now)')
    assert.equal(first[0].count, 1, '第一次的 count 是 1（用 $inc，upsert 時從 0 加 1）')
    await checkins().updateOne({ _id: first[0]._id }, { $set: { note: '店長備註' } })
    await checkIn(checkins(), storeId, new Date('2026-11-02T03:00:00Z'))
    const doc = await db.collection('checkins').findOne({ _id: first[0]._id })
    assert.equal(doc?.count, 2, '同一天第二次 checkIn，count 要變 2')
    assert.equal(doc.note, '店長備註', '其他欄位要保留：不要用 replaceOne 整份覆蓋')
    assert.equal(await checkins().countDocuments({ storeId }), 1, '同一天只能有一份文件')
  })

  test('同時 checkIn 10 次，當天只有一份文件，count 是 10', async () => {
    const col = slow(checkins())
    const now = new Date('2026-11-03T02:00:00Z')
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => checkIn(col, otherId, now)))
    const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[]
    assert.equal(failed.length, 0, `有 ${failed.length} 次 checkIn 失敗：${failed[0]?.reason?.message}\n先 find 再 insert 時，同時進來的請求都以為「還沒有」而一起 insert；用 updateOne 加 upsert: true 一步完成`)
    const docs = await checkins().find({ storeId: otherId, date: '2026-11-03' }).toArray()
    assert.equal(docs.length, 1, `當天出現 ${docs.length} 份文件`)
    assert.equal(docs[0].count, 10, `count 是 ${docs[0].count}，要是 10`)
  })
})
