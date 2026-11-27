import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const opts = { timeout: 90_000 }   // 一次契約檢查要開 buf、Pact mock server、資料庫，在忙碌的電腦上要十幾秒
const here = import.meta.dirname

// 在 dir 執行 node contracts/run.ts。NODE_TEST_CONTEXT 是這個測試程序自己的設定，不能傳給 run.ts 開的 node --test
function runContracts(dir: string): Promise<{ code: number, output: string }> {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return new Promise(resolve => {
    execFile(process.execPath, ['contracts/run.ts'], { cwd: dir, env, timeout: 80_000 }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0
      resolve({ code, output: `${stdout}\n${stderr}` })
    })
  })
}

// 把整個專案複製一份（跟 work/12 同一層，../../helpers 才找得到），改壞一個地方，再跑一次契約檢查
async function withBreak(label: string, edits: Record<string, (s: string) => string>) {
  const copy = `${here}-break-${label}`
  rmSync(copy, { recursive: true, force: true })
  cpSync(here, copy, { recursive: true, filter: src => !src.includes(join('contracts', 'pacts')) })
  try {
    for (const [file, edit] of Object.entries(edits)) {
      const before = readFileSync(join(copy, file), 'utf8')
      const after = edit(before)
      assert.notEqual(after, before, `測試沒辦法改 ${file}：這個檔案不要改動題目給的內容`)
      writeFileSync(join(copy, file), after)
    }
    return await runContracts(copy)
  } finally {
    rmSync(copy, { recursive: true, force: true })
  }
}

const STEPS = ['graphql-schema', 'buf-breaking', 'pact-consumer', 'pact-provider']
const failedStep = (output: string) => STEPS.find(s => output.includes(`✗ ${s}`))

test('目前的程式：四個步驟都通過、結束碼 0，pact 檔用 matcher 描述回應', opts, async () => {
  const { code, output } = await runContracts(here)
  assert.equal(code, 0, `node contracts/run.ts 應該成功（結束碼 0），實際是 ${code}。輸出：\n${output.trim().slice(-1500)}`)
  for (const s of STEPS) assert.match(output, new RegExp(`✓ ${s}`), `輸出要有「✓ ${s}」：每一步成功後印出 ✓ 加步驟名稱`)
  const dir = join(here, 'contracts', 'pacts')
  const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')) : []
  assert.equal(files.length, 1, 'contracts/pacts/ 裡要有一個 pact 檔（consumer.ts 的 PactV4 dir 指到 contracts/pacts/）')
  const pact = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'))
  assert.equal(pact.consumer?.name, 'coffee-app', 'consumer 名稱要是 coffee-app')
  assert.equal(pact.provider?.name, 'coffee-graphql', 'provider 名稱要是 coffee-graphql')
  const it = pact.interactions?.[0]
  assert.ok(it, 'pact 檔裡要有互動')
  assert.equal(it.request?.path, '/graphql')
  assert.equal(it.providerStates?.[0]?.name, '顧客 1 已登入且有訂單', 'given(...) 的 provider state 要是「顧客 1 已登入且有訂單」')
  assert.ok(Object.keys(it.response?.matchingRules?.body ?? {}).length >= 3,
    '回應沒有用 matcher：用 like、eachLike、integer 描述形狀與型別，不要寫死值（provider 的資料不會跟範例一模一樣）')
})

test('移除 App 正在用的 GraphQL 欄位：graphql-schema 失敗、結束碼非 0', opts, async () => {
  const { code, output } = await withBreak('graphql', {
    'graphql/schema.graphql': s => s.replace(/\n\s*total: Int!\n/, '\n'),
  })
  assert.notEqual(code, 0, `移除 Order.total 之後契約檢查還是成功（結束碼 0）：失敗時要設 process.exitCode = 1（或 process.exit(1)）。輸出：\n${output.trim().slice(-800)}`)
  assert.equal(failedStep(output), 'graphql-schema',
    `應該在 graphql-schema 這一步失敗（印出「✗ graphql-schema」）：用 findSchemaChanges 比對 contracts/baseline/schema.graphql，有 BreakingChangeType 就失敗。不要每次重新產生 baseline。輸出：\n${output.trim().slice(-800)}`)
  assert.doesNotMatch(output, /[✓✗] (buf-breaking|pact-consumer|pact-provider)/,
    `graphql-schema 失敗之後還繼續跑後面的步驟：任何一步失敗就印出 ✗、設定結束碼，然後 break 停下來（CI 只要知道第一個壞掉的地方）。輸出：\n${output.trim().slice(-800)}`)
})

test('proto 改了欄位編號：buf-breaking 失敗、結束碼非 0', opts, async () => {
  const { code, output } = await withBreak('proto', {
    'proto/coffee/inventory/v1/inventory.proto': s => s.replace(/(message StockLevel \{[^}]*int32 available = )2;/, '$17;'),
  })
  assert.notEqual(code, 0, `改了欄位編號之後契約檢查還是成功：輸出：\n${output.trim().slice(-800)}`)
  assert.equal(failedStep(output), 'buf-breaking',
    `應該在 buf-breaking 這一步失敗：執行 buf breaking --against contracts/baseline/proto，非 0 結束要當成失敗。輸出：\n${output.trim().slice(-800)}`)
})

test('provider 的回應欄位改名（baseline 也被一起改掉）：pact-provider 失敗、結束碼非 0', opts, async () => {
  // 有人把 total 改名成 amount，還順手更新了 baseline 讓 schema 檢查通過。App 還在用 total，Pact 要擋下來
  const rename = (s: string) => s.replace(/\n(\s*)total: Int!\n/, '\n$1amount: Int!\n')
  const { code, output } = await withBreak('provider', {
    'graphql/schema.graphql': rename,
    'contracts/baseline/schema.graphql': rename,
  })
  assert.notEqual(code, 0, `provider 改了回應欄位名，契約檢查還是成功：provider.ts 要對著真的 GraphQL 伺服器（createApp ＋ listen）驗證，不能對著 mock。輸出：\n${output.trim().slice(-800)}`)
  assert.equal(failedStep(output), 'pact-provider', `應該在 pact-provider 這一步失敗。輸出：\n${output.trim().slice(-800)}`)
})
