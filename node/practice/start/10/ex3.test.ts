import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { join } from 'node:path'
import { runNode } from '../../helpers/proc.ts'
import { tmpDir, tmpProject } from '../../helpers/tmp.ts'

const opts = { timeout: 15_000 }
const exists = (p: string) => access(p).then(() => true, () => false)
type Save = (path: string, orders: unknown[]) => Promise<void>

async function load() {
  const mod: { saveOrders?: unknown } = await import('./save-orders.ts')
  assert.equal(typeof mod.saveOrders, 'function', 'save-orders.ts 要 export async function saveOrders(path, orders)')
  return mod.saveOrders as Save
}

// 約 5MB 的訂單：寫一次要好幾毫秒，讀的人才有機會插進來
function bigOrders(tag: number) {
  return Array.from({ length: 40_000 }, (_, i) => ({ id: i + 1, tag, item: '拿鐵', quantity: 1 + (i % 3), note: 'x'.repeat(80) }))
}

// 另一個程序不停讀檔，直到 stop 檔出現；印出讀了幾次、哪幾次讀到不完整的檔案
// 讀的人一定要在別的程序：同一個程序裡，writeFileSync 會卡住事件迴圈，讀的人根本插不進來
// 只看開頭是 [、結尾是 ]：不用每次 JSON.parse 5MB，一秒讀得到幾百次，寫到一半的瞬間才抓得到
const READER = `import { existsSync, readFileSync, writeFileSync } from 'node:fs'
const [file, ready, stop] = process.argv.slice(2)
let reads = 0
const broken = []
while (!existsSync(stop)) {
  let buf
  try { buf = readFileSync(file) } catch (err) { broken.push(err.message); continue }
  if (buf[0] === 0x5b && buf.at(-1) === 0x5d) reads++
  else broken.push(buf.length === 0 ? '讀到空檔案' : \`讀到不完整的 JSON（\${buf.length} 位元組）\`)
  if (reads === 1) writeFileSync(ready, '')
}
console.log(JSON.stringify({ reads, broken }))
`

test('寫入期間另一個程序不斷讀檔：每次讀到的都是完整的 JSON', opts, async () => {
  const saveOrders = await load()
  const dir = await tmpDir()
  const file = join(dir, 'orders.json')
  const versions = Array.from({ length: 4 }, (_, i) => bigOrders(Math.floor(Math.random() * 1e9) + i))
  await saveOrders(file, versions[0])
  const app = await tmpProject({ 'reader.mjs': READER })
  const ready = join(app, 'ready'), stop = join(app, 'stop')
  const reader = runNode(join(app, 'reader.mjs'), { args: [file, ready, stop], timeoutMs: 12_000 })
  reader.catch(() => {})
  try {
    for (let i = 0; i < 300 && !(await exists(ready)); i++) await sleep(10)
    for (let i = 0; i < 12; i++) await saveOrders(file, versions[i % versions.length])
  } finally {
    await writeFile(stop, '')
  }
  const r = await reader
  assert.equal(r.code, 0, `讀檔的程序出錯了：${r.stderr.slice(0, 300)}`)
  const { reads, broken }: { reads: number, broken: string[] } = JSON.parse(r.stdout)
  assert.equal(broken.length, 0, `寫入期間另一個程序讀了 ${reads + broken.length} 次，有 ${broken.length} 次讀到壞掉或不存在的檔案（例如「${broken[0]}」）：writeFile／writeFileSync 都會先清空檔案再寫。先寫到同一個資料夾的暫存檔，再 rename 蓋過去`)
  assert.ok(reads > 0, '讀檔的程序一次都沒讀成功')
  const last = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(last[0].tag, versions[11 % versions.length][0].tag, '最後檔案裡要是最後一次 saveOrders 的內容')
})

test('暫存檔放在目標檔的同一個資料夾，不放系統暫存資料夾', opts, async () => {
  const saveOrders = await load()
  const dir = await tmpDir()
  const file = join(dir, 'orders.json')
  const saved = process.env.TMPDIR
  process.env.TMPDIR = join(dir, 'no-such-tmp')   // 讓 os.tmpdir() 指到不存在的資料夾
  try {
    await saveOrders(file, [{ id: 1 }])
  } catch (err) {
    assert.fail(`系統暫存資料夾不能用時就存不進去（${(err as Error).message}）：暫存檔要放在目標檔旁邊（例如 \`\${path}.\${randomUUID()}.tmp\`），系統暫存資料夾可能在另一個檔案系統，rename 會失敗（EXDEV）`)
  } finally {
    if (saved === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = saved
  }
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), [{ id: 1 }], '要存進目標檔')
})

test('同時呼叫好幾次 saveOrders 存同一個檔：每次都成功，檔案是其中一份完整內容', opts, async () => {
  const saveOrders = await load()
  const dir = await tmpDir()
  const file = join(dir, 'orders.json')
  const versions = Array.from({ length: 5 }, (_, i) => bigOrders(Math.floor(Math.random() * 1e9) * 10 + i))
  const results = await Promise.allSettled(versions.map(v => saveOrders(file, v)))
  const failed = results.find(r => r.status === 'rejected')
  assert.equal(failed, undefined, `同時存 5 次，有呼叫失敗了（${(failed as PromiseRejectedResult | undefined)?.reason?.message}）：暫存檔的名字每次都要不同（例如加上 randomUUID()），不然大家寫同一個暫存檔、互相蓋掉`)
  const tag = JSON.parse(await readFile(file, 'utf8'))[0].tag
  assert.ok(versions.some(v => v[0].tag === tag), '檔案要是其中一次 saveOrders 的完整內容')
  assert.deepEqual(await readdir(dir), ['orders.json'], '存完之後資料夾裡只能剩 orders.json，不能留下暫存檔')
})

test('寫入失敗：Promise reject，而且不留下暫存檔', opts, async () => {
  const saveOrders = await load()
  const dir = await tmpDir()
  const file = join(dir, 'orders.json')
  await mkdir(file)   // 目標路徑是一個資料夾：暫存檔寫得進去，但 rename 會失敗（EISDIR）
  await assert.rejects(saveOrders(file, [{ id: 1 }]), '存不進去時要 reject，讓呼叫的人知道失敗了，不能吞掉錯誤')
  const left = (await readdir(dir)).filter(f => f !== 'orders.json')
  assert.deepEqual(left, [], `失敗之後留下了 ${left.join('、')}：在 catch 裡用 rm(暫存檔, { force: true }) 清掉，再把錯誤丟出去`)
})
