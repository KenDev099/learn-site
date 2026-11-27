// 練習 1：把 CAFE-50 的規則寫成驗收條件（acceptance-cafe50.json），每個例子都要跟店長的規則一致
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const STATUSES = ['pending', 'paid', 'preparing', 'cancelled']
const EXPECTS = ['refund', 'not_cancellable', 'not_found', 'already_cancelled']
type Example = { status: string, actorIsOwner: boolean, expect: string }
type Criterion = { id: string, given: string, when: string, then: string, examples: Example[] }

// 店長的規則（docs/meeting-notes-13.md）寫成一個小函式：每個例子的 expect 都要跟它算出來的一樣
function oracle({ status, actorIsOwner }: Example) {
  if (!actorIsOwner) return 'not_found'                 // 不是自己的訂單：就像不存在
  if (status === 'paid') return 'refund'                // 付好款、還沒開始製作：取消並退款
  if (status === 'cancelled') return 'already_cancelled' // 已經取消：回目前狀態，不再退款
  return 'not_cancellable'                              // preparing、pending：不能取消
}

let criteria: Criterion[] = []
let parseError = ''
try {
  criteria = JSON.parse(readFileSync(join(import.meta.dirname, 'acceptance-cafe50.json'), 'utf8'))
} catch (e) {
  parseError = (e as Error).message
}
const examples = () => criteria.flatMap(c => (Array.isArray(c?.examples) ? c.examples : []).map(e => ({ ...e, ac: c.id })))
const has = (f: (e: Example) => boolean) => examples().some(f)

describe('練習 1：acceptance-cafe50.json', () => {
  it('是驗收條件的陣列，每條都有 id、given、when、then 與例子，沒有留下 TODO', () => {
    expect(parseError, `acceptance-cafe50.json 不是合法的 JSON：${parseError}`).toBe('')
    expect(Array.isArray(criteria) && criteria.length >= 3, '要是陣列，至少 3 條驗收條件：可以取消、不能取消、不是本人、重複取消，不會全塞在一條裡').toBe(true)
    const ids = criteria.map(c => c?.id)
    expect(new Set(ids).size, `id 不能重複：${ids.join('、')}`).toBe(ids.length)
    for (const c of criteria) {
      expect(String(c?.id), 'id 寫成 AC1、AC2…').toMatch(/^AC\d+$/)
      for (const k of ['given', 'when', 'then'] as const) {
        const v = typeof c[k] === 'string' ? c[k].trim() : ''
        expect(v !== '' && !/TODO/.test(v), `${c.id} 的 ${k} 還沒寫`).toBe(true)
      }
      expect(Array.isArray(c.examples) && c.examples.length > 0, `${c.id} 沒有例子：每條驗收條件至少一個具體的例子`).toBe(true)
    }
  })

  it('每個例子的欄位都是允許的值', () => {
    for (const e of examples()) {
      expect(STATUSES, `${e.ac} 的例子 status「${e.status}」要是 ${STATUSES.join('、')} 之一`).toContain(e.status)
      expect(typeof e.actorIsOwner, `${e.ac} 的例子 actorIsOwner 要是 true 或 false`).toBe('boolean')
      expect(EXPECTS, `${e.ac} 的例子 expect「${e.expect}」要是 ${EXPECTS.join('、')} 之一`).toContain(e.expect)
    }
  })

  it('每個例子的 expect 都符合會議紀錄的規則', () => {
    for (const e of examples()) {
      expect(e.expect, `${e.ac}：status ${e.status}、actorIsOwner ${e.actorIsOwner} 的結果照會議紀錄應該是 ${oracle(e)}，你寫的是 ${e.expect}`).toBe(oracle(e))
    }
  })

  it('涵蓋四個邊界：可以取消、製作中、不是本人、重複取消', () => {
    expect(has(e => e.status === 'paid' && e.actorIsOwner), '缺「本人取消付好款的訂單」的例子（status paid、actorIsOwner true）').toBe(true)
    expect(has(e => e.status === 'preparing' && e.actorIsOwner), '缺「吧台已經開始製作」的例子（status preparing、actorIsOwner true）：這是最容易出事的邊界').toBe(true)
    expect(has(e => !e.actorIsOwner), '缺「不是自己的訂單」的例子（actorIsOwner false）').toBe(true)
    expect(has(e => e.status === 'cancelled' && e.actorIsOwner), '缺「已經取消、再按一次」的例子（status cancelled、actorIsOwner true）').toBe(true)
  })
})
