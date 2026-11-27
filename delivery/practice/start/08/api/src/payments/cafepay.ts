import { Injectable } from '@nestjs/common'

// 呼叫 CafePay（金流商）的 client。網址與逾時從環境變數讀（api/.env 的 CAFEPAY_URL、CAFEPAY_TIMEOUT_MS）
export type ChargeResult = { id: string, status: 'succeeded' | 'failed' }
export type LookupResult = { id: string, status: 'succeeded' | 'failed' } | { id: null, status: 'not_found' }

// 結果不明：請求送出去了，但沒拿到明確的答案（逾時、連線中斷、CafePay 回 5xx）
// CafePay 可能根本沒收到，也可能已經扣款了，只是回應在路上丟了。從這裡分不出來
export class CafePayUnknownError extends Error {}

@Injectable()
export class CafePayClient {
  // 扣款。Idempotency-Key 相同的請求，CafePay 只扣一次款，之後都回傳第一次的結果
  async charge(input: { orderId: number, amount: number, cardToken: string }, idempotencyKey: string): Promise<ChargeResult> {
    const res = await this.send('/v1/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    })
    const body = await res.json() as { id: string, status: 'succeeded' | 'failed' }
    if (res.status === 402) return { id: body.id, status: 'failed' }   // 卡片被拒絕：確定沒有扣款
    if (!res.ok) throw new Error(`CafePay 拒絕了這個請求：${res.status} ${JSON.stringify(body)}`)   // 4xx：我們送錯了，CafePay 沒有處理
    return { id: body.id, status: body.status }
  }

  // 查詢某張訂單的付款（補單用）
  async findByOrder(orderId: number): Promise<LookupResult> {
    const res = await this.send(`/v1/payments?orderId=${orderId}`, { method: 'GET' })
    if (res.status === 404) return { id: null, status: 'not_found' }
    if (!res.ok) throw new Error(`CafePay 查詢失敗：${res.status}`)
    const body = await res.json() as { id: string, status: 'succeeded' | 'failed' }
    return { id: body.id, status: body.status }
  }

  private async send(path: string, init: RequestInit) {
    const base = process.env.CAFEPAY_URL ?? 'http://localhost:3190'
    const timeoutMs = Number(process.env.CAFEPAY_TIMEOUT_MS ?? 5000)
    let res: Response
    try {
      // 等太久就放棄：AbortSignal.timeout 到時間會讓 fetch 丟出 TimeoutError
      res = await fetch(base + path, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (e) {
      throw new CafePayUnknownError(`CafePay 沒有回應（${(e as Error).name}）`, { cause: e })
    }
    if (res.status >= 500) throw new CafePayUnknownError(`CafePay 回 ${res.status}`)
    return res
  }
}
