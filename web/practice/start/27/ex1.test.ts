import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium, type Browser } from '@playwright/test'
import { startSite, type Options } from './server.ts'
import { checkOrderFlow } from './order.e2e.ts'

// 把網站的某段原始碼換掉，做出壞掉的變體；找不到要換的字串就丟錯（避免變體其實沒壞）
const swap = (file: string, from: string, to: string): Options['patch'] => (path, body) => {
  if (!path.endsWith(file)) return body
  assert(body.includes(from), `出題錯誤：${file} 裡找不到要替換的內容`)
  return body.replaceAll(from, to)
}

let browser: Browser
before(async () => { browser = await chromium.launch({ channel: 'chrome' }) })
after(async () => { await browser?.close() })

async function run(options: Options = {}) {
  const site = await startSite(options)
  const context = await browser.newContext()
  context.setDefaultTimeout(8000)            // 找不到元素時 8 秒後放棄（壞掉的變體靠這個結束）
  context.setDefaultNavigationTimeout(30000)
  const page = await context.newPage()
  try {
    await checkOrderFlow(page, site.url)
    return { ok: true as const, orders: site.orders }
  } catch (error) {
    return { ok: false as const, error: String((error as Error)?.message ?? error).split('\n').slice(0, 3).join('\n'), orders: site.orders }
  } finally {
    await context.close()
    await site.close()
  }
}

test('只用 getByRole／getByLabel／getByText 與會自動等待的斷言', () => {
  const source = readFileSync(new URL('./order.e2e.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const rules: [RegExp, string][] = [
    [/waitForTimeout|\bsetTimeout\b/, '不要用固定時間等待（waitForTimeout、setTimeout）：慢又不穩，改用 expect(locator) 的斷言，它會自己重試到成立'],
    [/\.\$\$?(eval)?\s*\(/, '不要用 page.$()、page.$eval() 這類舊 API：它們只查一次、不會等待，改用 locator 加 expect'],
    [/\.locator\s*\(/, '不要用 locator(\'.class\')、locator(\'#id\') 這類 CSS 選擇器：class 改名就壞，也驗證不到使用者看到的名稱。改用 getByRole／getByLabel／getByText'],
    [/getBy(?!Role\b|Label\b|Text\b)\w+/, '這題只能用 getByRole、getByLabel、getByText（getByPlaceholder、getByTestId 驗證不到欄位有沒有 label、按鈕有沒有名稱）'],
    [/waitForSelector|\.evaluate(All)?\s*\(/, '不要用 waitForSelector、evaluate 讀 DOM：用 locator 與 web-first assertion'],
  ]
  for (const [re, msg] of rules) assert.doesNotMatch(source, re, msg)
})

describe('正確的網站與壞掉的變體', () => {
  test('正確的網站：流程通過，伺服器收到一筆拿鐵大杯的訂單', async () => {
    const r = await run()
    assert(r.ok, `正確的網站應該通過，但 checkOrderFlow 丟錯：\n${r.ok ? '' : r.error}`)
    assert.equal(r.orders.length, 1, '流程結束時伺服器應該剛好收到 1 筆訂單：有沒有按「送出訂單」？')
    const [order] = r.orders
    assert.deepEqual(order.items, [{ name: '拿鐵', size: '大杯', qty: 1 }], '訂單內容應該是 1 杯大杯拿鐵：有沒有在「拿鐵」那一區選「大杯」？')
    assert(order.name.trim() && order.phone.trim(), '要填寫姓名與電話')
  })

  test('結帳按鈕 2 秒後才出現：仍然通過（自動等待）', async () => {
    const r = await run({ patch: swap('/checkout/', '<button type="submit">', '<button type="submit" hidden data-reveal-after="2000">') })
    assert(r.ok, `「送出訂單」按鈕 2 秒後才出現，驗收程式應該等它出現後繼續，而不是判失敗：\n${r.ok ? '' : r.error}\n（用 isVisible() 加 if 只檢查一次，不會等待）`)
  })

  const broken: [string, Options['patch'], string][] = [
    ['「加入購物車」按鈕只剩圖示、沒有名稱', swap('/order/', '>加入購物車</button>', '><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 4h2l2 12h11l2-8H7"/></svg></button>'),
      '螢幕閱讀器使用者聽不到這個按鈕是什麼，驗收應該失敗：用 getByRole(\'button\', { name: \'加入購物車\' }) 找按鈕'],
    ['購物車數量不會更新', swap('/app.js', "document.querySelector('.cart-count').textContent = String(cart.length)", ''),
      '要用 expect(…).toHaveText() 確認購物車顯示 1 件'],
    ['送出後沒有顯示訂單編號', swap('/app.js', '`訂單已成立，訂單編號 ${id}，請到門市取餐。`', "'訂單已成立，請到門市取餐。'"),
      '要確認畫面出現訂單編號（A 加 4 位數字），只看到「訂單已成立」不夠'],
    ['電話欄位沒有 label，只有 placeholder', swap('/checkout/', '<label for="phone">電話</label>\n  <input id="phone"', '<input id="phone" placeholder="電話"'),
      '欄位沒有 label 時應該失敗：用 getByLabel(\'電話\') 填寫'],
  ]
  for (const [name, patch, hint] of broken) test(`壞掉的變體要失敗：${name}`, async () => {
    const r = await run({ patch })
    assert(!r.ok, `網站壞了（${name}），checkOrderFlow 卻沒有丟錯。${hint}`)
  })
})
