import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { run, runNode } from '../../helpers/proc.ts'
import { tmpDir } from '../../helpers/tmp.ts'

const report = join(import.meta.dirname, 'report/report.ts')
const opts = { timeout: 15_000 }
const tsc = join(import.meta.dirname, '../../node_modules/.bin/tsc')
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]
const names = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕']

async function runWith(rows: unknown[]) {
  const file = join(await tmpDir(), 'sales.json')
  await writeFile(file, JSON.stringify(rows))
  return runNode(report, { args: [file] })
}

test('tsc 檢查 report.ts 0 錯誤', opts, async () => {
  assert.doesNotMatch(await readFile(report, 'utf8'), /@ts-(ignore|nocheck|expect-error)/,
    '不能用 @ts-ignore、@ts-nocheck、@ts-expect-error 讓 tsc 閉嘴，要把型別錯誤真的修好')
  const r = await run(tsc, ['--ignoreConfig', '--noEmit', '--strict', '--target', 'esnext', '--module', 'nodenext', '--types', 'node', '--skipLibCheck',
    '--allowImportingTsExtensions', '--erasableSyntaxOnly', '--verbatimModuleSyntax', report], { cwd: import.meta.dirname, timeoutMs: 12_000 })
  assert.equal(r.code, 0, `tsc 還有錯誤：\n${r.stdout.trim().split('\n').slice(0, 4).join('\n')}`)
})

test('價格是字串也要當數字加總', opts, async () => {
  const rows = Array.from({ length: 4 + Math.floor(Math.random() * 4) }, () => ({ name: pick(names), price: (6 + Math.floor(Math.random() * 7)) * 10 }))
  const json = rows.map((r, i) => (i % 2 === 0 ? { ...r, price: String(r.price) } : r))
  const total = rows.reduce((s, r) => s + r.price, 0)
  const r = await runWith(json)
  assert.equal(r.code, 0, `程式出錯了：\n${r.stderr.split('\n').slice(0, 6).join('\n')}`)
  assert.equal(r.stdout, `有效 ${rows.length} 筆，營收 ${total} 元\n`, '價格要用 Number() 轉成數字再加總，as number 只騙得過 tsc，執行時還是字串')
  assert.equal(r.stderr, '', '資料都合格時 stderr 不要有東西')
})

test('壞資料印到 stderr 並跳過，其他照算', opts, async () => {
  const good = [{ name: pick(names), price: 110 }, { name: pick(names), price: '80' }, { name: pick(names), price: 70 }]
  const broken = [{ name: pick(names), price: -90 }, { price: 120 }, { name: '', price: 90 }, { name: pick(names), price: '免費' },
    { name: pick(names), price: true }, { name: pick(names) }, null]
  const rows: unknown[] = [...good]
  const badAt: number[] = []
  for (const b of broken.sort(() => Math.random() - 0.5)) {
    const at = Math.floor(Math.random() * (rows.length + 1))
    rows.splice(at, 0, b)
  }
  rows.forEach((row, i) => { if (!good.includes(row as never)) badAt.push(i + 1) })
  const r = await runWith(rows)
  assert.equal(r.code, 0, `壞資料不能讓整個程式當掉：\n${r.stderr.split('\n').slice(0, 6).join('\n')}`)
  assert.equal(r.stdout, `有效 3 筆，營收 260 元\n`, '負數、缺品名、品名是空字串、缺價格、價格不是數字也不是數字字串（例如 true）、null 都要跳過，不算進筆數和營收')
  const lines = r.stderr.trim().split('\n')
  assert.deepEqual(lines.map(l => l.match(/^略過第 (\d+) 筆：/)?.[1]).map(Number), badAt,
    `每一筆壞資料在 stderr 印一行「略過第 N 筆：原因」（N 從 1 開始），這次壞的是第 ${badAt.join('、')} 筆。stderr：\n${r.stderr}`)
})
