import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const opts = { timeout: 60_000 }
const dir = import.meta.dirname

// 這一題不依賴練習 3：先寫入一份標準的 pact 檔（練習 3 的標準答案產生的），再執行你的 pact-provider.ts
const PACT = {"consumer":{"name":"CoffeeApp"},"interactions":[{"description":"查詢菜單","pending":false,"providerStates":[{"name":"菜單有六個商品"}],"request":{"body":{"content":{"query":"query Menu { menu { id name priceTwd } }"},"contentType":"application/json","encoded":false},"headers":{"Content-Type":["application/json"]},"method":"POST","path":"/graphql"},"response":{"body":{"content":{"data":{"menu":[{"id":"2","name":"拿鐵","priceTwd":110}]}},"contentType":"application/json","encoded":false},"headers":{"Content-Type":["application/json"]},"matchingRules":{"body":{"$.data.menu":{"combine":"AND","matchers":[{"match":"type","min":1}]},"$.data.menu[*].id":{"combine":"AND","matchers":[{"match":"type"}]},"$.data.menu[*].name":{"combine":"AND","matchers":[{"match":"type"}]},"$.data.menu[*].priceTwd":{"combine":"AND","matchers":[{"match":"integer"}]}}},"status":200},"type":"Synchronous/HTTP"}],"metadata":{"pact-js":{"version":"17.1.4"},"pactRust":{"ffi":"0.5.8","models":"1.3.16"},"pactSpecification":{"version":"4.0"}},"provider":{"name":"MenuAPI"}}

// --import 先載入的這段程式：
// 1. LEARN_BREAK 時用 module hooks 把 provider.ts 的 priceTwd 全部改成 price（模擬後端改了欄位名）
// 2. 所有測試跑完 1.5 秒後程序還沒結束，代表有 server 沒關（node 會一直等下去）：印出標記並結束
const HOOK = `
import { registerHooks } from 'node:module'
import { after } from 'node:test'
if (process.env.LEARN_BREAK) registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context)
    return url.endsWith('/provider.ts') ? { ...result, source: String(result.source).replaceAll('priceTwd', 'price') } : result
  },
})
after(() => { setTimeout(() => { console.log('LEARN_STILL_RUNNING'); process.exit(3) }, 1500).unref() })`

function runProvider(env: Record<string, string> = {}) {
  mkdirSync(join(dir, 'pacts'), { recursive: true })
  writeFileSync(join(dir, 'pacts', 'CoffeeApp-MenuAPI.json'), JSON.stringify(PACT, null, 2))
  const e: Record<string, string | undefined> = { ...process.env, PACT_DO_NOT_TRACK: 'true', ...env }
  delete e.NODE_TEST_CONTEXT   // 不要讓子程序以為自己是這個測試的一部分
  const r = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(HOOK), 'pact-provider.ts'],
    { cwd: dir, env: e, encoding: 'utf8', timeout: 40_000 })
  const all = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '')
  const out = all.split('\n').filter(l => !/^\s+at |DeprecationWarning|trace-deprecation|LEARN_STILL_RUNNING/.test(l)).join('\n').trim()
  return { status: r.status, stillRunning: all.includes('LEARN_STILL_RUNNING'), timedOut: (r.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT', out: out.slice(-1500) }
}

const noLeak = (r: ReturnType<typeof runProvider>) => {
  assert.ok(!r.timedOut, 'pact-provider.ts 執行超過 40 秒沒有結束：常見原因是 providerBaseUrl 指向沒有 server 在聽的 port（要用 listen 回傳的 url）；Pact 連不上 provider 時，程序不會自己結束')
  assert.ok(!r.stillRunning, '測試跑完了，程序卻沒有結束：server 沒有關。用 helpers/http.ts 的 listen(server)（會自動關），或在 finally 裡 await close()')
}

test('對正確的 provider：驗證通過、server 有關掉', opts, () => {
  const r = runProvider()
  noLeak(r)
  assert.equal(r.status, 0, `node --test pact-provider.ts 沒有通過。常見原因：沒啟動 server、providerBaseUrl 不是 listen 回傳的 url、stateHandlers 沒有「菜單有六個商品」（menu 是空的，eachLike 至少要一筆）。輸出：\n${r.out}`)
  assert.match(r.out, /Verifying a pact between CoffeeApp and MenuAPI/, `沒有看到 Pact 的驗證輸出：要用 new Verifier({ … pactUrls: [pactFile] }).verifyProvider()。輸出：\n${r.out}`)
})

test('provider 把 priceTwd 改名成 price：你的驗證要失敗', opts, () => {
  const r = runProvider({ LEARN_BREAK: '1' })
  noLeak(r)
  assert.notEqual(r.status, 0, '後端改了欄位名，你的測試卻通過了：verifyProvider() 回傳的 Promise 失敗時要讓測試失敗（await 它，不要 catch 掉）')
  assert.match(r.out, /priceTwd/, `失敗的原因應該是回應少了 priceTwd。輸出：\n${r.out}`)
})
