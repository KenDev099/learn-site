// 失敗時沒有回傳 values：表單重設後使用者打的字全部不見
import { z } from 'zod'
import {
  FIELDS, initialOrderState, ServerValidationError,
  type OrderApi, type OrderState, type OrderValues,
} from './order-types.ts'

const QUANTITY = '數量要是 1～20 的整數'

export const orderSchema = z.object({
  name: z.string().trim().min(1, '請輸入姓名'),
  phone: z.string().regex(/^09\d{8}$/, '手機要是 09 開頭的 10 碼數字'),
  // FormData 給的是字串：coerce 先轉數字（'' 會變成 0、'abc' 會變成 NaN，都會被下面擋下）
  quantity: z.coerce.number({ error: QUANTITY }).int(QUANTITY).min(1, QUANTITY).max(20, QUANTITY),
  pickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '取餐時間要是 HH:mm'),
})

function readValues(formData: FormData): OrderValues {
  const values = { ...initialOrderState.values }
  for (const field of FIELDS) {
    const v = formData.get(field)
    values[field] = typeof v === 'string' ? v : ''
  }
  return values
}

export function createOrderAction(api: OrderApi) {
  return async function orderAction(_prev: OrderState, formData: FormData): Promise<OrderState> {
    const values = readValues(formData)
    const parsed = orderSchema.safeParse(values)
    if (!parsed.success) {
      return { ...initialOrderState, fieldErrors: z.flattenError(parsed.error).fieldErrors }
    }
    try {
      const { id } = await api.placeOrder(parsed.data)
      return { ...initialOrderState, orderId: id }
    } catch (error) {
      if (error instanceof ServerValidationError) {
        return { ...initialOrderState, values, fieldErrors: error.fieldErrors }
      }
      return { ...initialOrderState, values, formError: '送出失敗，請再試一次' }
    }
  }
}
