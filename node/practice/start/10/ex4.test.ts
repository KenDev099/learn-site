import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runNode } from '../../helpers/proc.ts'
import { tmpDir, tmpProject } from '../../helpers/tmp.ts'

const opts = { timeout: 15_000 }
type Order = { id: number, item: string, quantity: number }
type Add = (path: string, order: { item: string, quantity: number }) => Promise<Order>
const items = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕']
const randomOrder = () => ({ item: items[Math.floor(Math.random() * items.length)], quantity: 1 + Math.floor(Math.random() * 5) })
const exists = (p: string) => access(p).then(() => true, () => false)
const readOrders = async (p: string): Promise<Order[]> => JSON.parse(await readFile(p, 'utf8'))

async function load() {
  const mod: { addOrder?: unknown } = await import('./add-order.ts')
  assert.equal(typeof mod.addOrder, 'function', 'add-order.ts 要 export async function addOrder(path, order)')
  return mod.addOrder as Add
}

// 等 promise 最多 ms 毫秒；超過就回傳 'timeout'
const within = <T>(p: Promise<T>, ms: number) => {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([p, new Promise<'timeout'>(r => { timer = setTimeout(() => r('timeout'), ms) })]).finally(() => clearTimeout(timer))
}

function checkAll(orders: Order[], n: number, where: string) {
  assert.equal(orders.length, n, `${where}：加了 ${n} 筆，檔案裡只有 ${orders.length} 筆，有更新遺失了（兩個呼叫讀到同一份舊資料，後寫的蓋掉先寫的）`)
  assert.equal(new Set(orders.map(o => o.id)).size, n, `${where}：id 有重複，代表有兩個呼叫同時在「讀出 → 加一筆 → 寫回」`)
}

// 在子程序裡執行 code（可以用 addOrder）：卡住的話時間到就整個砍掉，不會拖住測試
async function inChild(code: string, timeoutMs: number, hint: string) {
  const dir = await tmpProject({
    'worker.ts': `import { addOrder } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'add-order.ts')).href)}\n${code}`,
  })
  try {
    return await runNode(join(dir, 'worker.ts'), { timeoutMs })
  } catch {
    return assert.fail(`${timeoutMs / 1000} 秒內沒做完：${hint}`)
  }
}

test('同一個程序同時呼叫 50 次：50 筆都在，id 不重複', opts, async () => {
  await load()
  const file = join(await tmpDir(), 'orders.json')
  const r = await inChild(`const added = await Promise.all(Array.from({ length: 50 }, (_, i) => addOrder(${JSON.stringify(file)}, { item: '拿鐵', quantity: 1 + (i % 3) })))
console.log(JSON.stringify(added.map(o => o.id)))
`, 10_000, '是不是做完之後沒刪掉鎖檔，下一個呼叫只能等它變舊？')
  assert.equal(r.code, 0, `addOrder 出錯了：\n${r.stderr.split('\n').filter(l => !/^\s+at /.test(l)).slice(0, 6).join('\n')}`)
  checkAll(await readOrders(file), 50, '同時呼叫 50 次')
  assert.equal(new Set(JSON.parse(r.stdout)).size, 50, 'addOrder 要回傳存進去的訂單（含 id）')
  assert.equal(await exists(file + '.lock'), false, '全部做完後，鎖檔要被刪掉')
})

test('4 個程序同時各加 25 筆：100 筆都在', opts, async () => {
  await load()
  const file = join(await tmpDir(), 'orders.json')
  const startAt = Date.now() + 1_500   // 4 個程序都啟動好，同一個時間點一起開始
  const code = `await new Promise(r => setTimeout(r, Math.max(0, ${startAt} - Date.now())))
for (let i = 0; i < 25; i++) await addOrder(${JSON.stringify(file)}, { item: '拿鐵', quantity: 1 + (i % 3) })
`
  const runs = await Promise.all(Array.from({ length: 4 }, () => inChild(code, 12_000, '4 個程序各加 25 筆，是不是做完之後沒刪掉鎖檔？')))
  for (const r of runs) assert.equal(r.code, 0, `子程序出錯了：\n${r.stderr.split('\n').filter(l => !/^\s+at /.test(l)).slice(0, 6).join('\n')}`)
  checkAll(await readOrders(file), 100, '4 個程序各加 25 筆')
})

test('中間有一筆失敗：它 reject、鎖檔被刪掉、其他照常完成', opts, async () => {
  await load()
  const file = join(await tmpDir(), 'orders.json')
  const f = JSON.stringify(file)
  const r = await inChild(`const ok = () => addOrder(${f}, { item: '拿鐵', quantity: 1 })
const all = [ok(), ok(), ok(), ok(), ok(), addOrder(${f}, { item: '', quantity: 0 }), ok(), ok(), ok(), ok(), ok()]
console.log(JSON.stringify((await Promise.allSettled(all)).map(x => x.status)))
`, 4_000, '不合法的訂單之後，其他呼叫一直等不到鎖：失敗時鎖檔沒被刪掉。把放鎖寫在 finally')
  assert.equal(r.code, 0, `子程序出錯了：\n${r.stderr.split('\n').filter(l => !/^\s+at /.test(l)).slice(0, 6).join('\n')}`)
  const status: string[] = JSON.parse(r.stdout)
  assert.equal(status[5], 'rejected', '不合法的訂單（item 是空字串）要 reject')
  assert.equal(status.filter(x => x === 'fulfilled').length, 10, '其他 10 筆合法的訂單都要成功')
  checkAll(await readOrders(file), 10, '10 筆合法、1 筆不合法')
  assert.equal(await exists(file + '.lock'), false, '做完之後鎖檔要被刪掉')

  // 拿到鎖之後才發生的錯誤：訂單檔本身壞掉
  await writeFile(file, '[{"id": 1,')
  const r2 = await inChild(`await addOrder(${f}, { item: '拿鐵', quantity: 1 }).then(() => console.log('fulfilled'), () => console.log('rejected'))\n`, 8_000, '訂單檔壞掉時 addOrder 沒有結束')
  assert.equal(r2.stdout.trim(), 'rejected', '訂單檔不是正確的 JSON 時要 reject')
  assert.equal(await exists(file + '.lock'), false, '讀檔失敗之後鎖檔還在：成功、失敗都要在 finally 關閉並刪掉鎖檔')
})

test('鎖檔是 10 秒前留下的（程序當掉）：移除後照常新增，2 秒內完成', opts, async () => {
  const addOrder = await load()
  const file = join(await tmpDir(), 'orders.json')
  const lock = file + '.lock'
  await writeFile(lock, '')
  const old = new Date(Date.now() - 10_000)
  await utimes(lock, old, old)
  const p = addOrder(file, randomOrder())
  try {
    assert.notEqual(await within(p, 2_000), 'timeout', '鎖檔已經 10 秒沒動，2 秒內還沒完成：用 stat 看鎖檔的 mtimeMs，超過 5 秒就當成當掉的程序留下的，rm 掉再重拿')
    checkAll(await readOrders(file), 1, '移除舊鎖之後')
  } finally {
    await rm(lock, { force: true })
    await p.catch(() => {})
  }
})

test('鎖檔剛建立（別人正在用）：等它被刪掉才寫入', opts, async () => {
  const addOrder = await load()
  const file = join(await tmpDir(), 'orders.json')
  const lock = file + '.lock'
  await writeFile(lock, '')
  const t0 = performance.now()
  setTimeout(() => { rm(lock, { force: true }) }, 300)
  const p = addOrder(file, randomOrder())
  try {
    assert.notEqual(await within(p, 3_000), 'timeout', '別人放掉鎖之後 3 秒內還沒完成：拿不到鎖時要等 10～30ms 再試')
    const ms = performance.now() - t0
    assert.ok(ms >= 280, `鎖檔才建立 ${Math.round(ms)}ms 就被你拿走了：剛建立的鎖代表別人正在用，要等它消失，不能當成當掉的鎖刪掉`)
    checkAll(await readOrders(file), 1, '等別人放鎖之後')
  } finally {
    await rm(lock, { force: true })
    await p.catch(() => {})
  }
})
