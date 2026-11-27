// 練習 1：審查 PR-58，填 reviews/PR-58/review.json
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = import.meta.dirname
// 行號一律對照題目原本的 PR 程式（不讀 work 裡的 tree/，改了程式也沒用）
const TREE = join(dir, '../../start/07/reviews/PR-58/tree')
const review = JSON.parse(readFileSync(join(dir, 'reviews/PR-58/review.json'), 'utf8'))

type Comment = { file: string, line: number, severity: string, problem: string, suggestion: string }
const comments: Comment[] = Array.isArray(review.comments) ? review.comments : []
const norm = (f: unknown) => String(f ?? '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^(reviews\/PR-58\/)?(tree\/)?/, '').replace(/^b\//, '')
const lines = (file: string) => readFileSync(join(TREE, file), 'utf8').split('\n')
// 找出這段文字在 PR 程式的第幾行（從 1 開始）
const lineOf = (file: string, text: string) => {
  const n = lines(file).findIndex(l => l.includes(text)) + 1
  if (!n) throw new Error(`題目的 ${file} 找不到「${text}」`)
  return n
}
type Target = { file: string, line: number }
const near = (c: Comment, targets: Target[]) => targets.some(t => norm(c.file) === t.file && Math.abs(Number(c.line) - t.line) <= 3)

const SERVICE = 'api/src/orders/orders.service.ts'
const DEFECTS: [string, string, Target[]][] = [
  ['D1', '折扣金額：伺服器直接用客戶端送來的 discount（錢）', [
    { file: SERVICE, line: lineOf(SERVICE, 'dto.discount ?? 0') },
    { file: 'shared/contract.ts', line: lineOf('shared/contract.ts', 'discount: z.int()') },
  ]],
  ['D2', '使用次數上限：先讀用量檢查、之後才寫（並發）', [
    { file: SERVICE, line: lineOf(SERVICE, 'coupon.usedCount >= coupon.maxUses') },
    { file: SERVICE, line: lineOf(SERVICE, 'usedCount: coupon.usedCount + 1') },
  ]],
  ['D3', '結帳頁的優惠券訊息怎麼顯示（安全）', [
    { file: 'web/src/components/CouponBanner.vue', line: lineOf('web/src/components/CouponBanner.vue', 'v-html="') },
    { file: 'web/src/pages/CheckoutPage.vue', line: lineOf('web/src/pages/CheckoutPage.vue', '<CouponBanner') },
    { file: 'web/src/pages/CheckoutPage.vue', line: lineOf('web/src/pages/CheckoutPage.vue', 'couponMessage.value = (e as Error).message') },
  ]],
]
const NAMING: Target = { file: 'web/src/api/coupons.ts', line: lineOf('web/src/api/coupons.ts', 'function getCpnInfo') }
const SEVERITIES = ['blocker', 'major', 'minor', 'nit']

describe('練習 1：review.json', () => {
  it('格式：verdict、1～8 條意見，每條都指到 PR 裡真的存在的一行，並寫出問題與修法', () => {
    expect(['approve', 'request-changes', 'comment'], 'verdict 要是 approve、request-changes 或 comment').toContain(review.verdict)
    expect(Array.isArray(review.comments) && comments.length > 0, 'comments 要是陣列，至少一條').toBe(true)
    expect(comments.length, '意見最多 8 條：挑真正重要的寫，太多條會讓作者找不到重點').toBeLessThanOrEqual(8)
    comments.forEach((c, i) => {
      const at = `第 ${i + 1} 條意見`
      const file = norm(c.file)
      expect(file !== '' && existsSync(join(TREE, file)), `${at}：file「${c.file}」不在 PR 裡。寫 tree/ 底下的路徑，例如 ${SERVICE}`).toBe(true)
      expect(Number.isInteger(c.line) && c.line >= 1 && c.line <= lines(file).length, `${at}：line 要是 ${file} 裡存在的行號（數字，從 1 開始），得到 ${JSON.stringify(c.line)}`).toBe(true)
      expect(SEVERITIES, `${at}：severity 要是 blocker、major、minor 或 nit`).toContain(c.severity)
      for (const key of ['problem', 'suggestion'] as const) {
        expect(typeof c[key] === 'string' && c[key].trim() !== '' && !c[key].includes('TODO'), `${at}：${key} 還沒填（不能留 TODO）`).toBe(true)
      }
    })
  })

  for (const [id, what, targets] of DEFECTS) {
    it(`找到 ${id}：${what}，並標成 blocker`, () => {
      const hits = comments.filter(c => near(c, targets))
      expect(hits.length > 0, `有一個會讓店家損失或出事的缺陷沒有意見：${what}。照審查順序（金額 → 並發 → 安全）再看一次 pr.diff`).toBe(true)
      expect(hits.some(c => c.severity === 'blocker'), `${id} 有指到，但嚴重程度是 ${hits.map(c => c.severity).join('、')}：錢算錯、資料錯、安全問題不改不能合併，要標 blocker`).toBe(true)
    })
  }

  it('命名風格的意見只能是 nit', () => {
    const hits = comments.filter(c => near(c, [NAMING]))
    for (const c of hits) expect(c.severity, `${NAMING.file}:${c.line} 只是命名偏好，不影響行為，要標 nit（標高了會跟真正的 blocker 搶注意力）`).toBe('nit')
  })

  it('有 blocker 時 verdict 是 request-changes', () => {
    expect(review.verdict, '還有 blocker 沒改就不能 approve；comment 也不會擋下合併。要用 request-changes').toBe('request-changes')
  })
})
