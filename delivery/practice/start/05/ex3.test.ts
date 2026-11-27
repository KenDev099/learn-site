// 練習 3：docs/bugs/BUG-31.md 修復紀錄
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sections } from '../../helpers/docs.ts'

const dir = import.meta.dirname
const md = readFileSync(join(dir, 'docs/bugs/BUG-31.md'), 'utf8')
const doc = sections(md)
const field = (section: string, name: string) => (doc.get(section) ?? '').match(new RegExp(`^- ${name}：(.*)$`, 'm'))?.[1].trim() ?? ''
const LOG = join(dir, '../../start/05/logs/api-2026-11-02.ndjson')
const failed = readFileSync(LOG, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  .filter(l => l.context === 'HTTP' && l.message.path === '/orders' && l.message.status === 500)
const SPEC = join(dir, 'api/src/orders/orders.unavailable.spec.ts')

describe('練習 3：BUG-31 修復紀錄', () => {
  it('五個標題都在，沒有留下 TODO', () => {
    for (const h of ['現象', '影響範圍', '根因', '修正', '預防']) expect(doc.has(h), `少了「## ${h}」`).toBe(true)
    expect(md.includes('TODO'), '還有 TODO 沒填').toBe(false)
    for (const [s, f] of [['現象', '顧客看到'], ['現象', '錯誤特徵'], ['影響範圍', '時間'], ['根因', '說明'], ['修正', '做法']]) {
      expect(field(s, f), `「## ${s}」的「- ${f}：」要填`).not.toBe('')
    }
  })

  it('影響範圍的請求數與顧客數是正確的數字', () => {
    const n = (s: string) => s.match(/^\d+/)?.[0]
    expect(n(field('影響範圍', '失敗請求數')), '「- 失敗請求數：」要以數字開頭，等於 log 裡 POST /orders 回 500 的筆數（「少數使用者」沒辦法判斷嚴重程度）').toBe(String(failed.length))
    expect(n(field('影響範圍', '受影響顧客數')), '「- 受影響顧客數：」要以數字開頭，是不同顧客的人數，不是請求數').toBe(String(new Set(failed.map(l => l.message.customerId)).size))
  })

  it('根因指到 start 版本 orders.service.ts 讀 .price 的那一行', () => {
    const m = field('根因', '程式位置').match(/orders\.service\.ts:(\d+)/)
    expect(m, '「- 程式位置：」要寫 檔案:行號，例如 api/src/orders/orders.service.ts:12（「前端 bug」沒有指到程式）').not.toBeNull()
    const lines = readFileSync(join(dir, '../../start/05/api/src/orders/orders.service.ts'), 'utf8').split('\n')
    expect(lines[Number(m![1]) - 1] ?? '', `start 版本的第 ${m![1]} 行不是丟出 TypeError 的那一行；log 的 stack 第一個 frame 會告訴你行號`).toContain('.price')
  })

  it('預防寫的回歸測試名稱，真的在你的 spec 裡', () => {
    const name = field('預防', '回歸測試')
    expect(name.length >= 4, '「- 回歸測試：」要填 spec 裡 it(…) 的名稱，一字不差（只寫「加強測試」沒有人知道是哪個測試）').toBe(true)
    const spec = existsSync(SPEC) ? readFileSync(SPEC, 'utf8') : ''
    const titles = [...spec.matchAll(/\b(?:it|test)\(\s*(['"`])(.*?)\1/g)].map(m => m[2])
    expect(titles, `orders.unavailable.spec.ts 裡沒有叫「${name}」的測試。現在有的：${titles.join('、') || '（沒有）'}`).toContain(name)
  })
})
