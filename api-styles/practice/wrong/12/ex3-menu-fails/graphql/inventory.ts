// 練習 3：GraphQL 伺服器（BFF）呼叫庫存服務。規則：
// - 每次呼叫的 deadline = 剩餘預算 − MARGIN_MS（留時間給之後寫資料庫、回應）；剩餘預算 = ctx.deadline − ctx.now()
// - 剩餘預算不到 MIN_CALL_MS 就不呼叫，直接當成逾時
// - 庫存服務失敗時不讓整個請求失敗：stockFor 回 null（菜單照常顯示）；reserveFor 回 { failure }
import { Code, ConnectError } from '@connectrpc/connect'
import { OutOfStockDetailSchema } from '../gen/coffee/inventory/v1/inventory_pb.js'
import type { Context } from './context.ts'

export const MARGIN_MS = 20
export const MIN_CALL_MS = 20

export type Line = { productId: string, quantity: number }
export type ReserveOutcome =
  | { ok: true }
  | { ok: false, outOfStock: { productId: string, available: number } }
  | { ok: false, failure: 'TIMEOUT' | 'DOWN' }

// 這次呼叫可以用幾毫秒；不夠就回 null
function callBudget(ctx: Context): number | null {
  const timeoutMs = ctx.deadline - ctx.now() - MARGIN_MS
  return timeoutMs < MIN_CALL_MS ? null : timeoutMs
}

const failureOf = (err: ConnectError): 'TIMEOUT' | 'DOWN' => err.code === Code.DeadlineExceeded ? 'TIMEOUT' : 'DOWN'

export async function stockFor(ctx: Context, productIds: string[]): Promise<Map<string, number> | null> {
  const timeoutMs = callBudget(ctx)
  if (timeoutMs === null) return null
  try {
    const res = await ctx.inventory.getStock({ productIds }, { timeoutMs })
    return new Map(Object.values(res.levels).map(l => [l.productId, l.available]))
  } catch (err) {
    throw err   // ✗ 庫存服務一出錯，整個菜單跟著失敗
  }
}

export async function reserveFor(ctx: Context, idempotencyKey: string, lines: Line[]): Promise<ReserveOutcome> {
  const timeoutMs = callBudget(ctx)
  if (timeoutMs === null) return { ok: false, failure: 'TIMEOUT' }
  try {
    await ctx.inventory.reserve({ idempotencyKey, items: lines }, { timeoutMs })
    return { ok: true }
  } catch (e) {
    const err = ConnectError.from(e)
    if (err.code === Code.FailedPrecondition) {
      const [detail] = err.findDetails(OutOfStockDetailSchema)
      if (detail) return { ok: false, outOfStock: { productId: detail.productId, available: detail.available } }
    }
    ctx.logger.error(err)
    return { ok: false, failure: failureOf(err) }
  }
}
