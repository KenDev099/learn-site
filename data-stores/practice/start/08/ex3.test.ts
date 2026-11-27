import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { CommandStartedEvent } from 'mongodb'
import { useMongo } from '../../helpers/mongo.ts'
import { cityStats, type Store } from './stats.ts'

// monitorCommands：記錄這個 client 送出的每個命令，用來確認只送了一次 aggregate
const { client, db } = useMongo(8, { monitorCommands: true })
const stores = db.collection<Store>('ex3_stores')

// 固定的測試資料：每個城市有營業中、關閉、整修中的門市；最高分的門市不是第一個新增的
function seed(): Store[] {
  const cities = ['台北', '台中', '高雄', '台南', '新竹']
  const list: Store[] = []
  for (let i = 0; i < 60; i++) {
    const city = cities[i % 5]
    const status = i % 7 === 3 ? 'closed' : i % 11 === 5 ? 'renovating' : 'open'
    list.push({ name: `${city}門市 ${i + 10}`, city, status, rating: ((i * 37) % 41) / 10 + 1, reviewCount: (i * 53) % 97 + 10 })
  }
  // 關閉、整修中的門市給很高或很低的分數：算進去的話平均和最高分都會錯
  list.push({ name: '台北關閉門市 99', city: '台北', status: 'closed', rating: 5, reviewCount: 900 })
  list.push({ name: '高雄整修門市 98', city: '高雄', status: 'renovating', rating: 5, reviewCount: 800 })
  list.push({ name: '台中整修門市 97', city: '台中', status: 'renovating', rating: 1, reviewCount: 700 })
  return list
}

function expected(list: Store[]) {
  const by = new Map<string, Store[]>()
  for (const s of list.filter(s => s.status === 'open')) by.set(s.city, [...(by.get(s.city) ?? []), s])
  return [...by].map(([city, ss]) => ({
    city,
    avgRating: ss.reduce((a, s) => a + s.rating, 0) / ss.length,
    reviews: ss.reduce((a, s) => a + s.reviewCount, 0),
    topStore: ss.reduce((a, s) => s.rating > a.rating ? s : a).name,
  })).sort((a, b) => b.avgRating - a.avgRating)
}

describe('練習 3：aggregation pipeline 的城市統計', { timeout: 30_000 }, () => {
  test('每個城市的平均評分、評論數、最高分門市（只算營業中），依平均評分由高到低', async () => {
    const list = seed()
    await stores.insertMany(list.map(s => ({ ...s })))
    const want = expected(list)
    const got = await cityStats(stores)
    assert.deepEqual(got.map(r => r.city), want.map(r => r.city), '城市的順序要依 avgRating 由高到低；只算 status 是 open 的門市（renovating 也不算）')
    for (const [i, w] of want.entries()) {
      const g = got[i]
      assert.deepEqual(Object.keys(g).sort(), ['avgRating', 'city', 'reviews', 'topStore'], `每一筆只要 city、avgRating、reviews、topStore 四個欄位（$project 把 _id 改名成 city、拿掉 _id），拿到 ${JSON.stringify(g)}`)
      assert.ok(Math.abs(g.avgRating - w.avgRating) < 1e-9, `${w.city} 的 avgRating 應該是 ${w.avgRating}，拿到 ${g.avgRating}：只算營業中的門市`)
      assert.equal(g.reviews, w.reviews, `${w.city} 的 reviews 是營業中門市的 reviewCount 加總`)
      assert.equal(g.topStore, w.topStore, `${w.city} 的 topStore 應該是 ${w.topStore}，拿到 ${g.topStore}：$first 拿的是「進到 $group 的第一份」，前面要先 $sort 評分由高到低（或用 $top）`)
    }
  })

  test('只送一次 aggregate、第一個 stage 是 $match，不在 Node 端算', async () => {
    const seen: CommandStartedEvent[] = []
    const on = (e: CommandStartedEvent) => { if (e.databaseName === db.databaseName) seen.push(e) }
    client.on('commandStarted', on)
    try { await cityStats(stores) } finally { client.off('commandStarted', on) }
    const names = seen.map(e => e.commandName).filter(n => n !== 'getMore')
    assert.deepEqual(names, ['aggregate'], `cityStats 送出的命令是 ${JSON.stringify(names)}：要用一個 aggregate 在資料庫算完，不要 find 拿回全部再用 reduce`)
    const first = seen[0].command.pipeline[0]
    assert.ok('$match' in first, `pipeline 的第一個 stage 是 ${Object.keys(first)[0]}：先用 $match 篩出營業中的門市，後面的 stage 才不用處理不需要的文件，也才用得到索引`)
    const kept = await stores.find(first.$match).project({ _id: 0, status: 1 }).toArray()
    assert.ok(kept.length > 0 && kept.every(s => s.status === 'open'),
      `第一個 $match 留下了 ${kept.length} 家門市，其中有不是 open 的：營業中的條件要寫在第一個 $match，不要等分組之後才篩`)
  })
})
