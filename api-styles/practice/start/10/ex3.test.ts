import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MENU_QUERY } from './menuClient.ts'

const opts = { timeout: 60_000 }
const dir = import.meta.dirname
const probe = join(mkdtempSync(join(tmpdir(), 'learn-api-styles-10-')), 'fetch-calls.jsonl')

// 執行你的 pact-consumer.ts（另一個程序）。--import 先載入的這段程式包住 fetch：
// 記錄每次呼叫是不是從 menuClient.ts 發出的；LEARN_TAMPER 時把回應換成空菜單，看你的測試有沒有檢查 fetchMenu 的回傳
const HOOK = `
import { appendFileSync } from 'node:fs'
const real = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const fromClient = /menuClient\\.ts/.test(new Error().stack ?? '')
  appendFileSync(process.env.LEARN_PROBE, JSON.stringify({ url: String(input), fromClient }) + '\\n')
  const res = await real(input, init)
  if (!process.env.LEARN_TAMPER) return res
  await res.text()
  return new Response(JSON.stringify({ data: { menu: [] } }), { status: 200, headers: { 'content-type': 'application/json' } })
}`

function runConsumer(env: Record<string, string> = {}) {
  rmSync(join(dir, 'pacts'), { recursive: true, force: true })
  rmSync(probe, { force: true })
  const e: Record<string, string | undefined> = { ...process.env, PACT_DO_NOT_TRACK: 'true', LEARN_PROBE: probe, ...env }
  delete e.NODE_TEST_CONTEXT   // 不要讓子程序以為自己是這個測試的一部分
  const r = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(HOOK), 'pact-consumer.ts'],
    { cwd: dir, env: e, encoding: 'utf8', timeout: 40_000 })
  const calls = existsSync(probe) ? readFileSync(probe, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as { url: string, fromClient: boolean }) : []
  rmSync(probe, { force: true })
  const out = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter(l => !/^\s+at |DeprecationWarning|trace-deprecation/.test(l)).join('\n').trim()
  return { status: r.status, timedOut: (r.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT', out: out.slice(-1500), calls }
}

type Rule = { matchers: { match: string, min?: number }[] }
type Interaction = {
  providerStates?: { name: string }[]
  request: { method: string, path: string, body?: { content?: unknown } }
  response: { status: number, body?: { content?: any }, matchingRules?: { body?: Record<string, Rule> } }
}
let pact: { consumer: { name: string }, provider: { name: string }, interactions: Interaction[] } | undefined
let calls: { url: string, fromClient: boolean }[] = []

test('pact-consumer.ts 執行成功，產生 pacts/CoffeeApp-MenuAPI.json', opts, () => {
  const r = runConsumer()
  assert.ok(!r.timedOut, 'pact-consumer.ts 執行超過 40 秒沒有結束')
  assert.equal(r.status, 0, `node --test pact-consumer.ts 沒有通過：\n${r.out}`)
  const file = join(dir, 'pacts', 'CoffeeApp-MenuAPI.json')
  assert.ok(existsSync(file), 'pacts/ 裡沒有 CoffeeApp-MenuAPI.json：new PactV4 的 consumer 要是 CoffeeApp、provider 要是 MenuAPI、dir 用起始程式的 dir，而且要有 addInteraction 與 executeTest')
  pact = JSON.parse(readFileSync(file, 'utf8'))
  calls = r.calls
})

test('互動：provider state「菜單有六個商品」、POST /graphql、body 是 fetchMenu 送出的查詢', opts, () => {
  assert.ok(pact, '先讓上一項通過')
  assert.equal(pact.consumer.name, 'CoffeeApp')
  assert.equal(pact.provider.name, 'MenuAPI')
  assert.equal(pact.interactions.length, 1, `只要描述一個互動（目前 ${pact.interactions.length} 個）`)
  const [it] = pact.interactions
  assert.deepEqual(it.providerStates?.map(s => s.name), ['菜單有六個商品'], '用 .given(\'菜單有六個商品\') 寫出 provider state：provider 驗證時靠它準備資料')
  assert.equal(it.request.method, 'POST')
  assert.equal(it.request.path, '/graphql')
  assert.deepEqual(it.request.body?.content, { query: MENU_QUERY }, '請求的 body 要是 { query: MENU_QUERY }（用 jsonBody，跟 fetchMenu 送出的一樣）')
  assert.equal(it.response.status, 200)
})

test('回應用 matcher 描述形狀：menu 用 eachLike、priceTwd 用 integer', opts, () => {
  assert.ok(pact, '先讓第一項通過')
  const rules = pact.interactions[0].response.matchingRules?.body ?? {}
  const matchOf = (path: string) => rules[path]?.matchers.map(m => m.match) ?? []
  assert.ok(Object.keys(rules).length, '回應完全沒有 matcher：寫死的值會讓 provider 一改資料（漲價、加商品）驗證就失敗。用 MatchersV3 的 eachLike、like、integer')
  assert.ok(matchOf('$.data.menu').includes('type'), `data.menu 要用 eachLike(…) 包住一個商品的樣板（目前的規則：${JSON.stringify(rules)}）`)
  assert.deepEqual(matchOf('$.data.menu[*].priceTwd'), ['integer'], 'priceTwd 要用 integer(…)：like 只比 JSON 型別，provider 回小數 110.5 也會通過')
  for (const f of ['id', 'name']) assert.ok(matchOf(`$.data.menu[*].${f}`).includes('type'), `${f} 要用 like(…)：只檢查型別，不綁死值`)
  const item = pact.interactions[0].response.body?.content?.data?.menu?.[0]
  assert.ok(item && typeof item.priceTwd === 'number' && Number.isInteger(item.priceTwd), 'eachLike 的樣板商品要有整數的 priceTwd 範例值')
})

test('executeTest 裡呼叫的是真的 fetchMenu，而且有檢查它的回傳', opts, () => {
  assert.ok(pact, '先讓第一項通過')
  assert.ok(calls.some(c => c.fromClient && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/graphql$/.test(c.url)),
    '沒有看到 menuClient.ts 的 fetchMenu 打到 Pact 的 mock server：在 executeTest(async server => …) 裡呼叫 fetchMenu(server.url)，不要自己寫 fetch')
  const tampered = runConsumer({ LEARN_TAMPER: '1' })
  assert.notEqual(tampered.status, 0, '把 mock server 的回應換成空菜單後，你的測試還是通過：要斷言 fetchMenu 的回傳（例如第一個商品的 name、priceTwd）')
})
