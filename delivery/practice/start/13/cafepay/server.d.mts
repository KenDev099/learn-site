// cafepay/server.mjs 的型別：讓 api/src 底下的 spec 可以 import 假 CafePay（tsc 型別檢查要用到）
export type FakeCafePay = {
  url: string
  charges: { id: string, orderId: number, amount: number, status: string, version: 'v1' | 'v2' }[]
  requests: { key: string, body: { orderId: number, amount: number, cardToken: string }, version: 'v1' | 'v2' }[]
  refunds: { id: string, paymentId: string, amount: number, key: string }[]   // amount 是元
  refundRequests: { key: string, body: { paymentId: string, amount: number } }[]
  lookups: number[]
  faults: { timeoutAfterCharge: number, timeoutAfterRefund: number, dropWebhooks: number, duplicateWebhooks: number }
  close(): Promise<void>
}

export function signWebhook(rawBody: string, secret: string, t?: number): string

export function startCafePay(options?: {
  port?: number
  webhookUrl?: string | null
  webhookSecret?: string
  webhookDelayMs?: number
  log?: boolean
}): Promise<FakeCafePay>
