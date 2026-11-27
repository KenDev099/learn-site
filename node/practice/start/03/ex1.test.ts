import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, readFile, writeFile } from 'node:fs/promises'
import { basename, delimiter, dirname, join } from 'node:path'
import { run } from '../../helpers/proc.ts'
import { tmpDir } from '../../helpers/tmp.ts'

const shop = join(import.meta.dirname, 'shop')
const opts = { timeout: 60_000 }
// npm 用 PATH 上的；把跑測試的這個 node 放在 PATH 最前面，關掉更新檢查、audit、fund 這些會連網路的功能
// 使用者層級、全域的 npm 設定檔指到不存在的檔案：只看專案自己的 package.json 和 .npmrc
const env = { PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`, npm_config_userconfig: join(import.meta.dirname, 'no-user-npmrc'), npm_config_globalconfig: join(import.meta.dirname, 'no-global-npmrc'), npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' }
const npm = (args: string[], cwd: string) => run('npm', args, { cwd, env, timeoutMs: 30_000 })

async function readPkg() {
  let text: string
  try { text = await readFile(join(shop, 'package.json'), 'utf8') } catch { throw new Error('找不到 shop/package.json') }
  try { return JSON.parse(text) } catch (e) { throw new Error(`shop/package.json 不是合法的 JSON（最後一個欄位後面不能有逗號、字串要用雙引號）：${(e as Error).message}`) }
}

// 把 shop/ 複製到暫存資料夾（不含 node_modules），在那裡執行 npm 指令，不會動到你的檔案
async function copyShop() {
  const dir = await tmpDir()
  await cp(shop, dir, { recursive: true, filter: f => !['node_modules', 'POSTINSTALL_RAN'].includes(basename(f)) })
  return dir
}

test('package.json 有 private、"type": "module"、engines.node', opts, async () => {
  const pkg = await readPkg()
  assert.equal(pkg.private, true, '加上 "private": true（布林值，不是字串），避免不小心 npm publish 到公開的 registry')
  assert.equal(pkg.type, 'module', '加上 "type": "module"，讓 .ts／.js 檔都當成 ES module')
  assert.equal(pkg.engines?.node, '>=24.20.0', '加上 "engines": { "node": ">=24.20.0" }')
})

test('scripts 有 start、dev、test', opts, async () => {
  const s = (await readPkg()).scripts ?? {}
  assert.equal(s.start, 'node main.ts', 'scripts.start 要是 "node main.ts"')
  assert.equal(s.dev, 'node --watch main.ts', 'scripts.dev 要是 "node --watch main.ts"')
  assert.equal(s.test, 'node --test', 'scripts.test 要是 "node --test"（不給路徑，讓它自己找測試檔）')
})

test('npm test 跑得到 menu-test.ts 並通過', opts, async () => {
  const dir = await copyShop()
  const r = await npm(['test', '--silent'], dir)
  assert.equal(r.code, 0, `npm test 失敗（結束碼 ${r.code}）：\n${(r.stdout + r.stderr).split('\n').slice(0, 12).join('\n')}`)
  assert.match(r.stdout, /菜單有 6 樣商品/, 'npm test 沒有跑到 menu-test.ts：scripts.test 寫 "node --test" 就好')
})

test('npm start 執行 main.ts，沒有 MODULE_TYPELESS_PACKAGE_JSON 警告', opts, async () => {
  const dir = await copyShop()
  // 換一份隨機長度的菜單，確認 npm start 真的執行了 main.ts
  const n = 2 + Math.floor(Math.random() * 20)
  await writeFile(join(dir, 'menu.ts'), `export const menu = ${JSON.stringify(Array.from({ length: n }, (_, i) => ({ name: `品項${i}`, price: 50 + i })))}\n`)
  const r = await npm(['start', '--silent'], dir)
  assert.equal(r.code, 0, `npm start 失敗（結束碼 ${r.code}）：\n${r.stderr.split('\n').slice(0, 8).join('\n')}`)
  assert.equal(r.stdout, `☕ 咖啡店開門了，今天有 ${n} 樣商品\n`, 'npm start 要執行 node main.ts，不要改 main.ts 的輸出')
  assert.doesNotMatch(r.stderr, /MODULE_TYPELESS_PACKAGE_JSON/, '出現 MODULE_TYPELESS_PACKAGE_JSON 警告：package.json 少了 "type": "module"')
})
