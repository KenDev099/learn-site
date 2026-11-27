/*
練習 3：外帶訂單的 Action：用 zod 在 Action 裡驗證，回傳欄位錯誤
這個檔案不 import React：Action 就是一個 async 函式 (prev, formData) => 新的 state，可以單獨測試，
寫法跟伺服器端的處理函式一樣（React 的 Server Function 也長這樣）。型別在 order-types.ts。
問題：現在直接把 Object.fromEntries(formData) 送給伺服器：沒有驗證、數量是字串、伺服器拒絕就整個丟錯。
要求：
  1. 用 zod 寫 orderSchema 並 export（z.object），訊息照下面寫：
     - name：去掉頭尾空白後不能是空的 → '請輸入姓名'（送給伺服器的是去掉空白後的姓名）
     - phone：09 開頭的 10 碼數字 → '手機要是 09 開頭的 10 碼數字'
     - quantity：轉成數字，要是 1～20 的整數（包含空的、不是數字、0、21、2.5 都不行）→ '數量要是 1～20 的整數'
       （送給伺服器的是 number）
     - pickupTime：HH:mm，00:00～23:59，小時要兩位數 → '取餐時間要是 HH:mm'
  2. 從 formData 讀出四個欄位的原文（缺少的欄位當成 ''），用 orderSchema.safeParse 驗證
     - 沒過：不呼叫伺服器，回傳 { values: 這次的原文, fieldErrors: 每個欄位的錯誤（z.flattenError）, formError: null, orderId: null }
       一次回傳所有欄位的錯誤；values 是原文（不要 trim），表單才能原樣放回去
     - 過了：await api.placeOrder(parsed.data)，成功回傳 { ...initialOrderState, orderId: 訂單編號 }
  3. placeOrder 丟出 ServerValidationError：回傳它的 fieldErrors，values 保留原文
     其他錯誤（網路）：回傳 formError '送出失敗，請再試一次'，values 保留原文
     兩種都不要再丟出去（丟出去會變成 Error Boundary 的畫面，使用者打的字就沒了）
  4. 新的 state 只由這一次的結果決定：上一次的錯誤（prev）不能留到這一次
*/
import { z } from 'zod'
import { initialOrderState, type OrderApi, type OrderInput, type OrderState } from './order-types.ts'

export const orderSchema = z.object({})

export function createOrderAction(api: OrderApi) {
  return async function orderAction(_prev: OrderState, formData: FormData): Promise<OrderState> {
    const { id } = await api.placeOrder(Object.fromEntries(formData) as unknown as OrderInput)
    return { ...initialOrderState, orderId: id }
  }
}
