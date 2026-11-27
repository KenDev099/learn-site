import test from 'node:test'
import assert from 'node:assert/strict'
import { createInMemoryCache, type Cache } from '@graphql-yoga/plugin-response-cache'
import { gql, quietYogaLogs } from '../../helpers/graphql.ts'
import { buildYoga } from './server.ts'
import { setup } from './testdata.ts'
import { cachePlugin } from './cache.ts'

quietYogaLogs()
const opts = { timeout: 10_000 }

// 包一層記錄的快取：看得到每一次 set 的 ttl，不用真的等時間過去
function recordingCache() {
  const inner = createInMemoryCache()
  const sets: { query: string, ttl: number }[] = []
  let current = ''
  const cache: Cache = {
    get: key => inner.get(key),
    set: (key, value, entities, ttl) => { sets.push({ query: current, ttl }); return inner.set(key, value, entities, ttl) },
    invalidate: entities => inner.invalidate(entities),
  }
  return { cache, sets, label: (q: string) => { current = q } }
}

function shop() {
  const data = setup()
  const rec = recordingCache()
  const yoga = buildYoga(data.store, [cachePlugin({ cache: rec.cache })])
  const ask = async (label: string, query: string, customerId: string | null, variables?: Record<string, unknown>) => {
    rec.label(label)
    const res = await gql(yoga, query, variables, customerId ? { 'x-customer-id': customerId } : {})
    assert.equal(res.body.errors, undefined, `${label} 不應該有錯誤：${JSON.stringify(res.body.errors)}`)
    return res.body.data
  }
  return { ...data, rec, ask }
}

const MENU = '{ menu { id name price } }'
const ME = '{ me { id name } }'
const HISTORY = 'query ($id: ID!) { customer(id: $id) { id name orders(first: 3) { edges { node { id total } } } } }'

test('menu 存 60 秒、me 存 10 秒、其他查詢不存（而且用傳進來的 cache）', opts, async () => {
  const { ask, rec, withOrders } = shop()
  await ask('menu', MENU, withOrders[0])
  await ask('me', ME, withOrders[0])
  await ask('customer', HISTORY, withOrders[0], { id: withOrders[1] })
  assert.ok(rec.sets.length > 0, '傳進來的 cache 一次都沒有被寫入：useResponseCache({ cache }) 要用參數給的 cache，不要自己 createInMemoryCache()')
  const ttl = (label: string) => rec.sets.filter(s => s.query === label).map(s => s.ttl)
  assert.deepEqual(ttl('menu'), [60_000], `menu 要快取 60 秒（ttlPerSchemaCoordinate 的 'Query.menu': 60_000），實際寫入的 ttl：${JSON.stringify(ttl('menu'))}`)
  assert.deepEqual(ttl('me'), [10_000], `me 是個人資料，只快取 10 秒（'Query.me': 10_000），實際寫入的 ttl：${JSON.stringify(ttl('me'))}`)
  assert.deepEqual(ttl('customer'), [], `沒列出的查詢（這裡是 customer 的訂單歷史）不能被快取：預設 ttl 是 Infinity，要設 ttl: 0。實際寫入的 ttl：${JSON.stringify(ttl('customer'))}`)
})

test('同一位顧客第二次查 menu 命中快取，resolver 不再執行', opts, async () => {
  const { ask, store, withOrders } = shop()
  const a = await ask('menu', MENU, withOrders[0])
  const b = await ask('menu', MENU, withOrders[0])
  assert.deepEqual(b, a, '兩次的 menu 要一樣')
  assert.equal(store.calls['Query.menu'], 1, `Query.menu 的 resolver 執行了 ${store.calls['Query.menu']} 次，第二次應該直接用快取`)
  assert.deepEqual(a.menu.map((p: { price: number }) => p.price), store.products.map(p => p.price), 'menu 的價格要是目前的價格')
})

test('me 依使用者分開快取：不同顧客各自拿到自己的資料', opts, async () => {
  const { ask, store, withOrders, empty } = shop()
  const [x, y] = [withOrders[0], empty]
  const name = (id: string) => store.customers.find(c => c.id === id)!.name
  assert.equal((await ask('me', ME, x)).me?.name, name(x), 'me 要是目前登入的顧客')
  const other = (await ask('me', ME, y)).me?.name
  assert.equal(other, name(y), `顧客 ${y} 查 me 拿到「${other}」，應該是「${name(y)}」：回應快取的鍵要包含使用者，session 要回傳 x-customer-id，不能是固定值或 null`)
  assert.equal((await ask('me', ME, null)).me, null, '沒登入的請求，me 要是 null（不能拿到別人快取的資料）')
  const calls = store.calls['Query.me']
  assert.equal((await ask('me', ME, x)).me?.name, name(x))
  assert.equal(store.calls['Query.me'], calls, '同一位顧客第二次查 me 要命中快取')
})

test('updatePrice 之後，含那個商品的 menu 快取失效，拿到新價格', opts, async () => {
  const { ask, store, withOrders, random } = shop()
  const who = withOrders[0]
  await ask('menu', MENU, who)
  const product = store.products[Math.floor(random() * store.products.length)]
  const price = product.price + 10 + Math.floor(random() * 50)
  await ask('updatePrice', 'mutation ($id: ID!, $price: Int!) { updatePrice(productId: $id, price: $price) { id price } }', who, { id: product.id, price })
  const menu = (await ask('menu', MENU, who)).menu
  const seen = menu.find((p: { id: string }) => p.id === product.id).price
  assert.equal(seen, price, `改價後 menu 裡的 ${product.name} 還是 ${seen}，應該是 ${price}：invalidateViaMutation 要開著（預設 true），mutation 回傳的 Product（含 id）才會讓含它的快取失效`)
  assert.equal(store.calls['Query.menu'], 2, '改價後的 menu 要重新執行 resolver')
})
