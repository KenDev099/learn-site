// 學習者自己寫 COMMIT 也不能改到頁面上的資料庫；忘了 COMMIT 要被擋下。要先在 learn/ 開 8000 伺服器
import { chromium } from 'playwright-core'
const BASE = 'http://localhost:8000/postgresql/lessons/'
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage()
const ready = () => p.waitForFunction(() => /已就緒/.test(document.querySelector('.engine-status')?.textContent))
let bad = 0

await p.goto(BASE + '06-update-delete.html'); await ready()
// 必須和頁面載入的 lab.js 是同一個網址，才會拿到同一個模組與資料庫
const snap = () => p.evaluate(async () => { const { getDb } = await import('/postgresql/lab.js'); return JSON.stringify((await getDb().query('SELECT * FROM products ORDER BY id')).rows) })
const before = await snap()
const ex = (await p.$$('.exercise'))[0]
await (await ex.$('textarea')).fill('BEGIN;\n' + await ex.getAttribute('data-answer') + '\nCOMMIT;')
await (await ex.$('button.primary')).click(); await p.waitForFunction(el => el.textContent, await ex.$('.verdict'))
const v6 = await (await ex.$('.verdict')).innerText(), same = before === await snap()
if (!v6.startsWith('✓') || !same) bad++
console.log('06-1 自己包 COMMIT:', v6, '| 頁面資料未變:', same)

await p.goto(BASE + '18-transactions.html'); await ready()
const e18 = (await p.$$('.exercise'))[0]
await (await e18.$('textarea')).fill((await e18.getAttribute('data-answer')).replace('COMMIT;', ''))
await (await e18.$('button.primary')).click(); await p.waitForFunction(el => el.textContent, await e18.$('.verdict'))
const v18 = await (await e18.$('.verdict')).innerText(), err = await (await e18.$('.error')).innerText()
if (!v18.startsWith('✗') || !err.includes('交易還沒結束')) bad++
console.log('18-1 忘了 COMMIT:', v18, '|', err)
await b.close()
console.log(bad ? `✗ ${bad} 個問題` : '✓ 全部符合預期')
process.exit(bad ? 1 : 0)
