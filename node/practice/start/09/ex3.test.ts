import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpDir } from '../../helpers/tmp.ts'

const opts = { timeout: 30_000 }
type Create = (name: string, items: { product: string, qty: number }[]) => Promise<{ customer: string, total: number }>

async function load() {
  const mod: { createInvoice?: unknown } = await import('./invoice.ts')
  assert.equal(typeof mod.createInvoice, 'function', 'invoice.ts 要 export createInvoice')
  // 在暫存資料夾裡跑：如果名字被 shell 當成指令，PWNED 會出現在這裡
  const dir = await tmpDir()
  process.chdir(dir)
  return { createInvoice: mod.createInvoice as Create, dir }
}
const qty = () => 1 + Math.floor(Math.random() * 5)

test('名字裡有空白、引號、$() 時，外部程式收到一模一樣的名字，也不會執行任何指令', opts, async () => {
  const { createInvoice, dir } = await load()
  const names = ['王 小明', '"; touch PWNED; echo "', '$(touch PWNED)', "林'志豪'; touch PWNED; '", '`touch PWNED`']
  for (const name of names) {
    const a = qty(), b = qty()
    const invoice = await createInvoice(name, [{ product: '拿鐵', qty: a }, { product: '可頌', qty: b }])
    assert.equal(invoice?.customer, name, `名字 ${name} 傳過去之後變了：參數用陣列交給 execFile／spawn，不要串成一行指令交給 shell（exec）`)
    assert.equal(invoice.total, 110 * a + 70 * b, '要回傳外部程式印出的 JSON')
  }
  assert.equal(existsSync(join(dir, 'PWNED')), false, '名字裡的 touch PWNED 被 shell 執行了（shell 注入）：不要用 exec，參數用陣列傳')
})

test('外部程式卡住時，2 秒後終止它並 reject', opts, async () => {
  const { createInvoice, dir } = await load()
  const pidFile = join(dir, 'hang.pid')
  process.env.INVOICE_PID_FILE = pidFile
  const t = performance.now()
  const outcome = await Promise.race([
    createInvoice('陳美華', [{ product: '__hang__', qty: 1 }]).then(() => 'resolved', () => 'rejected'),
    new Promise(r => setTimeout(r, 4_500, 'waiting')),   // 外部程式會睡 5 秒：沒設逾時就會等到這裡
  ])
  const ms = performance.now() - t
  assert.equal(outcome, 'rejected', outcome === 'waiting'
    ? '4.5 秒了還在等：要設逾時，外部程式超過 2 秒就終止並 reject（execFile 的 timeout 選項）'
    : '外部程式卡住時要 reject，不能當成功')
  assert.ok(ms >= 1_800 && ms < 4_000, `逾時要設 2 秒，這次在第 ${Math.round(ms)}ms reject`)
  assert.ok(existsSync(pidFile), '外部程式沒有收到 INVOICE_PID_FILE 環境變數：不要另外指定 env')
  const pid = Number(readFileSync(pidFile, 'utf8'))
  let alive = true
  for (let i = 0; i < 20 && alive; i++) {
    try { process.kill(pid, 0); await new Promise(r => setTimeout(r, 50)) } catch { alive = false }
  }
  assert.equal(alive, false, 'reject 之後外部程式還活著：逾時要真的終止子程序（timeout 選項會送 killSignal）')
})

test('外部程式失敗（結束碼非 0）時 reject，錯誤訊息包含它的 stderr', opts, async () => {
  const { createInvoice } = await load()
  const product = `珍珠奶茶${Math.floor(Math.random() * 1000)}`
  await assert.rejects(createInvoice('林志豪', [{ product, qty: 1 }]),
    (err: unknown) => err instanceof Error && err.message.includes(`未知的品項：${product}`),
    `外部程式以結束碼 3 結束、stderr 是「未知的品項：${product}」：要 reject，錯誤訊息要帶上 stderr，不能只看 stdout 回傳空結果`)
})
