import test from 'node:test'
import assert from 'node:assert/strict'
import { PRODUCTS, shuffle } from '../../helpers/coffee.ts'
import { int, random, setup } from './testkit.ts'

const opts = { timeout: 30_000 }

const HISTORY = /* GraphQL */ `
  query ($id: ID!, $first: Int, $after: String) {
    customer(id: $id) {
      orders(first: $first, after: $after) {
        edges { cursor node { id } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`

test('菜單：menuWithStock 有 6 個商品，價格來自資料庫、available 來自庫存服務', opts, async () => {
  const { ask, pg, stock } = await setup()
  const prices = new Map(PRODUCTS.map(p => [p.id, 60 + int(100)]))
  for (const [id, price] of prices) await pg.query('UPDATE products SET price = $1 WHERE id = $2', [price, Number(id)])
  const { body } = await ask('{ menuWithStock { available product { id name price } } }')
  assert.equal(body.errors, undefined, `不應該有錯誤：${JSON.stringify(body.errors)}`)
  const items = body.data.menuWithStock
  assert.equal(items.length, 6, '菜單要有 6 個商品')
  for (const it of items) {
    assert.equal(it.product.price, prices.get(it.product.id), `商品 ${it.product.id} 的價格要讀資料庫`)
    assert.equal(it.available, stock.get(it.product.id), `商品 ${it.product.id} 的 available 要是庫存服務回傳的數字`)
  }
})

test('訂單歷史：一頁一頁走完，不重複、不遺漏；翻頁途中有新訂單也一樣（keyset，不是 OFFSET）', opts, async () => {
  const { ask, pg, login } = await setup()
  const staff = login('staff-1', 'STAFF')
  const id = String(1 + int(6))
  const expected = (await pg.query<{ id: number }>('SELECT id FROM orders WHERE customer_id = $1 ORDER BY ordered_at DESC, id DESC', [Number(id)])).rows.map(r => String(r.id))
  const first = 7 + int(9)
  const seen: string[] = []
  let after: string | null = null
  for (let page = 0; page < 100; page++) {
    const { body } = await ask(HISTORY, { id, first, after }, staff)
    assert.equal(body.errors, undefined, `第 ${page + 1} 頁不應該有錯誤：${JSON.stringify(body.errors)}`)
    const conn = body.data.customer.orders
    seen.push(...conn.edges.map((e: { node: { id: string } }) => e.node.id))
    if (page === 0) {
      // 第一頁之後，這位顧客剛好又下了一張新訂單（比所有訂單都新）
      await pg.query(`INSERT INTO orders (customer_id, ordered_at, total) VALUES ($1, now(), 80)`, [Number(id)])
    }
    if (!conn.pageInfo.hasNextPage) break
    after = conn.pageInfo.endCursor
  }
  assert.equal(new Set(seen).size, seen.length,
    `翻頁時出現重複的訂單（${seen.length - new Set(seen).size} 筆）：用 OFFSET 分頁，前面多一張新訂單就會整個往後推一格。改用 keyset：WHERE (ordered_at, id) < (游標的值)`)
  assert.deepEqual(seen, expected, `每頁 ${first} 筆走完，應該剛好拿到開始翻頁時的 ${expected.length} 張訂單，順序是新的在前`)
})

test('最深的訂單歷史查詢（first: 20，含 items、product、customer）最多 6 句 SQL', opts, async () => {
  const { ask, log, login } = await setup()
  const id = String(1 + int(6))
  const query = /* GraphQL */ `
    query ($first: Int) {
      me {
        name
        orders(first: $first) {
          edges { node { id total customer { name } items { quantity unitPrice product { name price } } } }
          pageInfo { hasNextPage }
        }
      }
    }`
  log.length = 0
  const { body } = await ask(query, { first: 20 }, login(id))
  assert.equal(body.errors, undefined, `不應該有錯誤：${JSON.stringify(body.errors)}`)
  const edges = body.data.me.orders.edges
  assert.equal(edges.length, 20, '要回傳 20 張訂單')
  assert.ok(edges.every((e: any) => e.node.items.length > 0 && e.node.items.every((i: any) => i.product?.name)), '每張訂單都要有品項與商品名稱')
  assert.ok(log.length <= 6,
    `這個查詢發出了 ${log.length} 句 SQL（上限 6）：關聯欄位（Order.customer、Order.items、OrderItem.product）要用 ctx.loaders 的 DataLoader，batch 函式裡只能有一句 WHERE … = ANY($1)。實際的 SQL：\n${log.slice(0, 8).map(s => s.replace(/\s+/g, ' ').trim()).join('\n')}`)
})

test('授權：顧客只看得到自己的訂單（每一條路徑），email 與備註只有店員看得到', opts, async () => {
  const { ask, pg, login } = await setup()
  const [me, other] = shuffle(['1', '2', '3', '4', '5', '6'], random)
  const note = `備註-${int(1e6)}`
  await pg.query('UPDATE orders SET internal_note = $1', [note])
  const mine = login(me), staff = login('staff-1', 'STAFF')
  const otherOrder = String((await pg.query<{ id: number }>('SELECT id FROM orders WHERE customer_id = $1 ORDER BY random() LIMIT 1', [Number(other)])).rows[0].id)

  const viaCustomer = await ask(`{ customer(id: "${other}") { name orders(first: 50) { edges { node { id } } } } }`, undefined, mine)
  assert.ok(viaCustomer.body.data?.customer?.name, 'customer(id) 的名字是公開資料，照常回傳')
  assert.equal(viaCustomer.body.data.customer.orders.edges.length, 0, 'customer(id: 別人).orders 要是空的：Customer.orders 先用 canSeeOrdersOf 檢查，看不到回 EMPTY')

  const direct = await ask(`{ order(id: "${otherOrder}") { id total } }`, undefined, mine)
  assert.equal(direct.body.data?.order ?? null, null, 'order(id: 別人的訂單) 不能回傳資料')
  assert.equal(direct.body.errors?.[0]?.extensions?.code, 'FORBIDDEN', 'order(id: 別人的訂單) 要回 FORBIDDEN：用 auth.ts 的 requireOrder')
  const anonymous = await ask(`{ order(id: "${otherOrder}") { id } }`)
  assert.equal(anonymous.body.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED', '沒登入查 order(id) 要回 UNAUTHENTICATED')

  const viaProduct = await ask('{ menuWithStock { product { orders(first: 50) { id customer { id } } } } }', undefined, mine)
  const owners = viaProduct.body.data.menuWithStock.flatMap((m: any) => m.product.orders.map((o: any) => o.customer.id))
  assert.ok(owners.length > 0, 'Product.orders 應該看得到自己的訂單')
  assert.ok(owners.every((c: string) => c === me), 'Product.orders 拿到了別人的訂單：顧客只能看到自己的（條件寫進 SQL：店員不限、顧客 customer_id = 自己）')
  // first: k 要拿到「自己的」前 k 張，不是先取全部人的前 k 張再濾掉別人的（那樣常常不到 k 張）
  const k = 3 + int(3)
  const own = new Map((await pg.query<{ product_id: number, n: number }>(
    `SELECT i.product_id, count(DISTINCT o.id)::int AS n FROM orders o JOIN order_items i ON i.order_id = o.id
     WHERE o.customer_id = $1 GROUP BY i.product_id`, [Number(me)])).rows.map(r => [String(r.product_id), r.n]))
  const limited = await ask(`{ menuWithStock { product { id orders(first: ${k}) { id } } } }`, undefined, mine)
  for (const m of limited.body.data.menuWithStock) {
    const want = Math.min(k, own.get(m.product.id) ?? 0)
    assert.equal(m.product.orders.length, want,
      `商品 ${m.product.id} 的 orders(first: ${k}) 應該有 ${want} 張（自己買過這個商品的訂單共 ${own.get(m.product.id) ?? 0} 張），實際 ${m.product.orders.length} 張：顧客的條件要寫進 SQL 的 WHERE，不要先 LIMIT 再用 JavaScript 濾掉別人的`)
  }
  const anonProduct = await ask('{ menuWithStock { product { orders { id } } } }')
  assert.ok(anonProduct.body.data.menuWithStock.every((m: any) => m.product.orders.length === 0), '沒登入時 Product.orders 要是空陣列')

  const privateFields = '{ me { email orders(first: 3) { edges { node { internalNote customer { email } } } } } }'
  const self = await ask(privateFields, undefined, mine)
  assert.equal(self.body.data.me.email, null, '顧客拿到的 email 要是 null（個資只有店員看得到）：Customer.email 用 staffOnly')
  for (const e of self.body.data.me.orders.edges) {
    assert.equal(e.node.internalNote, null, '顧客拿到的 internalNote 要是 null：Order.internalNote 用 staffOnly')
    assert.equal(e.node.customer.email, null, '從 Order.customer 繞過去也不能拿到 email')
  }
  const asStaff = await ask(`{ customer(id: "${other}") { email orders(first: 2) { edges { node { internalNote } } } } }`, undefined, staff)
  assert.equal(asStaff.body.data.customer.email, `guest${other}@example.tw`, '店員要看得到 email')
  assert.equal(asStaff.body.data.customer.orders.edges[0]?.node.internalNote, note, '店員要看得到別人的訂單與 internalNote')
})

test('DataLoader 每個請求一份：資料改了，下一個請求要看到新的值', opts, async () => {
  const { ask, pg, login } = await setup()
  const id = String(1 + int(6))
  const query = `{ customer(id: "${id}") { name } me { name orders(first: 1) { edges { node { items { product { name } } } } } } }`
  const before = await ask(query, undefined, login(id))
  assert.equal(before.body.errors, undefined, `不應該有錯誤：${JSON.stringify(before.body.errors)}`)
  const productId = Number((await pg.query<{ product_id: number }>(
    `SELECT product_id FROM order_items WHERE order_id = (SELECT id FROM orders WHERE customer_id = $1 ORDER BY ordered_at DESC, id DESC LIMIT 1) ORDER BY product_id LIMIT 1`, [Number(id)])).rows[0].product_id)
  const name = `新名字-${int(1e6)}`, product = `新品名-${int(1e6)}`
  await pg.query('UPDATE customers SET name = $1 WHERE id = $2', [name, Number(id)])
  await pg.query('UPDATE products SET name = $1 WHERE id = $2', [product, productId])
  const after = await ask(query, undefined, login(id))
  assert.equal(after.body.data.customer.name, name, '第二個請求還拿到舊的顧客名字：loader 不能跨請求共用（不要在模組層級保存 loader 或快取）')
  assert.equal(after.body.data.me.orders.edges[0].node.items[0].product.name, product, '第二個請求還拿到舊的商品名稱：每個請求要有自己的 loader')
})
