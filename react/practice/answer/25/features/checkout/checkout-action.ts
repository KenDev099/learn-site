/*
練習 3：結帳的 Action（第 17 課的 useActionState、第 16 課「下單不做樂觀更新」、第 24 課的錯誤分類與回報）
CheckoutPage.tsx 已經寫好：它用 useActionState 呼叫這裡的 Action，送出中停用按鈕、把 state 顯示在欄位旁邊。
驗收條件（createCheckoutAction(deps) 回傳的 Action）：
  1. 驗證沒過：回傳 { ...initialCheckoutState, values: 原文, fieldErrors }，不呼叫 API（這段已經寫好）
  2. 購物車是空的：回傳 formError「購物車是空的」，不呼叫 API。
     React 會把連續的送出排隊依序執行，第一次成功清空購物車後，排在後面的那一次要在這裡停下
  3. 冪等鍵：第一次真的要呼叫 API 時才用 deps.newKey() 產生；
     結果不明的失敗（網路錯誤、5xx）下一次送出沿用同一個鍵；
     伺服器明確拒絕（4xx，含 422）代表訂單沒有建立，下一次換新的鍵；成功之後也換新的
  4. 呼叫 deps.api.createOrder({ name: 去掉空白的姓名, phone, pickupTime, lines: [{ productId, size, sugar, quantity }] }, 鍵)
  5. 成功：deps.cart.clear()，再 deps.onPlaced(訂單編號)，回傳 initialCheckoutState（表單清空）
  6. 失敗時購物車不動、不呼叫 onPlaced，回傳的 state 保留原文（values），而且不要把錯誤丟出去：
     ValidationError（422）→ fieldErrors 用伺服器給的；其他 4xx 的 ApiError → formError 是伺服器的 message，不回報；
     其他（5xx、網路斷線、程式錯誤）→ formError「送出失敗，請再試一次」，並且 deps.reporter.capture(原本的錯誤, { source: 'handler' })
  7. 每次都從 initialCheckoutState 組新的 state，不要沿用 prev
*/
import { z } from 'zod'
import { ApiError, ValidationError, type CartLine, type Reporter, type ShopApi } from '../../shared/api.ts'

export type CheckoutValues = { name: string; phone: string; pickupTime: string }
export type CheckoutState = {
  values: CheckoutValues
  fieldErrors: Partial<Record<string, string[]>>
  formError: string | null
}
export const initialCheckoutState: CheckoutState = {
  values: { name: '', phone: '', pickupTime: '' },
  fieldErrors: {},
  formError: null,
}

export type CheckoutDeps = {
  api: Pick<ShopApi, 'createOrder'>
  cart: { lines: () => CartLine[]; clear: () => void }
  newKey: () => string
  onPlaced: (orderId: number) => void
  reporter: Reporter
}

const FIELDS = ['name', 'phone', 'pickupTime'] as const

export const checkoutSchema = z.object({
  name: z.string().trim().min(1, '請輸入取餐姓名'),
  phone: z.string().regex(/^09\d{8}$/, '手機要是 09 開頭的 10 碼數字'),
  pickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '取餐時間要是 HH:mm'),
})

function readValues(formData: FormData): CheckoutValues {
  const values = { ...initialCheckoutState.values }
  for (const field of FIELDS) {
    const v = formData.get(field)
    values[field] = typeof v === 'string' ? v : ''
  }
  return values
}

export function createCheckoutAction(deps: CheckoutDeps) {
  let key: string | null = null      // 這一次結帳的冪等鍵：跨過好幾次送出，所以放在 Action 外面

  return async function checkoutAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
    const values = readValues(formData)
    const parsed = checkoutSchema.safeParse(values)
    if (!parsed.success) {
      return { ...initialCheckoutState, values, fieldErrors: z.flattenError(parsed.error).fieldErrors }
    }

    const lines = deps.cart.lines()
    if (lines.length === 0) return { ...initialCheckoutState, values, formError: '購物車是空的' }

    key ??= deps.newKey()
    try {
      const { id } = await deps.api.createOrder({
        ...parsed.data,
        lines: lines.map(({ productId, size, sugar, quantity }) => ({ productId, size, sugar, quantity })),
      }, key)
      key = null
      deps.cart.clear()                  // 只在成功之後清空
      deps.onPlaced(id)
      return initialCheckoutState
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        key = null                       // 伺服器明確說沒建立：下一次是新的嘗試
        if (error instanceof ValidationError) return { ...initialCheckoutState, values, fieldErrors: error.fieldErrors }
        return { ...initialCheckoutState, values, formError: error.message }
      }
      deps.reporter.capture(error, { source: 'handler' })   // 結果不明：保留 key，回報原本的錯誤
      return { ...initialCheckoutState, values, formError: '送出失敗，請再試一次' }
    }
  }
}
