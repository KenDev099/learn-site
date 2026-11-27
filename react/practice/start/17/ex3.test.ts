import { describe, expect, test, vi } from 'vitest'
import { createOrderAction, orderSchema } from './order-action.ts'
import { EMPTY_VALUES, initialOrderState, ServerValidationError, type OrderInput, type OrderState } from './order-types.ts'

const NAME = '請輸入姓名'
const PHONE = '手機要是 09 開頭的 10 碼數字'
const QUANTITY = '數量要是 1～20 的整數'
const TIME = '取餐時間要是 HH:mm'

function form(values: Partial<Record<string, string>>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) if (v !== undefined) fd.set(k, v)
  return fd
}

function setup(placeOrder: (input: OrderInput) => Promise<{ id: number }> = async () => ({ id: 81 })) {
  const api = { placeOrder: vi.fn(placeOrder) }
  return { api, action: createOrderAction(api) }
}

const valid = { name: ' 王小明 ', phone: '0912345678', quantity: '2', pickupTime: '09:30' }

describe('練習 3：Action 裡用 zod 驗證，回傳欄位錯誤', () => {
  test('orderSchema 是 zod schema：合法資料轉成送給伺服器的型別', () => {
    expect(typeof orderSchema.safeParse, '要 export 用 z.object(…) 寫的 orderSchema').toBe('function')
    const r = orderSchema.safeParse({ name: ' 陳美華 ', phone: '0987654321', quantity: '12', pickupTime: '18:05' })
    expect(r.success, '合法資料 safeParse 要成功').toBe(true)
    expect(r.data, 'name 要去掉頭尾空白（z.string().trim()），quantity 要轉成數字（z.coerce.number()）').toEqual({ name: '陳美華', phone: '0987654321', quantity: 12, pickupTime: '18:05' })
  })

  test('合法資料：呼叫 placeOrder（轉好型別），回傳成功的 state', async () => {
    const { api, action } = setup(async () => ({ id: 81 }))
    const result = await action(initialOrderState, form(valid))
    expect(api.placeOrder.mock.calls, 'placeOrder 收到的要是 parsed.data：姓名去掉空白、數量是 number').toEqual([[{ name: '王小明', phone: '0912345678', quantity: 2, pickupTime: '09:30' }]])
    expect(result, '成功時回傳 { ...initialOrderState, orderId }：values 是空字串（表單會自動清空），沒有錯誤').toEqual({ values: EMPTY_VALUES, fieldErrors: {}, formError: null, orderId: 81 })
  })

  test('驗證沒過：不呼叫伺服器，一次回傳所有欄位的錯誤，values 保留原文', async () => {
    const { api, action } = setup()
    const sent = { name: '   ', phone: '0812', quantity: '0', pickupTime: '9:30' }
    const result = await action(initialOrderState, form(sent))
    expect(api.placeOrder, '驗證沒過不能呼叫 placeOrder').not.toHaveBeenCalled()
    expect(result.fieldErrors, '四個欄位都錯：每個欄位都要有錯誤（用 z.flattenError(parsed.error).fieldErrors，不要遇到第一個錯就 return）').toEqual({ name: [NAME], phone: [PHONE], quantity: [QUANTITY], pickupTime: [TIME] })
    expect(result.values, 'values 要是這次送出的原文（姓名的空白也保留），表單才能原樣放回去').toEqual(sent)
    expect(result.formError).toBeNull()
    expect(result.orderId).toBeNull()
  })

  test('數量：空的、不是數字、0、21、2.5 都不行，1 和 20 可以', async () => {
    const { action } = setup()
    for (const quantity of ['', 'abc', '0', '21', '2.5', '-1']) {
      const r = await action(initialOrderState, form({ ...valid, quantity }))
      expect(r.fieldErrors, `數量是 ${JSON.stringify(quantity)} 時只有 quantity 有錯，訊息是「${QUANTITY}」（z.coerce.number 的 error 選項也要設，不然 'abc' 會出現英文訊息）`).toEqual({ quantity: [QUANTITY] })
    }
    for (const quantity of ['1', '20']) {
      const r = await action(initialOrderState, form({ ...valid, quantity }))
      expect(r.fieldErrors, `數量是 ${quantity} 要通過`).toEqual({})
    }
  })

  test('手機與取餐時間的格式', async () => {
    const { action } = setup()
    const cases: [Partial<typeof valid>, Record<string, string[]>][] = [
      [{ phone: '09123456789' }, { phone: [PHONE] }],
      [{ phone: '09-1234-5678' }, { phone: [PHONE] }],
      [{ pickupTime: '24:00' }, { pickupTime: [TIME] }],
      [{ pickupTime: '12:60' }, { pickupTime: [TIME] }],
      [{ pickupTime: '23:59' }, {}],
      [{ name: '林志豪' }, {}],
    ]
    for (const [patch, expected] of cases) {
      const r = await action(initialOrderState, form({ ...valid, ...patch }))
      expect(r.fieldErrors, `${JSON.stringify(patch)} 的驗證結果不對`).toEqual(expected)
    }
  })

  test('FormData 缺少欄位時當成空字串，訊息照樣是中文', async () => {
    const { api, action } = setup()
    const result = await action(initialOrderState, form({ name: '張雅婷', quantity: '1' }))
    expect(api.placeOrder).not.toHaveBeenCalled()
    expect(result.fieldErrors, 'formData.get 拿不到的欄位是 null：先換成 \'\' 再驗證，不然 zod 會給「expected string, received null」這種英文訊息').toEqual({ phone: [PHONE], pickupTime: [TIME] })
    expect(result.values, '缺少的欄位在 values 裡是 \'\'').toEqual({ name: '張雅婷', phone: '', quantity: '1', pickupTime: '' })
  })

  test('伺服器回 ServerValidationError：欄位錯誤放回 state，保留原文', async () => {
    const { action } = setup(async () => { throw new ServerValidationError({ pickupTime: ['這個時段已額滿'] }) })
    const result = await action(initialOrderState, form(valid))
    expect(result, '伺服器的欄位錯誤要回傳成 fieldErrors（不要丟出去），values 保留這次的原文').toEqual({ values: valid, fieldErrors: { pickupTime: ['這個時段已額滿'] }, formError: null, orderId: null })
  })

  test('其他錯誤（網路）：回傳 formError，保留原文', async () => {
    const { action } = setup(async () => { throw new TypeError('Failed to fetch') })
    const result = await action(initialOrderState, form(valid))
    expect(result, '網路錯誤回傳 formError「送出失敗，請再試一次」並保留 values；不要丟出去，丟出去會變成 Error Boundary 的畫面，使用者打的字就沒了').toEqual({ values: valid, fieldErrors: {}, formError: '送出失敗，請再試一次', orderId: null })
  })

  test('上一次的錯誤不會留到這一次', async () => {
    const { action } = setup(async () => ({ id: 82 }))
    const prev: OrderState = { values: { ...valid, phone: '0812' }, fieldErrors: { phone: [PHONE], quantity: [QUANTITY] }, formError: '送出失敗，請再試一次', orderId: null }
    expect(await action(prev, form(valid)), '這次成功：不能沿用 prev 的 fieldErrors、formError（不要寫 { ...prev, orderId }）').toEqual({ values: EMPTY_VALUES, fieldErrors: {}, formError: null, orderId: 82 })
    const again = await action({ ...initialOrderState, orderId: 82 }, form({ ...valid, phone: '' }))
    expect(again.orderId, '這次失敗：上一次的 orderId 不能留著（不然畫面會同時顯示成功和錯誤）').toBeNull()
    expect(again.fieldErrors).toEqual({ phone: [PHONE] })
  })
})
