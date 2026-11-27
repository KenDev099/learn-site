// 練習 2：把會議紀錄寫成可執行的驗收條件（acceptance.json）
// 每個例子都丟進下面的 pickupDecision（會議紀錄的規則）比對，結果要一樣；還要有 5 個邊界例子
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIN = 60_000
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/

// 台北時間的日期與「當天第幾分鐘」。台灣沒有日光節約時間，全年 +08:00，所以直接加 8 小時再讀 UTC 欄位
function taipei(iso: string) {
  const d = new Date(Date.parse(iso) + 8 * 60 * MIN)
  return { date: d.toISOString().slice(0, 10), minute: d.getUTCHours() * 60 + d.getUTCMinutes(), ms: d.getUTCSeconds() * 1000 + d.getUTCMilliseconds() }
}

type Example = { now: string; pickupAt: string; ordersInSlot: number; expect: string }

// 會議紀錄的規則（docs/meeting-notes-02.md）
function pickupDecision(e: Example) {
  const now = taipei(e.now), at = taipei(e.pickupAt)
  const rules = {
    leadTime: Date.parse(e.pickupAt) - Date.parse(e.now) >= 15 * MIN,   // 至少 15 分鐘後
    aligned: at.minute % 15 === 0 && at.ms === 0,                      // :00 :15 :30 :45
    hours: at.minute >= 7 * 60 + 30 && at.minute <= 18 * 60 + 45,      // 07:30–18:45
    today: at.date === now.date,                                       // 台北的同一天
    capacity: e.ordersInSlot < 10,                                     // 這一單之前已經有幾單
  }
  const failed = Object.entries(rules).filter(([, ok]) => !ok).map(([k]) => k)
  return { rules, failed, expect: failed.length ? 'rejected' : 'accepted' }
}
const WHY: Record<string, string> = {
  leadTime: '取餐時間離送出不到 15 分鐘', aligned: '取餐時間沒有對齊 :00／:15／:30／:45',
  hours: '取餐時間（台北時間）不在 07:30–18:45', today: '取餐日期（台北時間）不是今天', capacity: '那個時段已經有 10 單',
}

const file = JSON.parse(readFileSync(join(import.meta.dirname, 'acceptance.json'), 'utf8'))
const criteria: { id?: unknown; given?: unknown; when?: unknown; then?: unknown; examples?: unknown }[] = Array.isArray(file) ? file : []
const examples: Example[] = criteria.flatMap(c => Array.isArray(c?.examples) ? c.examples : [])
const label = (e: Example) => `{ now: ${e.now}, pickupAt: ${e.pickupAt}, ordersInSlot: ${e.ordersInSlot} }`

describe('練習 2：acceptance.json 的格式', () => {
  it('每條條件有 id、given、when、then 和至少一個例子', () => {
    expect(Array.isArray(file) && file.length > 0, 'acceptance.json 要是陣列：[{ "id": "AC1", "given": …, "when": …, "then": …, "examples": [ … ] }, …]').toBe(true)
    const ids = criteria.map(c => c?.id)
    expect(new Set(ids).size, 'id 不能重複').toBe(ids.length)
    for (const c of criteria) {
      expect(String(c?.id), 'id 寫成 AC1、AC2…').toMatch(/^AC\d+$/)
      for (const k of ['given', 'when', 'then'] as const) {
        const v = c?.[k]
        expect(typeof v === 'string' && v.trim() !== '' && !/TODO/.test(v), `${c?.id} 的 ${k} 還沒寫`).toBe(true)
      }
      expect(Array.isArray(c?.examples) && c.examples.length > 0, `${c?.id} 沒有例子：每條規則都要有具體的例子`).toBe(true)
    }
  })

  it('每個例子的時間都帶時區位移，ordersInSlot 是整數，expect 是 accepted 或 rejected', () => {
    for (const e of examples) {
      for (const k of ['now', 'pickupAt'] as const) {
        expect(ISO.test(String(e?.[k])) && !Number.isNaN(Date.parse(e[k])), `${k}「${e?.[k]}」要寫成帶位移的 ISO 8601，例如 2026-11-03T08:15:00+08:00；少了 +08:00，不同時區的人和程式會讀成不同的時間`).toBe(true)
      }
      expect(Number.isInteger(e?.ordersInSlot) && e.ordersInSlot >= 0, `ordersInSlot 要是 0 以上的整數（這一單送出前，那個時段已經有幾單）：${JSON.stringify(e)}`).toBe(true)
      expect(['accepted', 'rejected'], `expect 只能是 "accepted" 或 "rejected"：${JSON.stringify(e)}`).toContain(e?.expect)
    }
  })
})

describe('練習 2：例子跟會議紀錄的規則一致', () => {
  it('每個例子的 expect 都對', () => {
    for (const e of examples) {
      const d = pickupDecision(e)
      const why = d.failed.length ? `會被拒絕：${d.failed.map(k => WHY[k]).join('、')}` : '每條規則都符合，應該接受'
      expect(e.expect, `${label(e)} 你寫 ${e.expect}，但照會議紀錄${why}。時間先換成台北時間再判斷`).toBe(d.expect)
    }
  })

  // 邊界例子：只有一條規則剛好落在分界上，其他規則都符合
  const others = (e: Example, except: string) => Object.entries(pickupDecision(e).rules).every(([k, ok]) => k === except || ok)
  const at = (e: Example) => taipei(e.pickupAt).minute
  const diff = (e: Example) => Date.parse(e.pickupAt) - Date.parse(e.now)
  const BOUNDARIES: [string, (e: Example) => boolean, string][] = [
    ['剛好 15 分鐘後：接受', e => others(e, 'leadTime') && diff(e) === 15 * MIN && e.expect === 'accepted', '取餐時間剛好在送出的 15 分鐘後'],
    ['只差 14 分鐘：拒絕', e => others(e, 'leadTime') && diff(e) === 14 * MIN && e.expect === 'rejected', '取餐時間在送出的 14 分鐘後（例如 08:01 送出、選 08:15）'],
    ['18:45：接受', e => others(e, 'hours') && at(e) === 18 * 60 + 45 && e.expect === 'accepted', '台北時間 18:45 取餐'],
    ['19:00：拒絕', e => others(e, 'hours') && at(e) === 19 * 60 && e.expect === 'rejected', '台北時間 19:00 取餐'],
    ['第 10 單：接受', e => others(e, 'capacity') && e.ordersInSlot === 9 && e.expect === 'accepted', '時段裡已經有 9 單（這是第 10 單）'],
    ['第 11 單：拒絕', e => others(e, 'capacity') && e.ordersInSlot === 10 && e.expect === 'rejected', '時段裡已經有 10 單（這是第 11 單）'],
  ]
  // 每條規則至少一個「只因為這一條被拒絕」的例子：沒有它，這條規則寫錯或漏寫都測不出來
  for (const rule of Object.keys(WHY)) {
    it(`規則「${WHY[rule]}」有自己的拒絕例子`, () => {
      const only = (e: Example) => { const f = pickupDecision(e).failed; return f.length === 1 && f[0] === rule && e.expect === 'rejected' }
      expect(examples.some(only), `少了一個只因為「${WHY[rule]}」而被拒絕的例子：其他規則都要符合，只讓這一條不符合`).toBe(true)
    })
  }

  for (const [name, hit, hint] of BOUNDARIES) {
    it(`有邊界例子：${name}`, () => {
      expect(examples.some(hit), `少了這個邊界例子：${hint}，其他規則都要符合（對齊、營業時間內、今天、未額滿、至少 15 分鐘），只讓這一條剛好落在分界上`).toBe(true)
    })
  }
})
