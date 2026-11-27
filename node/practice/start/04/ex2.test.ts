import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runNode } from '../../helpers/proc.ts'
import { tmpDir } from '../../helpers/tmp.ts'

const dir = join(import.meta.dirname, 'aliases')
const opts = { timeout: 15_000 }
const sources = ['main.ts', 'routes/menu.ts', 'routes/admin/report.ts']
const output = (fmt: (n: number) => string) =>
  ['美式咖啡 ' + fmt(80), '拿鐵 ' + fmt(110), '可頌 ' + fmt(70), '最低消費 ' + fmt(70), '今日營收 ' + fmt(3460)].join('\n') + '\n'

test('aliases/package.json 的 imports 設定 "#lib/*": "./lib/*"', opts, async () => {
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  assert.equal(typeof pkg.imports, 'object', 'aliases/package.json 要有 "imports" 欄位（Node 不讀 tsconfig 的 paths）')
  assert.equal(pkg.imports['#lib/*'], './lib/*', '"imports" 裡要有 "#lib/*": "./lib/*"；key 一定要以 # 開頭')
})

test('三個檔案都改成 import … from \'#lib/price.ts\'', opts, async () => {
  for (const f of sources) {
    const src = (await readFile(join(dir, f), 'utf8')).replace(/\/\/.*$/gm, '')
    assert.doesNotMatch(src, /['"](\.\.?\/)+lib\//, `${f} 還在用相對路徑引入 lib/：改成 '#lib/price.ts'`)
    assert.match(src, /from\s+['"]#lib\/price\.ts['"]/, `${f} 要寫 import { formatPrice } from '#lib/price.ts'（副檔名照樣要寫）`)
  }
})

test('node aliases/main.ts 照常印出，而且真的透過 #lib 找到 price.ts', opts, async () => {
  const r = await runNode(join(dir, 'main.ts'), { cwd: import.meta.dirname })
  assert.equal(r.code, 0, `node aliases/main.ts 出錯了：\n${r.stderr.split('\n').filter(l => !/^\s+at /.test(l)).slice(0, 6).join('\n')}`)
  assert.equal(r.stdout, output(n => `${n} 元`), '輸出要跟改之前一樣')

  // 複製一份，把 #lib/* 指到另一個資料夾：如果每一行都換成新的格式，才代表三個檔案都透過 #lib 引入
  const copy = join(await tmpDir(), 'aliases')
  await cp(dir, copy, { recursive: true })
  await mkdir(join(copy, 'fake-lib'))
  await writeFile(join(copy, 'fake-lib', 'price.ts'), 'export function formatPrice(price: number) {\n  return `NT$${price}`\n}\n')
  const pkg = JSON.parse(await readFile(join(copy, 'package.json'), 'utf8'))
  pkg.imports = { ...pkg.imports, '#lib/*': './fake-lib/*' }
  await writeFile(join(copy, 'package.json'), JSON.stringify(pkg))
  const r2 = await runNode(join(copy, 'main.ts'))
  assert.equal(r2.stdout, output(n => `NT$${n}`), 'package.json 的 #lib/* 換到別的資料夾時，main.ts、routes/menu.ts、routes/admin/report.ts 都要跟著換：三個檔案都要用 #lib/price.ts')
})
