import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runNode } from '../../helpers/proc.ts'
import { tmpDir } from '../../helpers/tmp.ts'

const cheapest = join(import.meta.dirname, 'cheapest.ts')
const opts = { timeout: 15_000 }

// 每次產生一份不同的菜單：價格不重複、最便宜的不在第一個也不在最後一個
function randomMenu() {
  const names = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕'].sort(() => Math.random() - 0.5)
  const prices = [60, 75, 85, 95, 105, 115, 125, 135].sort(() => Math.random() - 0.5).slice(0, 6)
  const menu = names.map((name, i) => ({ name, price: prices[i] }))
  const min = menu.reduce((a, b) => (b.price < a.price ? b : a))
  const others = menu.filter(m => m !== min)
  return { menu: [others[0], min, ...others.slice(1)], min }
}

test('讀取指定路徑的菜單，印出最便宜的品項', opts, async () => {
  const dir = await tmpDir()
  for (const round of [1, 2]) {
    const { menu, min } = randomMenu()
    const file = join(dir, `menu-${round}.json`)
    await writeFile(file, JSON.stringify(menu))
    const r = await runNode(cheapest, { args: [file] })
    assert.equal(r.code, 0, `程式出錯了，stderr：${r.stderr}`)
    assert.equal(r.stdout, `最便宜：${min.name} ${min.price} 元\n`, `要用 readFile 讀 process.argv[2] 這個路徑的檔案（測試每次給不同的菜單），只印一行「最便宜：品名 價格 元」`)
  }
})

test('檔案不存在：stderr 印「找不到菜單：<路徑>」，結束碼 1', opts, async () => {
  const file = join(await tmpDir(), 'no-such-menu.json')
  const r = await runNode(cheapest, { args: [file] })
  assert.equal(r.stdout, '', '錯誤訊息要用 console.error 印到 stderr，stdout 不要有東西')
  assert.equal(r.stderr.trim(), `找不到菜單：${file}`, '用 try/catch 接住讀檔的錯誤，再用 console.error 印出「找不到菜單：<路徑>」，不要讓錯誤直接丟出去')
  assert.equal(r.code, 1, '要設定 process.exitCode = 1，讓呼叫的人知道失敗了')
})

test('JSON 格式壞掉不是「找不到」：只處理 ENOENT，其他錯誤照樣丟出', opts, async () => {
  const file = join(await tmpDir(), 'broken-menu.json')
  await writeFile(file, '[{ "name": "拿鐵", "price": ')
  const r = await runNode(cheapest, { args: [file] })
  assert.doesNotMatch(r.stderr, /找不到菜單/, '檔案存在、只是 JSON 壞掉，不能說成「找不到菜單」：catch 裡先檢查 err.code === \'ENOENT\'，不是的話 throw err')
  assert.notEqual(r.code, 0, 'JSON 壞掉也是失敗，結束碼不能是 0')
})
