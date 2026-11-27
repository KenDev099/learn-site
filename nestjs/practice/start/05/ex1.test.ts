// 練習 1：你寫的 src/calc-total.spec.ts 要在正確的 calcTotal 上通過，並抓到每一個故意改壞的版本
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runMutants } from '../../helpers/mutants.ts'
import { calcTotal } from './src/calc-total.js'

// 只帶這一題的 spec 去跑，別題還沒寫完不會影響這一題
function stage(spec: string) {
  const dir = mkdtempSync(join(tmpdir(), 'learn-nest05-'))
  cpSync(import.meta.dirname, dir, { recursive: true, filter: f => !/(^|\/)(node_modules|dist)$|\.test\.ts$/.test(f) && (!f.endsWith('.spec.ts') || f.endsWith('/' + spec)) })
  return dir
}

const file = 'src/calc-total.ts'
const REFACTOR = '重構（行為不變，測試要照樣通過）'
const swap = (from: string, to: string) => ({ [file]: (code: string) => {
  if (!code.includes(from)) throw new Error(`src/calc-total.ts 被改過了，找不到「${from}」：這一題只寫測試，不要改 calc-total.ts`)
  return code.replace(from, to)
} })

describe('練習 1：calcTotal 的測試', () => {
  it('calc-total.ts 維持原樣（這一題只寫測試）', () => {
    const line = { name: '拿鐵', price: 110, size: 'L' as const, quantity: 2 }
    expect(calcTotal([line], false), '不要改 src/calc-total.ts，要改的是 src/calc-total.spec.ts').toBe(260)
    expect(calcTotal([line], true), '不要改 src/calc-total.ts，要改的是 src/calc-total.spec.ts').toBe(247)
  })

  it('你的測試抓得到每一個改壞的版本', () => {
    const dir = stage('calc-total.spec.ts')
    try {
      const r = runMutants(dir, {
        '尺寸沒有加價': swap(' + SIZE_UPCHARGE[line.size]', ''),
        'L 只加 10 元': swap('L: 20', 'L: 10'),
        '加價沒有乘上數量': swap('(line.price + SIZE_UPCHARGE[line.size]) * line.quantity', 'line.price * line.quantity + SIZE_UPCHARGE[line.size]'),
        '數量被忽略': swap(') * line.quantity, 0)', '), 0)'),
        '會員折扣無條件捨去': swap('Math.round', 'Math.floor'),
        '非會員也打折': swap('member ?', 'true ?'),
        '沒有品項時回傳 NaN': swap('const subtotal', 'if (lines.length === 0) return Number.NaN\n  const subtotal'),
        [REFACTOR]: swap('const subtotal = lines.reduce((sum, line) => sum + (line.price + SIZE_UPCHARGE[line.size]) * line.quantity, 0)',
          'let subtotal = 0\n  for (const { price, size, quantity } of lines) subtotal += (price + SIZE_UPCHARGE[size]) * quantity'),
      })
      expect(r.killed, `改寫成 for 迴圈、算出來的結果完全一樣的 calcTotal，你的測試卻失敗了。測試要檢查回傳值，不要比對原始碼或函式內容，否則每次重構都會壞`).not.toContain(REFACTOR)
      const missed = r.survived.filter(n => n !== REFACTOR)
      expect(missed, `沒抓到的版本：${missed.join('、')}。這些故意改壞的 calcTotal，你的測試都沒有失敗。想一想：哪個輸入會讓正確版本和這個壞版本算出不同的數字？把它寫成測試`).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
