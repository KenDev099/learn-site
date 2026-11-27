// 練習 1：從 log 整理出 evidence.json
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = import.meta.dirname
// 正確答案從原始的 log 算（不讀 work 裡的那份，改了 log 也沒用）
const LOG = join(dir, '../../start/05/logs/api-2026-11-02.ndjson')
const http = readFileSync(LOG, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(l => l.context === 'HTTP')
const failed = http.filter(l => l.message.method === 'POST' && l.message.path === '/orders' && l.message.status === 500)
const ev = JSON.parse(readFileSync(join(dir, 'evidence.json'), 'utf8'))
const sec = (ms: number) => Math.floor(ms / 1000)
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

describe('練習 1：evidence.json', () => {
  it('requestIds 正好是 POST /orders 回 500 的那些', () => {
    const ids: unknown = ev.requestIds
    expect(Array.isArray(ids), 'requestIds 要是字串陣列').toBe(true)
    const others = http.filter(l => l.message.status !== 500).map(l => l.message.requestId)
    const extra = (ids as string[]).filter(id => others.includes(id))
    expect(extra, `這些 requestId 不是 500（例如同時段的 422 是格式錯誤，跟這張單無關）：${extra.join(', ')}`).toEqual([])
    expect(new Set(ids as string[]).size, 'requestIds 不要重複').toBe((ids as string[]).length)
    expect([...(ids as string[])].sort(), 'POST /orders 回 500 的請求要全部列出（用 jq 篩出來，不要只抄第一筆）').toEqual(failed.map(l => l.message.requestId).sort())
  })

  it('firstSeen、lastSeen 是第一筆與最後一筆 500 的時間（ISO 8601，要帶 Z 或 +08:00）', () => {
    for (const [key, want] of [['firstSeen', failed[0].timestamp], ['lastSeen', failed.at(-1).timestamp]] as const) {
      const v = ev[key]
      expect(typeof v === 'string' && /(Z|[+-]\d\d:\d\d)$/.test(v), `${key} 要是 ISO 8601 字串並帶時區，例如 jq todate 印出的 ${iso(want)}`).toBe(true)
      expect(Number.isNaN(Date.parse(v)), `${key} 不是合法的時間：${v}`).toBe(false)
      expect(sec(Date.parse(v)), `${key} 跟 log 不同。log 的 timestamp 是 Unix 毫秒（UTC）；把台北時間寫成 Z 結尾會差 8 小時`).toBe(sec(want))
    }
  })

  it('affectedCustomers 是不同顧客的人數，不是請求數', () => {
    const customers = new Set(failed.map(l => l.message.customerId)).size
    expect(ev.affectedCustomers, ev.affectedCustomers === failed.length ? `${failed.length} 是請求數：同一位顧客會重試好幾次，人數要去掉重複` : 'affectedCustomers 要填受影響的不同 customerId 有幾個').toBe(customers)
  })

  it('productIds 是所有失敗請求共同含有的商品', () => {
    expect(Array.isArray(ev.productIds), 'productIds 要是數字陣列').toBe(true)
    const common = failed.map(l => l.message.productIds as number[]).reduce((a, b) => a.filter(x => b.includes(x)))
    expect([...ev.productIds].sort(), '只列出「每一筆失敗請求都有」的商品；只出現在部分請求裡的不是共同點').toEqual(common.sort())
  })
})
