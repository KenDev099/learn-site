import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import { join } from 'node:path'
import { after } from 'node:test'
import { runNode } from '../../helpers/proc.ts'

const opts = { timeout: 15_000 }
const total = join(import.meta.dirname, 'total.ts')
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const lineOf = (item: string, qty: number, price: number) => `${item} ${qty} × ${price} = ${qty * price}`

test('全部是好的行：每行印小計，最後印合計，結束碼 0', opts, async () => {
  const rows = ['拿鐵', '美式咖啡', '可頌', '起司蛋糕'].map(item => ({ item, qty: rand(1, 5), price: rand(6, 13) * 10 }))
  const input = rows.map(r => `${r.item},${r.qty},${r.price}`).join('\n')   // 最後一行沒有換行也要讀到
  const r = await runNode(total, { input })
  const sum = rows.reduce((s, x) => s + x.qty * x.price, 0)
  assert.equal(r.stdout, [...rows.map(x => lineOf(x.item, x.qty, x.price)), `合計 NT$ ${sum}`].join('\n') + '\n', '每行印「品項 數量 × 單價 = 小計」，最後印「合計 NT$ 總額」；資料要從 stdin 讀')
  assert.equal(r.stderr, '', '沒有壞的行時 stderr 不要有東西')
  assert.equal(r.code, 0, `結束碼要是 0，收到 ${r.code}`)
})

test('壞的行印到 stderr（第 N 行格式錯誤：…）並跳過，結束碼 1，合計照印', opts, async () => {
  const q1 = rand(1, 4), q2 = rand(1, 4)
  const input = [
    `拿鐵,${q1},110`,         // 1
    '   ',                    // 2 只有空白的行：跳過，不算錯
    '美式咖啡,1,80,多的',      // 3 欄位太多
    '可頌,1.5,70',            // 4 數量不是整數
    '伯爵紅茶,abc,90',         // 5
    ` 起司蛋糕 , ${q2} , 120`, // 6 前後空白要去掉
    '卡布奇諾,2',             // 7 欄位太少
    ',1,80',                  // 8 品項是空的
    '拿鐵,0,110',             // 9 數量 0
    '拿鐵,2,1e2',             // 10 單價不是整數格式
    '',
  ].join('\n') + '\n'
  const r = await runNode(total, { input })
  assert.equal(r.stdout, [lineOf('拿鐵', q1, 110), lineOf('起司蛋糕', q2, 120), `合計 NT$ ${q1 * 110 + q2 * 120}`].join('\n') + '\n',
    'stdout 只能有好的行和合計（欄位要 trim()），錯誤訊息不能印到 stdout')
  const errLines = r.stderr.trim().split('\n')
  for (const l of errLines) assert.match(l, /^第 \d+ 行格式錯誤：.+/, `stderr 每一行的格式是「第 N 行格式錯誤：原因」，收到：${l}`)
  assert.deepEqual(errLines.map(l => Number(l.match(/^第 (\d+) 行/)?.[1])), [3, 4, 5, 7, 8, 9, 10], '壞的是第 3、4、5、7、8、9、10 行：行號從 1 開始，空行也要算行號；只有空白的行（第 2 行）跳過、不算錯')
  assert.equal(r.code, 1, `有壞的行時結束碼要是 1，收到 ${r.code}`)
})

test('2 萬行、讀取端等你全部印完才開始讀：輸出一行都不能少', opts, async () => {
  const { NODE_TEST_CONTEXT, ...env } = process.env
  const child = spawn(process.execPath, [total], { env })
  after(() => child.kill('SIGKILL'))
  const closed = once(child, 'close')
  const exited = once(child, 'exit')
  child.stdin.end(Array.from({ length: 20_000 }, (_, i) => `拿鐵,${(i % 3) + 1},110`).join('\n') + '\n壞掉的一行\n')
  let stderr = ''
  // 模擬管線另一端的程式比較慢：先不讀 stdout，等最後一行的錯誤出現在 stderr（所有輸出都排進佇列了）
  const printedAll = new Promise<void>(resolve => child.stderr.setEncoding('utf8').on('data', s => {
    stderr += s
    if (stderr.includes('第 20001 行')) resolve()
  }))
  await Promise.race([printedAll, sleep(5_000)])
  // 再給它 2 秒結束：process.exit() 會在這裡把程序連同沒送出的輸出一起結束；process.exitCode 的寫法要等 stdout 被讀完才會結束
  await Promise.race([exited, sleep(2_000)])
  let stdout = ''
  for await (const chunk of child.stdout.setEncoding('utf8')) stdout += chunk
  const [code] = await closed
  const lines = stdout.split('\n').filter(Boolean)
  assert.equal(lines.length, 20_001, `應該收到 20,000 行小計＋1 行合計，只收到 ${lines.length} 行：用 process.exitCode = 1 讓程式自然結束，不要呼叫 process.exit()`)
  assert.equal(lines.at(-1), `合計 NT$ ${Array.from({ length: 20_000 }, (_, i) => ((i % 3) + 1) * 110).reduce((a, b) => a + b)}`)
  assert.match(stderr, /^第 20001 行格式錯誤：/m)
  assert.equal(code, 1, '最後一行是壞的，結束碼要是 1')
})
