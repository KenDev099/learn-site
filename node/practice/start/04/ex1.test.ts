import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runNode } from '../../helpers/proc.ts'
import { tmpDir } from '../../helpers/tmp.ts'

const here = (f: string) => join(import.meta.dirname, 'convert', f)
const opts = { timeout: 15_000 }
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]
// 拿掉註解，註解裡提到 require 不算
const code = async (f: string) => (await readFile(here(f), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

test('convert/package.json 寫上 "type": "module"', opts, async () => {
  const pkg = JSON.parse(await readFile(here('package.json'), 'utf8'))
  assert.equal(pkg.type, 'module', 'convert/package.json 要加上 "type": "module"，不寫的話 Node 先當 CommonJS 解析，失敗才改用 ES module 並印警告')
})

test('main.ts、menu.ts 不再用 require、module.exports、__dirname', opts, async () => {
  for (const f of ['main.ts', 'menu.ts']) {
    const src = await code(f)
    assert.doesNotMatch(src, /\brequire\s*\(/, `${f} 還有 require(…)：改成 import … from '…'`)
    assert.doesNotMatch(src, /\bmodule\.exports\b|\bexports\.\w/, `${f} 還有 module.exports：改成 export`)
    assert.doesNotMatch(src, /\b__dirname\b|\b__filename\b/, `${f} 還有 __dirname：ES module 裡沒有它，改用 import.meta.dirname`)
    assert.match(src, /^\s*import\s/m, `${f} 要用 import 引入需要的東西`)
  }
})

test('main.ts 用 import attributes 讀 config.json', opts, async () => {
  const src = await code('main.ts')
  assert.match(src, /['"]\.\/config\.json['"]\s*(with\s*\{|,\s*\{\s*with\s*:\s*\{)\s*type\s*:\s*['"]json['"]/,
    'main.ts 要寫 import config from \'./config.json\' with { type: \'json\' }，不要用 readFileSync + JSON.parse 或 createRequire 繞過')
})

test('menu.ts 用 export 匯出 readMenu()', opts, async () => {
  const mod: { readMenu?: unknown, default?: unknown } = await import('./convert/menu.ts')
  assert.equal(typeof mod.readMenu, 'function', 'menu.ts 要 export function readMenu()')
  const items = (mod.readMenu as () => { name: string, price: number }[])()
  assert.deepEqual(items[1], { name: '拿鐵', price: 110 }, 'readMenu() 要回傳 menu.csv 的內容，例如第二筆是 { name: \'拿鐵\', price: 110 }')
})

test('node convert/main.ts 印出含稅價目表（換菜單、店名、稅率也對）', opts, async () => {
  // 把你的 convert/ 複製到暫存資料夾，換掉菜單、設定和稅金套件，從「上一層」資料夾執行
  const root = await tmpDir()
  const dir = join(root, 'convert')
  await cp(join(import.meta.dirname, 'convert'), dir, { recursive: true })
  const names = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕'].sort(() => Math.random() - 0.5).slice(0, 4)
  const menu = names.map(name => ({ name, price: 50 + Math.floor(Math.random() * 15) * 10 }))
  const shop = pick(['好咖啡', '巷口咖啡', '晨光咖啡館', '小明的店']), currency = pick(['元', '塊'])
  const rate = pick([0.08, 0.1, 0.12])
  await writeFile(join(dir, 'menu.csv'), menu.map(m => `${m.name},${m.price}`).join('\n') + '\n')
  await writeFile(join(dir, 'config.json'), JSON.stringify({ shop, currency }))
  await writeFile(join(dir, 'vendor', 'legacy-tax.cjs'), `function buildApi(rate) {\n  return { rate, calcTax(price) { return Math.round(price * rate) } }\n}\nmodule.exports = buildApi(${rate})\n`)

  const r = await runNode(join(dir, 'main.ts'), { cwd: root })
  assert.equal(r.code, 0, `node convert/main.ts 出錯了：\n${r.stderr.split('\n').filter(l => !/^\s+at /.test(l)).slice(0, 8).join('\n')}`)
  assert.doesNotMatch(r.stderr, /MODULE_TYPELESS_PACKAGE_JSON/, '出現 MODULE_TYPELESS_PACKAGE_JSON 警告：convert/package.json 要寫 "type": "module"')
  const want = [`${shop} 價目表（含 ${Math.round(rate * 100)}% 稅）`, ...menu.map(m => `${m.name} ${m.price + Math.round(m.price * rate)} ${currency}`)]
  assert.equal(r.stdout, want.join('\n') + '\n', '輸出要跟改寫前一樣；店名、幣別從 config.json 讀，菜單從 menu.csv 讀，稅金用 vendor/legacy-tax.cjs 的 calcTax 算（不要自己乘 0.05）')
})
