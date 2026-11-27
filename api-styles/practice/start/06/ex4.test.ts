import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mulberry32, PRODUCTS } from '../../helpers/coffee.ts'
import { createApp } from './persisted.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const id = String(1 + Math.floor(random() * PRODUCTS.length))

// 每次的清單都不同（別名隨機）：雜湊寫死在程式裡不會過
const tag = Math.floor(random() * 1e6).toString(36)
const menuQuery = `query Menu_${tag} { items_${tag}: menu { name price } }`
const productQuery = `query Product_${tag}($id: ID!) { product(id: $id) { name } }`
const operations = { [sha256(menuQuery)]: menuQuery, [sha256(productQuery)]: productQuery }
const CSRF = { 'x-graphql-yoga-csrf': '1' }

type Res = { status: number, body: any }
async function post(yoga: ReturnType<typeof createApp>, payload: object, headers: Record<string, string> = {}): Promise<Res> {
  const res = await yoga.fetch('http://yoga/graphql', {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/graphql-response+json', ...headers }, body: JSON.stringify(payload),
  })
  return { status: res.status, body: await res.json() }
}
const byHash = (hash: string, variables?: object) => ({ variables, extensions: { persistedQuery: { version: 1, sha256Hash: hash } } })
const codeOf = (r: Res) => r.body.errors?.[0]?.extensions?.code

test('正式環境：用雜湊送清單裡的操作會執行（含變數）', opts, async () => {
  const yoga = createApp({ operations })
  const menu = await post(yoga, byHash(sha256(menuQuery)))
  assert.equal(menu.body.errors, undefined, `清單裡的操作要能執行：${JSON.stringify(menu.body.errors)}。getPersistedOperation(key) 要從 operations 用雜湊找出查詢文字`)
  assert.equal(menu.body.data?.[`items_${tag}`]?.length, PRODUCTS.length)
  const one = await post(yoga, byHash(sha256(productQuery), { id }))
  assert.equal(one.body.data?.product?.name, PRODUCTS.find(p => p.id === id)!.name, '帶變數的已登記操作也要能執行')
})

test('正式環境：送查詢文字被拒，送不在清單裡的雜湊也被拒', opts, async () => {
  const yoga = createApp({ operations })
  const text = await post(yoga, { query: '{ menu { name price } }' })
  assert.equal(text.body.data ?? null, null, '正式環境不能執行任意的查詢文字：allowArbitraryOperations 要是 false')
  assert.ok(text.body.errors?.length, '送查詢文字要回錯誤')
  const notListed = await post(yoga, { query: '{ menu { id } }' }, { 'x-allow-arbitrary': 'true', 'x-debug': '1' })
  assert.equal(notListed.body.data ?? null, null, '請求帶了 x-allow-arbitrary 標頭就能送任意查詢：允不允許只能由伺服器的設定（dev）決定，不能看請求')
  for (const key of [sha256('{ menu { id } }'), 'toString', '__proto__', 'constructor']) {
    const r = await post(yoga, byHash(key))
    assert.equal(codeOf(r), 'PERSISTED_QUERY_NOT_IN_LIST',
      `雜湊「${key}」不在清單裡，要回 PERSISTED_QUERY_NOT_IN_LIST（現在：${JSON.stringify(r.body.errors)}）。查不到時 getPersistedOperation 要回 null；用 Map 或 Object.hasOwn 查，operations[key] 會查到原型上的 toString`)
  }
})

test('開發模式（dev: true）：可以送任意查詢文字，雜湊照樣能用', opts, async () => {
  const yoga = createApp({ operations, dev: true })
  const text = await post(yoga, { query: '{ menu { name } }' })
  assert.equal(text.body.errors, undefined, `開發模式要允許任意查詢：${JSON.stringify(text.body.errors)}（allowArbitraryOperations: dev）`)
  assert.equal(text.body.data?.menu?.length, PRODUCTS.length)
  const hashed = await post(yoga, byHash(sha256(menuQuery)))
  assert.equal(hashed.body.errors, undefined, '開發模式下，用雜湊送也要能執行')
})

test('CSRF：沒帶 x-graphql-yoga-csrf 標頭的 GET 被拒（403）；帶了就能執行；JSON 的 POST 不受影響', opts, async () => {
  for (const dev of [false, true]) {
    const yoga = createApp({ operations, dev })
    const url = `http://yoga/graphql?extensions=${encodeURIComponent(JSON.stringify(byHash(sha256(menuQuery)).extensions))}`
    const bare = await yoga.fetch(url, { headers: { accept: 'application/graphql-response+json' } })
    assert.equal(bare.status, 403, `dev: ${dev} 時，沒帶 CSRF 標頭的 GET 要回 403（現在 ${bare.status}）：加上 useCSRFPrevention({ requestHeaders: ['x-graphql-yoga-csrf'] })`)
    const withHeader = await yoga.fetch(url, { headers: { accept: 'application/graphql-response+json', ...CSRF } })
    const body = await withHeader.json()
    assert.equal(body.errors, undefined, `帶了 x-graphql-yoga-csrf 的 GET 要能執行：${JSON.stringify(body.errors)}（requestHeaders 要用 x-graphql-yoga-csrf）`)
    assert.equal(body.data?.[`items_${tag}`]?.length, PRODUCTS.length)
  }
})
