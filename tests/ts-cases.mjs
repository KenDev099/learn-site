// TypeScript 課的判分回歸案例：已知的錯答案要判錯、等價的正確寫法要判對，以及執行引擎的邊界情況。
// 要先在 learn/ 開 8000 伺服器
import { chromium } from 'playwright-core'
const BASE = 'http://localhost:8000/typescript/lessons/'
const b = await chromium.launch({ channel: 'chrome' })
const p = await b.newPage()
let bad = 0
const report = (ok, label, got) => { if (!ok) bad++; console.log(ok ? '✓' : '✗', label, '→', got.replace(/\n/g, ' | ').slice(0, 120)) }

async function open(file) {
  await p.goto(BASE + file)
  await p.waitForFunction(() => /已就緒|失敗/.test(document.querySelector('.engine-status')?.textContent), null, { timeout: 60000 })
}
const setCode = (box, code) => box.evaluate((box, code) => monaco.editor.getEditors().find(e => box.contains(e.getContainerDomNode())).setValue(code), code)

// 用頁面上第一個範例執行一段程式，檢查印出來的東西
async function output(label, code, expect) {
  const lab = (await p.$$('.lab'))[0]
  const out = await lab.$('.out')
  await setCode(lab, code)
  await out.evaluate(o => o.replaceChildren())
  const t0 = Date.now()
  await (await lab.$(':scope > .bar > button')).click()
  await p.waitForFunction(o => o.querySelector('.console'), out, { timeout: 15000 })
  const got = await out.innerText()
  report(expect(got), `${label}（${Date.now() - t0}ms）`, got)
}

// 把第 n 題的標準答案改一改再檢查：expectPass 是預期的判定；outCheck 檢查畫面上的說明
async function grade(n, mutate, expectPass, label, outCheck = () => true) {
  const ex = (await p.$$('.exercise'))[n - 1]
  const answer = (await ex.$eval('script[type="answer"]', s => s.textContent)).replace(/^\n+|\s+$/g, '')
  const code = mutate(answer)
  if (code === answer) return report(false, label, '替換沒有作用')
  await setCode(ex, code)
  const v = await ex.$('.verdict')
  await v.evaluate(e => { e.textContent = '' })
  await (await ex.$(':scope > .bar > button.primary')).click()
  await p.waitForFunction(e => e.textContent, v, { timeout: 20000 })
  const text = await v.innerText(), out = await (await ex.$('.out')).innerText()
  report(text.startsWith(expectPass ? '✓' : '✗') && outCheck(out), label, `${text}  ${out}`)
}

await open('01-closures-this.html')
await output('setTimeout 的 callback，this 是全域物件', 'setTimeout(function () { console.log(this === self) }, 0)', o => o.trim() === 'true')
await output('setTimeout 第一個參數不是函式', 'setTimeout(undefined, 10)', o => o.includes('setTimeout 的第一個參數要是函式'))
await output('印出無效的日期', 'console.log(new Date(NaN))', o => o.trim() === 'Invalid Date')
await output('印出物件不會呼叫 getter', "console.log({ get x() { throw new Error('boom') } })", o => o.trim() === '{ x: [Getter] }')
await output('deepEqual：長度不同的陣列不相等', 'assert.deepEqual([], new Array(3))', o => o.includes('AssertionError'))
await output('deepEqual：Set 不看順序', "assert.deepEqual(new Set([1, 2]), new Set([2, 1])); console.log('ok')", o => o.trim() === 'ok')
await output('deepEqual：訊息不同的 Error 不相等', "assert.deepEqual(new Error('a'), new Error('b'))", o => o.includes('AssertionError'))
await output('無限迴圈一直印：1000 行就停', 'for (let i = 1; i <= 3; i--) console.log(i)', o => o.includes('輸出超過 1000 行'))
await output('await 永遠不會完成：3 秒後停', 'await new Promise(() => {})', o => o.includes('執行超過 3 秒'))
await output('收尾時才排進來的計時器也會等', "const ch = new MessageChannel()\nch.port1.onmessage = () => setTimeout(() => console.log('late'), 50)\nch.port2.postMessage(0)", o => o.trim() === 'late')

await grade(1, a => a.replaceAll('console.log', 'console.info'), true, '01 練習 1：用 console.info 印出一樣的內容')
await grade(2, a => a.replace('return {', 'const card = {').replace(/\n  }\n}$/, "\n  }\n  Object.defineProperty(card, 'points', { get: () => points })\n  return card\n}"), false, '01 練習 2：點數用 defineProperty 掛在物件上')
await grade(3, () => 'function once(fn) {\n  let result\n  return (...args) => result || (result = fn(...args))\n}', false, '01 練習 3：用「有沒有結果」判斷執行過沒')
await grade(4, a => a.replace('setTimeout(() => cart.checkout(), 10)', 'cart.checkout()'), false, '01 練習 4：沒等 10 毫秒就結帳')

await open('13-what-is-ts.html')
await grade(1, a => a.replace(/\nconsole\.log\(.*\)$/, ''), false, '05 練習 1：沒有印出結果')
await grade(2, a => a.replace('{ price: number; quantity: number }[]', '{ price: any; quantity: number }[]'), false, '05 練習 2：price 用 any')
await grade(2, a => a.replace('{ price: number; quantity: number }[]', '{ price: number; quantity: any }[]'), false, '05 練習 2：quantity 用 any')
await grade(2, a => a.replace('{ price: number; quantity: number }[]', 'readonly { price: number; quantity: number }[]'), true, '05 練習 2：readonly 陣列也算對')
await grade(2, a => 'interface OrderItem {\n  price: number\n  quantity: number\n}\n\n' + a.replace('{ price: number; quantity: number }[]', 'OrderItem[]'), true, '05 練習 2：用 interface 也算對')
await grade(3, a => a.replace('item?.price ?? 0', 'item!.price'), false, '05 練習 3：用 ! 讓錯誤閉嘴')
await grade(4, a => a + "\nconst oops: number = 'x'", false, '05 練習 4：自己的型別錯誤要列在「型別錯誤」，不能算到隱藏測試頭上',
  out => out.startsWith('型別錯誤') && !out.includes('沒通過的型別檢查'))

await b.close()
console.log(bad ? `✗ ${bad} 個問題` : '✓ 全部符合預期')
process.exit(bad ? 1 : 0)
