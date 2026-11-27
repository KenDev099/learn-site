import test from 'node:test'
import assert from 'node:assert/strict'
import { gql } from '../../helpers/graphql.ts'
import { createDb } from './db.ts'
import { randomTables } from './testdata.ts'
import { shuffle } from '../../helpers/coffee.ts'
import { buildYoga } from './server.ts'

const opts = { timeout: 10_000 }
const Q = '{ me { id name } myOrders { id } }'

// 兩位顧客各有自己的訂單
function setup() {
  const { tables, random } = randomTables()
  const [a, b] = shuffle(tables.customers, random)
  tables.orders.forEach((o, i) => { o.customer_id = i % 2 ? a.id : b.id })
  const db = createDb(tables)
  const mine = (id: string) => tables.orders.filter(o => o.customer_id === id).map(o => ({ id: o.id }))
  return { db, a, b, mine }
}

test('兩個請求同時進行時，各自拿到自己的顧客與訂單', opts, async () => {
  const { db, a, b, mine } = setup()
  // 讓第一個請求的資料庫呼叫先停住，等第二個請求整個做完再放行
  let hold = true, entered!: () => void
  const firstCall = new Promise<void>(r => { entered = r })
  const waiting: (() => void)[] = []
  for (const key of ['customerById', 'productById', 'orderById', 'listOrders', 'ordersByCustomer', 'itemsByOrder'] as const) {
    const original = db[key] as (...args: any[]) => Promise<unknown>
    ;(db as any)[key] = async (...args: unknown[]) => {
      if (hold) { entered(); await new Promise<void>(r => waiting.push(r)) }
      return original(...args)
    }
  }
  const yoga = buildYoga(db)
  const first = gql(yoga, Q, undefined, { 'x-customer-id': a.id })
  await firstCall
  hold = false
  const second = await gql(yoga, Q, undefined, { 'x-customer-id': b.id })
  waiting.forEach(r => r())
  const firstRes = await first
  for (const [res, who] of [[second, b], [firstRes, a]] as const) {
    assert.equal(res.body.errors, undefined, `不應該有錯誤：${res.body.errors?.[0]?.message}`)
    assert.deepEqual(res.body.data.me, { id: who.id, name: who.name }, `x-customer-id: ${who.id} 的請求，me 要是${who.name}`)
    assert.deepEqual(res.body.data.myOrders, mine(who.id),
      `x-customer-id: ${who.id} 的請求拿到了別人的訂單：await 期間另一個請求改掉了模組變數。目前的顧客要放在每個請求自己的 context（viewer）裡，resolver 從 context 讀`)
  }
})

test('每位顧客的請求同時送出，各自拿到自己的顧客與訂單', opts, async () => {
  const { tables } = randomTables()
  const db = createDb(tables)
  const yoga = buildYoga(db)
  const all = await Promise.all(tables.customers.map(c => gql(yoga, Q, undefined, { 'x-customer-id': c.id })))
  all.forEach(({ body }, i) => {
    const who = tables.customers[i]
    assert.equal(body.errors, undefined, `不應該有錯誤：${body.errors?.[0]?.message}`)
    assert.deepEqual(body.data, {
      me: { id: who.id, name: who.name },
      myOrders: tables.orders.filter(o => o.customer_id === who.id).map(o => ({ id: o.id })),
    }, `同時進來的請求裡，x-customer-id: ${who.id} 拿到了別人的資料：在 resolver 開頭就先讀模組變數也沒用，另一個請求的 createContext 可能已經改掉它。目前的顧客要放在每個請求自己的 context（viewer）裡`)
  })
})

test('一個接一個的請求，也各自是自己的顧客', opts, async () => {
  const { db, a, b, mine } = setup()
  const yoga = buildYoga(db)
  for (const who of [a, b, a]) {
    const { body } = await gql(yoga, Q, undefined, { 'x-customer-id': who.id })
    assert.equal(body.errors, undefined, `不應該有錯誤：${body.errors?.[0]?.message}`)
    assert.deepEqual(body.data, { me: { id: who.id, name: who.name }, myOrders: mine(who.id) },
      `x-customer-id: ${who.id} 的請求要拿到${who.name}和他的訂單（viewer 每個請求重新查，不要留著上一個請求的）`)
  }
})

test('沒帶 x-customer-id 或顧客不存在：me 是 null、myOrders 是空陣列，沒有錯誤', opts, async () => {
  const { db, a } = setup()
  const yoga = buildYoga(db)
  await gql(yoga, Q, undefined, { 'x-customer-id': a.id })
  for (const headers of [{}, { 'x-customer-id': '999' }] as Record<string, string>[]) {
    const { body } = await gql(yoga, Q, undefined, headers)
    assert.equal(body.errors, undefined, `沒登入是正常情況，不要丟錯：${body.errors?.[0]?.message}`)
    assert.deepEqual(body.data, { me: null, myOrders: [] }, `${'x-customer-id' in headers ? '不存在的顧客' : '沒帶標頭'}時 me 要是 null、myOrders 要是 []（也不能沿用前一個請求的顧客）`)
  }
})
