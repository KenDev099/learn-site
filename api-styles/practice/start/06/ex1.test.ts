import test from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from '../../helpers/coffee.ts'
import { gql } from '../../helpers/graphql.ts'
import { createStore, type OrderRow, type Viewer } from './store.ts'
import { buildYoga } from './server.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())
const { store, orders, customers } = createStore(random, 30)

// 伺服器端的 session：token → 誰、什麼角色。token 每次不同
const token = () => Math.floor(random() * 1e12).toString(36)
const tokens = { ming: token(), mei: token(), staff: token() }
const sessions = new Map<string, Viewer>([
  [tokens.ming, { id: '1', role: 'CUSTOMER' }],      // 王小明
  [tokens.mei, { id: '2', role: 'CUSTOMER' }],       // 陳美華
  [tokens.staff, { id: 'staff-1', role: 'STAFF' }],  // 店員
])
const yoga = buildYoga(store, sessions)
const as = (t: string) => ({ authorization: `Bearer ${t}` })
const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)]
const ids = (list: OrderRow[]) => list.map(o => o.id)
const own = (customerId: string) => orders.filter(o => o.customerId === customerId)
const others = (customerId: string) => orders.filter(o => o.customerId !== customerId)
const show = (body: unknown) => JSON.stringify(body)
const ORDER = 'query ($id: ID!) { order(id: $id) { id total internalNote customer { name email } } }'

test('顧客查自己的訂單：拿得到，但 internalNote 與 customer.email 是 null', opts, async () => {
  for (const [t, cid] of [[tokens.ming, '1'], [tokens.mei, '2']] as const) {
    const order = pick(own(cid))
    const { body } = await gql(yoga, ORDER, { id: order.id }, as(t))
    assert.equal(body.errors, undefined, `顧客 ${cid} 查自己的訂單 ${order.id} 不應該有錯誤：${show(body.errors)}`)
    assert.equal(body.data?.order?.id, order.id, `顧客 ${cid} 要拿得到自己的訂單 ${order.id}`)
    assert.equal(body.data.order.internalNote, null, 'internalNote 只有店員看得到：Order.internalNote 要寫 resolver，用 staffOnly 包起來')
    assert.equal(body.data.order.customer.email, null,
      'order.customer.email 洩漏了：Customer 物件不論從哪條路徑來（customer、me、Order.customer），email 都要檢查。在 Customer.email 的 resolver 用 staffOnly，不要只在 Query.customer 裡處理')
  }
})

test('顧客查別人的訂單：FORBIDDEN，order 是 null', opts, async () => {
  const order = pick(others('1'))
  const { body } = await gql(yoga, ORDER, { id: order.id }, as(tokens.ming))
  assert.equal(body.data?.order, null, `王小明拿到了別人的訂單 ${order.id}：${show(body.data)}`)
  assert.equal(body.errors?.[0]?.extensions?.code, 'FORBIDDEN', `查別人的訂單要回 FORBIDDEN（現在：${show(body.errors)}）`)
})

test('沒登入查訂單：UNAUTHENTICATED；登入後查不存在的訂單：null、沒有錯誤', opts, async () => {
  const anon = await gql(yoga, ORDER, { id: pick(orders).id })
  assert.equal(anon.body.data?.order, null, `沒登入拿到了訂單：${show(anon.body.data)}`)
  assert.equal(anon.body.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED', `沒登入要回 UNAUTHENTICATED，不是 FORBIDDEN（現在：${show(anon.body.errors)}）`)
  const missing = await gql(yoga, ORDER, { id: '99999' }, as(tokens.mei))
  assert.equal(missing.body.errors, undefined, `找不到的訂單回 null 就好，不是錯誤：${show(missing.body.errors)}`)
  assert.equal(missing.body.data?.order, null)
})

test('店員：任何訂單、internalNote、email 都看得到', opts, async () => {
  const order = pick(orders.filter(o => o.internalNote))
  const { body } = await gql(yoga, ORDER, { id: order.id }, as(tokens.staff))
  assert.equal(body.errors, undefined, `店員查訂單不應該有錯誤：${show(body.errors)}。檢查 canSeeOrder：role 是 STAFF 就看得到`)
  assert.equal(body.data?.order?.internalNote, order.internalNote, '店員要看得到 internalNote')
  const email = customers.find(c => c.id === order.customerId)!.email
  assert.equal(body.data.order.customer.email, email, '店員要看得到 customer.email')
})

test('Product.orders：顧客只看到自己的、沒登入是空陣列、店員看到全部（列表是過濾，不是整個失敗）', opts, async () => {
  const productId = pick(orders.filter(o => o.customerId === '1')).items[0].productId
  const all = orders.filter(o => o.items.some(it => it.productId === productId))
  const Q = 'query ($id: ID!) { product(id: $id) { name orders { id internalNote } } }'
  const cases: [string, Record<string, string>, OrderRow[]][] = [
    ['王小明', as(tokens.ming), all.filter(o => o.customerId === '1')],
    ['陳美華', as(tokens.mei), all.filter(o => o.customerId === '2')],
    ['沒登入', {}, []],
    ['店員', as(tokens.staff), all],
  ]
  for (const [who, headers, expected] of cases) {
    const { body } = await gql(yoga, Q, { id: productId }, headers)
    assert.equal(body.errors, undefined, `${who}查 product.orders 不應該有錯誤（列表要把看不到的濾掉，不是丟 FORBIDDEN 讓整個列表失敗）：${show(body.errors)}`)
    assert.deepEqual(ids(body.data?.product?.orders ?? []), ids(expected),
      `${who}查 product(id: "${productId}") { orders } 拿到的訂單不對：Product.orders 也是一條拿得到訂單的路徑，要用 visibleOrders 過濾`)
    if (who !== '店員') assert.ok(body.data.product.orders.every((o: { internalNote: unknown }) => o.internalNote === null), `${who}看到了 internalNote`)
  }
})

test('Customer.orders 與 email：查別人的資料只看得到名字；me 看得到自己的全部訂單', opts, async () => {
  const target = pick(customers.filter(c => c.id !== '1'))
  const { body } = await gql(yoga, 'query ($id: ID!) { customer(id: $id) { name email orders { id } } }', { id: target.id }, as(tokens.ming))
  assert.equal(body.errors, undefined, `不應該有錯誤：${show(body.errors)}`)
  assert.equal(body.data?.customer?.name, target.name, '公開的名字要看得到')
  assert.equal(body.data.customer.email, null, `王小明看到了 ${target.name} 的 email：Customer.email 要用 staffOnly`)
  assert.deepEqual(body.data.customer.orders, [], `王小明看到了 ${target.name} 的訂單：Customer.orders 要用 visibleOrders 過濾`)
  const staff = await gql(yoga, 'query ($id: ID!) { customer(id: $id) { orders { id } } }', { id: target.id }, as(tokens.staff))
  assert.deepEqual(ids(staff.body.data?.customer?.orders ?? []), ids(own(target.id)),
    `店員查 customer(id: "${target.id}") { orders } 要看到這位顧客的全部訂單：Customer.orders 用 visibleOrders 過濾，不要寫成「只有本人才回傳」`)

  const me = await gql(yoga, '{ me { email orders { id internalNote customer { email } } } }', undefined, as(tokens.mei))
  assert.equal(me.body.errors, undefined, `不應該有錯誤：${show(me.body.errors)}`)
  assert.deepEqual(ids(me.body.data?.me?.orders ?? []), ids(own('2')), '陳美華的 me.orders 要是她自己的全部訂單')
  assert.ok(me.body.data.me.orders.every((o: any) => o.internalNote === null && o.customer.email === null), '顧客的訂單列表裡，internalNote 與 customer.email 都要是 null')
})

test('客戶端送 x-role: STAFF 之類的標頭，不會變成店員', opts, async () => {
  const order = pick(own('1'))
  const forged = { ...as(tokens.ming), 'x-role': 'STAFF', role: 'STAFF', 'x-user-role': 'STAFF' }
  const { body } = await gql(yoga, `query ($id: ID!) { order(id: $id) { internalNote customer { email } } customer(id: "2") { email orders { id } } }`, { id: order.id }, forged)
  assert.equal(body.data?.order?.internalNote, null, '王小明加了 x-role: STAFF 標頭就看到 internalNote：角色只能看伺服器端的 viewer.role')
  assert.equal(body.data?.order?.customer?.email, null, '王小明加了 x-role: STAFF 標頭就看到 email：角色只能看伺服器端的 viewer.role')
  assert.deepEqual(body.data?.customer?.orders, [], '王小明加了 x-role: STAFF 標頭就看到別人的訂單')
})
