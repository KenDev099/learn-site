// 練習 3：你寫的 test/checkout.e2e-spec.ts 要抓到每一個改壞的版本
// 改壞的版本建立在標準答案（answer/27）上，所以你的測試只能透過 HTTP 與 test/support/app.ts 檢查行為，不能依賴你自己實作的細節
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runMutants } from '../../helpers/mutants.ts'

const ANSWER = join(import.meta.dirname, '..', '..', 'answer', '27')
const FILES = ['src/orders/orders.service.ts', 'src/orders/orders.controller.ts', 'src/payments/payments.service.ts', 'src/loyalty/loyalty.service.ts']
const answer = Object.fromEntries(FILES.map(f => [f, readFileSync(join(ANSWER, f), 'utf8')]))

// 標準答案的四個檔案，其中一個換掉一段
function mutant(file: string, from: string | RegExp, to: string) {
  const changed = answer[file].replace(from, to)
  if (changed === answer[file]) throw new Error(`出題錯誤：${file} 裡找不到「${from}」`)
  return { ...answer, [file]: changed }
}

describe('練習 3：結帳主流程的 e2e 測試', () => {
  it('不 mock PrismaService：用真的資料庫與佇列', () => {
    const spec = readFileSync(join(import.meta.dirname, 'test', 'checkout.e2e-spec.ts'), 'utf8').replace(/\/\/.*$/gm, '')
    expect(spec, '這個測試要驗證的是交易、唯一約束、佇列放在一起的行為：不要 overrideProvider(PrismaService) 或 vi.mock').not.toMatch(/overrideProvider\s*\(\s*PrismaService|vi\.mock\s*\(/)
  })

  it('你的測試在標準答案上通過，並抓得到每一個改壞的版本', () => {
    const r = runMutants(import.meta.dirname, {
      '標準答案（不能被判錯）': answer,
      '沒看 Idempotency-Key：重送就多一張訂單': mutant('src/orders/orders.service.ts',
        'await tx.idempotencyKey.create({ data: { key, requestHash } })',
        'await tx.idempotencyKey.create({ data: { key: `${key}-${Math.random()}`, requestHash } })'),
      '沒扣庫存': mutant('src/orders/orders.service.ts', 'data: { stock: { decrement: quantity } }', 'data: { stock: { decrement: 0 } }'),
      '重送時回 200（第一次是 201）': mutant('src/orders/orders.service.ts',
        'return { status: saved.responseStatus, body: saved.responseBody }', 'return { status: 200, body: saved.responseBody }'),
      '重送時重新查訂單（回傳現在的狀態，不是第一次的回應）': mutant('src/orders/orders.service.ts',
        'return { status: saved.responseStatus, body: saved.responseBody }',
        'return { status: saved.responseStatus, body: JSON.stringify(await this.findOne(JSON.parse(saved.responseBody).id)) }'),
      '同一個 key 換了內容也照樣回傳舊訂單': mutant('src/orders/orders.service.ts',
        'if (saved.requestHash !== requestHash) throw new IdempotencyKeyReusedError(key)', ''),
      '沒帶 Idempotency-Key 也照樣下單': mutant('src/orders/orders.service.ts',
        'if (!key || !KEY_FORMAT.test(key)) throw new IdempotencyKeyRequiredError()',
        'if (!key || !KEY_FORMAT.test(key)) key = `auto-${Date.now()}-${Math.floor(Math.random() * 1e6)}`'),
      '付款後沒寫 receipt.requested：不會寄收據': mutant('src/payments/payments.service.ts',
        "{ type: 'order.paid', payload }, { type: 'receipt.requested', payload }", "{ type: 'order.paid', payload }"),
      '付款後沒寫 order.paid：不會集點': mutant('src/payments/payments.service.ts',
        "{ type: 'order.paid', payload }, { type: 'receipt.requested', payload }", "{ type: 'receipt.requested', payload }"),
    })
    expect(r.survived.includes('標準答案（不能被判錯）'), '你的測試在標準答案上失敗了：測試只能檢查題目要求的行為（HTTP 回應、點數、收據），不能依賴你自己加的欄位或實作細節').toBe(true)
    const missed = r.survived.filter(n => n !== '標準答案（不能被判錯）')
    expect(missed, `沒抓到的版本：${missed.join('、')}。沒帶 key 要 400；重送要比對狀態碼與 res.text、付款之後再重送一次、換內容重送；付款後要 drain 再檢查點數與收據`).toEqual([])
  }, 900_000)
})
