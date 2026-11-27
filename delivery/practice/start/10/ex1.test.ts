// 練習 1：讀 CHANGELOG，在 upgrade-notes.json 列出每個破壞性變更影響到的程式位置
// 對照答案：掃描這一課的起始程式（practice/start/10，不是你改過的版本），所以行號以起始版本為準
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = import.meta.dirname
const origin = join(dir, '../../start/10')
const CHANGES = ['amount-unit', 'create-api', 'error-throw'] as const
type Loc = { file: string, line: number }

// 用到 1.x SDK 的檔案（import '#cafepay-sdk-v1'），以及每個變更在這些檔案裡的特徵
const PATTERNS: Record<(typeof CHANGES)[number], RegExp> = {
  'amount-unit': /createPayment\(|\.payment\.amount\b/,   // 送進 SDK、或從 SDK 拿回來的金額
  'create-api': /\bcreatePayment\(/,
  'error-throw': /\.ok\b/,                                // 讀 { ok, error } 的地方
}
function walk(d: string): string[] {
  return readdirSync(d).flatMap(f => {
    const p = join(d, f)
    if (statSync(p).isDirectory()) return f === 'generated' ? [] : walk(p)
    return /\.(ts|mjs)$/.test(f) && !f.endsWith('.test.ts') ? [p] : []
  })
}
const sdkFiles = ['api/src', 'scripts'].flatMap(d => walk(join(origin, d)))
  .filter(p => /from '#cafepay-sdk-v1'/.test(readFileSync(p, 'utf8')))
const expected = Object.fromEntries(CHANGES.map(c => [c, sdkFiles.flatMap(p =>
  readFileSync(p, 'utf8').split('\n').flatMap((text, i) => PATTERNS[c].test(text) ? [{ file: relative(origin, p), line: i + 1 }] : []))]))

function notes(): { change: string, locations: Loc[] }[] {
  const raw = readFileSync(join(dir, 'upgrade-notes.json'), 'utf8')
  let data
  try { data = JSON.parse(raw) } catch (e) { throw new Error(`upgrade-notes.json 不是合法的 JSON：${(e as Error).message}`) }
  expect(Array.isArray(data), 'upgrade-notes.json 要是陣列：[{ change, locations: [{ file, line }] }]').toBe(true)
  return data
}
const near = (a: Loc, b: Loc) => a.file === b.file && Math.abs(a.line - b.line) <= 2
const show = (l: Loc) => `${l.file}:${l.line}`

describe('練習 1：破壞性變更的影響點', () => {
  it('對照答案找得到東西（起始程式還在）', () => {
    expect(existsSync(origin), `找不到起始程式 ${origin}`).toBe(true)
    for (const c of CHANGES) expect(expected[c].length, c).toBeGreaterThan(0)
  })

  it('三個變更都列了，每個位置都是 { file, line }，檔案存在、行號在檔案範圍內', () => {
    const list = notes()
    for (const c of CHANGES) expect(list.filter(n => n.change === c).length, `要有一個 change 是 "${c}"（剛好一個）`).toBe(1)
    for (const n of list) {
      expect(Array.isArray(n.locations), `${n.change} 的 locations 要是陣列`).toBe(true)
      for (const l of n.locations) {
        expect(typeof l.file === 'string' && Number.isInteger(l.line), `${n.change} 的位置要寫成 { "file": "相對路徑", "line": 行號 }，得到 ${JSON.stringify(l)}`).toBe(true)
        const path = join(origin, l.file)
        expect(!l.file.includes('..') && existsSync(path), `${n.change}：檔案 ${l.file} 不存在（路徑相對於專案根目錄，例如 api/src/payments/cafepay.ts）`).toBe(true)
        const lines = readFileSync(path, 'utf8').split('\n').length
        expect(l.line >= 1 && l.line <= lines, `${n.change}：${show(l)} 超出檔案的行數（${lines} 行）`).toBe(true)
      }
    }
  })

  for (const c of CHANGES) {
    it(`${c}：涵蓋起始程式裡的每一個影響點（行號差 2 行以內），無關的位置最多 1 個`, () => {
      const given = notes().find(n => n.change === c)?.locations ?? []
      const missing = expected[c].filter(e => !given.some(g => near(g, e)))
      expect(missing.map(show), `${c} 漏了 ${missing.map(show).join('、')}。用 grep 在 api/src 和 scripts 搜尋，不要只看第一個結果；用到 SDK 的不只 cafepay.ts`).toEqual([])
      const extra = given.filter(g => !expected[c].some(e => near(g, e)))
      expect(extra.length, `${c} 列了跟這個變更無關的位置：${extra.map(show).join('、')}（行號以起始版本為準）`).toBeLessThanOrEqual(1)
    })
  }
})
