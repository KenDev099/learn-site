import { CouponResponse } from '../../../shared/contract.ts'
import { api } from './client.ts'

// CAFE-29：結帳頁輸入優惠碼時先查一次，顯示說明與折數
export async function getCpnInfo(code: string) {
  return CouponResponse.parse(await api<unknown>(`/coupons/${encodeURIComponent(code)}`))
}
