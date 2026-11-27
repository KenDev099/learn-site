import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runNodeTests } from '../../helpers/proc.ts'
import { tmpProject } from '../../helpers/tmp.ts'

const opts = { timeout: 45_000 }
const correct = await readFile(join(import.meta.dirname, 'stock.ts'), 'utf8')
const errors = await readFile(join(import.meta.dirname, 'errors.ts'), 'utf8')
// 判分時先執行這個檔：把全域 fetch 鎖成不能改寫，替換或 mock 它都會丟 TypeError
const FREEZE = "Object.defineProperty(globalThis, 'fetch', { value: globalThis.fetch, writable: false, configurable: false })\n"

function mutate(from: string, to: string) {
  assert.ok(correct.includes(from), `stock.ts 被改過了，找不到「${from}」：刪掉 work/22/stock.ts 再跑一次 check.mjs 就會補回來`)
  return correct.replace(from, to)
}
const mutants: [string, () => string, string][] = [
  ['沒有逾時（上游不回就一直等）', () => mutate('const signals = [AbortSignal.timeout(timeoutMs)]', 'const signals: AbortSignal[] = []'),
    '假上游收到請求後不回應，呼叫 getStock(url, id, { timeoutMs: 100 })，要求它丟 UpstreamTimeoutError'],
  ['把 5xx 當成成功', () => mutate('if (!res.ok)', 'if (res.status >= 600)'),
    '假上游回 503，用 assert.rejects(…, errors.UpstreamHttpError) 檢查錯誤的種類，不能只檢查「有丟錯」'],
  ['非 2xx 時沒有取消 body', () => mutate('await res.body?.cancel()', ''),
    '假上游回 503 並送出一半的 body（res.write，不 end），getStock 丟錯之後 await up.connectionClosed。timeoutMs 要設得比測試的 timeout 長（例如 5000），不然逾時也會關掉連線，蓋過這個 bug'],
  ['沒有驗證回應格式', () => mutate('if (!isStockBody(data))', 'if (data === undefined)'),
    '假上游回 {"stock":-1} 或少了 stock 欄位，要求丟 UpstreamBadResponseError'],
]

async function runSpec(impl: string) {
  const spec = await readFile(join(import.meta.dirname, 'stock.spec.ts'), 'utf8')
  const dir = await tmpProject({ 'stock.spec.ts': spec, 'stock.ts': impl, 'errors.ts': errors, 'freeze-fetch.mjs': FREEZE })
  const freeze = pathToFileURL(join(dir, 'freeze-fetch.mjs')).href
  return runNodeTests(join(dir, 'stock.spec.ts'), { cwd: dir, timeoutMs: 30_000, env: { NODE_OPTIONS: `--import=${freeze}` } })
}
// 每個測試自己花的時間加總（TAP 裡頂層測試的 duration_ms），不含啟動 node 的時間，機器忙的時候也準
const testMs = (stdout: string) => [...stdout.matchAll(/^  duration_ms: ([\d.]+)$/gm)].reduce((s, m) => s + Number(m[1]), 0)
const failures = (stdout: string) => stdout.split('\n').filter(l => /^not ok|^\s+(error|expected|actual):/.test(l)).slice(0, 12).join('\n')

test('配上正確的 stock.ts：至少 4 個測試，全部通過，3 秒內跑完，沒有動到全域 fetch', opts, async () => {
  let r
  try {
    r = await runSpec(correct)
  } catch {
    assert.fail('stock.spec.ts 30 秒內沒有跑完：每個測試加上 { timeout: 2000 }，假上游在 t.after 裡關掉')
  }
  const out = failures(r.stdout)
  assert.ok(!/Cannot (redefine|assign to read only) property/.test(r.stdout), `不能替換或 mock 全域的 fetch，要開一個假上游伺服器：\n${out}`)
  assert.equal(r.fail, 0, `正確的程式也有測試沒過，是測試的預期寫錯了：\n${out}`)
  assert.equal(r.code, 0, `node --test stock.spec.ts 沒有成功結束：\n${r.stderr.slice(0, 600)}`)
  assert.ok(r.pass >= 4, `至少要有 4 個測試（成功、逾時、5xx、格式不對），現在只有 ${r.pass} 個`)
  const ms = testMs(r.stdout)
  assert.ok(ms < 3000, `測試一共花了 ${Math.round(ms)}ms，要在 3 秒內：逾時的測試用很短的 timeoutMs（例如 100）`)
})

for (const [label, make, hint] of mutants) {
  test(`抓得到這個 bug：${label}`, opts, async () => {
    let r
    try {
      r = await runSpec(make())
    } catch {
      return   // 卡住跑不完也算抓到
    }
    assert.ok(r.fail > 0 || r.code !== 0, `把 stock.ts 改成「${label}」之後，你的測試還是全部通過。提示：${hint}`)
  })
}
