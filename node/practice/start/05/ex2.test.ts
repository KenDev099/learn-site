import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { run } from '../../helpers/proc.ts'

const here = (f: string) => join(import.meta.dirname, f)
const opts = { timeout: 15_000 }
const tsc = join(import.meta.dirname, '../../node_modules/.bin/tsc')

// 正確的程式：用到 process、Buffer（要 @types/node），import 自己的檔案寫 .ts，型別用 type 引入
const good = {
  'price.ts': `export type MenuItem = { name: string, price: number }\nexport function lineTotal(item: MenuItem, qty: number): number {\n  return item.price * qty\n}\n`,
  'main.ts': `import { lineTotal, type MenuItem } from './price.ts'\nconst latte: MenuItem = { name: '拿鐵', price: 110 }\nconst qty = Number(process.argv[2] ?? '1')\nconsole.log(lineTotal(latte, qty), Buffer.byteLength('拿鐵'))\n`,
}

// 把你的 tsconfig.json 放進一個新的資料夾（src/ 放 files），跑 tsc -p，回傳輸出
async function typecheck(files: Record<string, string>) {
  const config = await readFile(here('tsconfig-task/tsconfig.json'), 'utf8')
  const dir = await mkdtemp(here('.tsconfig-'))   // 放在練習資料夾裡，tsc 才找得到 @types/node
  try {
    await mkdir(join(dir, 'src'))
    await writeFile(join(dir, 'tsconfig.json'), config)
    for (const [name, text] of Object.entries({ ...good, ...files })) await writeFile(join(dir, 'src', name), text)
    const r = await run(tsc, ['-p', dir], { cwd: import.meta.dirname, timeoutMs: 12_000 })
    return { code: r.code, out: (r.stdout + r.stderr).trim() }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('正確的程式（用到 process、Buffer、.ts import）0 錯誤', opts, async () => {
  const { code, out } = await typecheck({})
  const hint = out.includes('TS2591') ? '\n→ TS2591：TypeScript 6 起 types 預設是 []，要寫 "types": ["node"]'
    : out.includes('TS5097') ? '\n→ TS5097：import 寫 .ts 要開 allowImportingTsExtensions（或 rewriteRelativeImportExtensions）' : ''
  assert.ok(code === 0 && out === '', `tsc 對正確的程式報錯了：\n${out.split('\n').slice(0, 4).join('\n')}${hint}`)
})

const bad: [string, string, string, string][] = [
  ['enum', 'TS1294', `export enum Size { Small, Large }\n`, 'enum 要被擋下（erasableSyntaxOnly）'],
  ['參數屬性', 'TS1294', `export class Cup {\n  constructor(private size: string) {}\n}\n`, 'parameter properties 要被擋下（erasableSyntaxOnly）'],
  ['只引入型別卻沒寫 type', 'TS1484', `import { MenuItem } from './price.ts'\nexport const cake: MenuItem = { name: '起司蛋糕', price: 120 }\n`, '沒寫 import type 要被擋下（verbatimModuleSyntax）'],
  ['隱含 any', 'TS7006', `export function double(x) {\n  return x * 2\n}\n`, '參數沒寫型別要被擋下（strict）'],
  ['可能是 undefined', 'TS2532', `const prices = new Map<string, number>()\nexport const latte = prices.get('拿鐵').toFixed(0)\n`, 'Map.get 可能回傳 undefined 要被擋下（strict 裡的 strictNullChecks）'],
  ['import 漏副檔名', 'TS2835', `import { lineTotal } from './price'\nexport const n = lineTotal({ name: '可頌', price: 70 }, 2)\n`, 'import 沒寫副檔名要被擋下（module nodenext）'],
]

for (const [label, code, text, why] of bad) {
  test(`抓得到錯誤：${label}（${code}）`, opts, async () => {
    const { out } = await typecheck({ 'bad.ts': text })
    assert.match(out, new RegExp(`bad\\.ts.*error ${code}`), `${why}。tsc 的輸出：\n${out.split('\n').slice(0, 3).join('\n') || '（沒有錯誤）'}`)
  })
}
