// 練習 3：菜單 App（consumer）對菜單 API（provider）的契約測試。自己執行：node --test pact-consumer.ts
// 檔名沒有 .test：check.mjs 不會直接跑它，而是由 ex3.test.ts 執行它、再檢查產生的 pact 檔
import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { MatchersV3, PactV4, SpecificationVersion } from '@pact-foundation/pact'
import { fetchMenu, MENU_QUERY } from './menuClient.ts'

process.env.PACT_DO_NOT_TRACK ??= 'true'   // 關掉 Pact 執行時的匿名統計
const { eachLike, like, integer } = MatchersV3
const dir = new URL('./pacts', import.meta.url).pathname
rmSync(dir, { recursive: true, force: true })   // 每次重新產生：Pact 會把互動合併進已經存在的檔案

const pact = new PactV4({ consumer: 'CoffeeApp', provider: 'MenuAPI', dir, spec: SpecificationVersion.SPECIFICATION_VERSION_V4, logLevel: 'warn' })

test('CoffeeApp 查詢菜單', { timeout: 30_000 }, async () => {
  // 在這裡用 pact.addInteraction() 描述互動，並在 executeTest 裡呼叫 fetchMenu
})
