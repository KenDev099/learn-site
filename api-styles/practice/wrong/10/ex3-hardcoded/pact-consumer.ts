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
  await pact.addInteraction()
    .given('菜單有六個商品')
    .uponReceiving('查詢菜單')
    .withRequest('POST', '/graphql', b => b.jsonBody({ query: MENU_QUERY }))   // jsonBody 會一併要求 Content-Type: application/json
    .willRespondWith(200, b => b.jsonBody({
      data: {
        // 依賴的是「形狀與型別」，不是具體的值：provider 漲價、加商品，契約都不受影響
        menu: [{ id: '2', name: '拿鐵', priceTwd: 110 }],
      },
    }))
    .executeTest(async server => {
      const menu = await fetchMenu(server.url)   // 真的 client 程式打 Pact 的 mock server
      assert.equal(menu.length, 1)
      assert.deepEqual(menu[0], { id: '2', name: '拿鐵', priceTwd: 110 })
    })
})
