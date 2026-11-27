// 練習 3：再審 PR-58 第二版，填 reviews/PR-58/rereview.json
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = import.meta.dirname
const rr = JSON.parse(readFileSync(join(dir, 'reviews/PR-58/rereview.json'), 'utf8'))
const items: { defect: string, status: string }[] = Array.isArray(rr.items) ? rr.items : []
const status = (d: string) => items.find(i => i.defect === d)?.status

describe('練習 3：rereview.json', () => {
  it('D1、D2、D3 各一筆，status 是 resolved 或 not-resolved', () => {
    expect(items.map(i => i.defect).sort(), 'items 要正好是 D1、D2、D3 各一筆').toEqual(['D1', 'D2', 'D3'])
    for (const i of items) expect(['resolved', 'not-resolved'], `${i.defect} 的 status 要是 resolved 或 not-resolved`).toContain(i.status)
  })

  it('D1：折扣改成伺服器計算，已解決', () => {
    expect(status('D1'), '看 round2.patch 的 orders.service.ts 與 contract.ts：折扣改由 percentOff 計算，契約也拿掉了 discount').toBe('resolved')
  })

  it('D2：只是包進 $transaction，沒有解決', () => {
    expect(status('D2'), '交易不等於互斥：READ COMMITTED 下兩個交易都會讀到「還沒用過」再各自扣用量。用 npm run review:race -- round2 跑你的測試看看').toBe('not-resolved')
  })

  it('D3：改用 {{ }} 顯示，已解決', () => {
    expect(status('D3'), '看 round2.patch 的 CouponBanner.vue：{{ }} 會把 HTML 當純文字顯示，不會執行').toBe('resolved')
  })

  it('還有沒解決的 blocker，verdict 仍是 request-changes', () => {
    expect(rr.verdict, 'D2 還沒解決，不能 approve').toBe('request-changes')
  })
})
