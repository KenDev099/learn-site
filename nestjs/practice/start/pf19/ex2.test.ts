// 練習 2：ADR 至少 5 份、格式完整、編號連續
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas', { http: false })
const dir = join(t.repo, 'docs', 'adr')
const files = existsSync(dir) ? readdirSync(dir).filter(f => /^\d{4}-.+\.md$/.test(f)).sort() : []
const PARTS: [string, RegExp][] = [['狀態', /狀態|status/i], ['背景', /背景|context/i], ['決定', /決定|decision/i], ['後果', /後果|consequences/i]]

describe('練習 2：ADR', () => {
  it('docs/adr/ 至少 5 份 NNNN-標題.md', () => {
    expect(files.length, `docs/adr/ 只有 ${files.length} 份（${files.join('、')}）：至少寫隔離方式、RLS、token、檔案儲存、背景工作、方案與限流其中 5 個決定`).toBeGreaterThanOrEqual(5)
  })

  it('每份都有狀態、背景、決定、後果四節', () => {
    const bad: string[] = []
    for (const f of files) {
      const heads = [...readFileSync(join(dir, f), 'utf8').matchAll(/^#{2,3}\s+(.+)$/gm)].map(m => m[1])
      const missing = PARTS.filter(([, re]) => !heads.some(h => re.test(h))).map(([n]) => n)
      if (missing.length) bad.push(`${f} 少了 ${missing.join('、')}`)
    }
    expect(bad, `${bad.join('；')}。後果要寫代價，不只寫好處`).toEqual([])
  })

  it('編號從 0001 開始連續（不刪舊的 ADR，被取代就改狀態）', () => {
    const nums = files.map(f => Number(f.slice(0, 4)))
    const gaps = nums.map((n, i) => n === i + 1 ? null : `${files[i]}（應該是 ${String(i + 1).padStart(4, '0')}）`).filter(Boolean)
    expect(gaps, `ADR 的編號不連續：${gaps.join('、')}。被推翻的決定不要刪檔，把狀態改成「被 NNNN 取代」，新的決定用下一個編號`).toEqual([])
  })
})
