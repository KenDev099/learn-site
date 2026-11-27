import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { int, setup } from './testkit.ts'

const opts = { timeout: 30_000 }
const manifestFile = new URL('./app/gql/persisted-documents.json', import.meta.url)
const byHash = (hash: string, variables?: object) => ({ variables, extensions: { persistedQuery: { version: 1, sha256Hash: hash } } })

async function post(yoga: { fetch(url: string, init: RequestInit): Response | Promise<Response> }, body: object, headers: Record<string, string> = {}) {
  const res = await yoga.fetch('http://yoga/graphql', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json() as { data?: any, errors?: { message: string, extensions?: { code?: string } }[] } }
}

test('深度：第 6 層照常執行，第 7 層在執行前就被擋下（一句 SQL 都沒有）', opts, async () => {
  const { ask, log, login } = await setup()
  const id = String(1 + int(6))
  const ok = await ask(readFileSync(new URL('./app/orderHistory.graphql', import.meta.url), 'utf8'), { first: 3 }, login(id))
  assert.equal(ok.body.errors, undefined, `App 的 OrderHistory（深度 6）要能執行：${JSON.stringify(ok.body.errors)}`)
  log.length = 0
  const deep = await ask('{ me { orders { edges { node { items { product { orders { id } } } } } } } }', undefined, login(id))
  assert.ok(deep.body.errors?.length && !deep.body.data, '深度 7 的查詢要被擋下：在 plugins 加上 useDepthLimit({ maxDepth: MAX_DEPTH })')
  assert.equal(log.length, 0, `深度 7 的查詢要在執行前被擋，實際卻發出了 ${log.length} 句 SQL`)
})

test('成本：超過 1000 在執行前被擋（QUERY_TOO_COMPLEX），1000 以內照常執行', opts, async () => {
  const { ask, log, login } = await setup()
  const staff = login('staff-1', 'STAFF')
  // 成本 = customer 1 ＋ first ×（orders 1 ＋ edges 1 ＋ node 1 ＋ id 1）＝ 1 + 4n
  const query = 'query ($n: Int) { customer(id: "1") { orders(first: $n) { edges { node { id } } } } }'
  log.length = 0
  const big = await ask(query, { n: 250 }, staff)
  assert.equal(big.body.errors?.[0]?.extensions?.code, 'QUERY_TOO_COMPLEX', `成本 1001 要回 QUERY_TOO_COMPLEX：在 plugins 加上 useCostLimit(MAX_COST)。實際：${JSON.stringify(big.body.errors)}`)
  assert.equal(log.length, 0, '成本超過上限要在執行前被擋，不能發出 SQL')
  const n = 10 + int(41)
  const small = await ask(query, { n }, staff)
  assert.equal(small.body.errors, undefined, `成本 ${1 + 4 * n} 要照常執行：${JSON.stringify(small.body.errors)}`)
  assert.equal(small.body.data.customer.orders.edges.length, n)

  // 剛好 1000 要能執行、1001 要被擋：上限是 MAX_COST，不能自己改小或改大
  // 成本 = typename 個數 ＋ 4 ×（1 + 4 × 50）＋（1 + 4 × 48）＝ typename 個數 ＋ 997
  const exactly = (typenames: number) => `{ ${'__typename '.repeat(typenames)}${[1, 2, 3, 4].map(i =>
    `c${i}: customer(id: "1") { orders(first: 50) { edges { node { id } } } } `).join('')}c5: customer(id: "1") { orders(first: 48) { edges { node { id } } } } }`
  const at1000 = await ask(exactly(3), undefined, staff)
  assert.equal(at1000.body.errors, undefined, `成本剛好 1000 要照常執行（上限是 MAX_COST = 1000，不是更小的數字）：${JSON.stringify(at1000.body.errors)}`)
  const at1001 = await ask(exactly(4), undefined, staff)
  assert.equal(at1001.body.errors?.[0]?.extensions?.code, 'QUERY_TOO_COMPLEX', '成本 1001 要回 QUERY_TOO_COMPLEX')
})

test('正式環境只接受 codegen 產生的白名單；開發模式可以送任意查詢', opts, async () => {
  assert.ok(existsSync(manifestFile), 'app/gql/persisted-documents.json 不存在：graphql-codegen 沒有成功，看 node check.mjs 印出的 codegen 訊息（通常是 schema.graphql 有語法錯誤）')
  const docs: Record<string, string> = JSON.parse(readFileSync(manifestFile, 'utf8'))
  const history = Object.entries(docs).find(([, q]) => q.startsWith('query OrderHistory'))
  assert.ok(history, 'persisted-documents.json 裡要有 OrderHistory')
  const { yoga, log, login } = await setup({ dev: false })
  const id = String(1 + int(6))
  const first = 1 + int(5)
  const listed = await post(yoga, byHash(history[0].replace(/^sha256:/, ''), { first }), login(id))
  assert.equal(listed.body.errors, undefined, `送白名單裡的雜湊要能執行：getPersistedOperation 從 operations 查。實際：${JSON.stringify(listed.body.errors)}`)
  assert.equal(listed.body.data.me.orders.edges.length, first)

  log.length = 0
  const text = await post(yoga, { query: '{ menuWithStock { product { name } } }' }, login(id))
  assert.ok(text.body.errors?.length && !text.body.data, '正式環境（dev: false）送查詢文字要被拒：usePersistedOperations 的 allowArbitraryOperations 要是 dev')
  for (const key of ['0'.repeat(64), 'toString', '__proto__']) {
    const unknown = await post(yoga, byHash(key), login(id))
    assert.ok(unknown.body.errors?.length && !unknown.body.data, `不在白名單裡的雜湊 ${key} 要被拒`)
  }
  assert.equal(log.length, 0, '被拒的請求不能執行任何 resolver')

  const dev = await setup({ dev: true })
  const free = await dev.ask('{ menuWithStock { product { name } } }')
  assert.equal(free.body.errors, undefined, `開發模式（dev: true）要允許任意查詢文字：${JSON.stringify(free.body.errors)}`)
})

test('CSRF：沒有 x-graphql-yoga-csrf 標頭的 GET 被拒', opts, async () => {
  const { yoga } = await setup({ dev: true })
  const url = `http://yoga/graphql?query=${encodeURIComponent('{ menuWithStock { available } }')}`
  const bare = await yoga.fetch(url, { method: 'GET' })
  assert.equal(bare.status, 403, `沒帶標頭的 GET 要回 403：加上 useCSRFPrevention({ requestHeaders: ['x-graphql-yoga-csrf'] })，實際 HTTP ${bare.status}`)
  const withHeader = await yoga.fetch(url, { method: 'GET', headers: { 'x-graphql-yoga-csrf': '1' } })
  assert.equal(withHeader.status, 200, '帶了 x-graphql-yoga-csrf 的 GET 要照常執行')
})

test('錯誤遮罩：內部錯誤只回 Unexpected error. 並記錄原錯誤；預期中的錯誤保留代碼', opts, async () => {
  const { ask, pg, errors } = await setup()
  const column = `name_${int(1e6)}`
  await pg.exec(`ALTER TABLE products RENAME COLUMN name TO ${column}`)
  const broken = await ask('{ menuWithStock { product { name } } }')
  const text = JSON.stringify(broken.body.errors?.map(e => [e.message, e.extensions]))
  assert.ok(broken.body.errors?.length, '資料庫出錯時 errors 要有東西')
  assert.doesNotMatch(text, /column|does not exist|SELECT/i, `SQL 的錯誤訊息洩漏給客戶端了：${text.slice(0, 300)}。maskedErrors 不能是 false，要用 maskError 遮罩`)
  assert.equal(broken.body.errors![0].message, 'Unexpected error.', '非預期的錯誤對外只顯示 Unexpected error.')
  assert.ok(errors.some(e => /column "name" does not exist/.test(String((e as Error)?.message ?? e))),
    'logger.error 沒有收到原本的 SQL 錯誤：在 maskedErrors.maskError 裡，被換掉的錯誤要交給 logger.error（GraphQLError 的話記 originalError）')
  const anonymous = await ask('{ order(id: "1") { id } }')
  assert.equal(anonymous.body.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED', '刻意丟出的 GraphQLError 要保留訊息與 code（不能全部遮罩）')
  assert.equal(anonymous.body.errors?.[0]?.message, '請先登入')
})
