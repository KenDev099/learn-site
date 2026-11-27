// 練習 3：GraphQL 伺服器（BFF）呼叫庫存服務
// ✗ 目前沒有 deadline：庫存服務卡住時，整個請求跟著卡住
// ✗ 目前庫存服務一出錯，錯誤就往外丟：菜單整個失敗、下單回 Unexpected error.
// 要做到：
// - 每次呼叫的 timeoutMs = 剩餘預算 − MARGIN_MS，剩餘預算 = ctx.deadline − ctx.now()（一律用 ctx.now，不用 Date.now）
// - timeoutMs 小於 MIN_CALL_MS 就不呼叫：stockFor 回 null、reserveFor 回 { ok: false, failure: 'TIMEOUT' }
// - stockFor 失敗時回 null；reserveFor 逾時（Code.DeadlineExceeded）回 failure 'TIMEOUT'、其他錯誤回 'DOWN'
// - 失敗時用 ctx.logger.error 記下原錯誤
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

export async function stockFor(ctx: Context, productIds: string[]): Promise<Map<string, number> | null> {
  const res = await ctx.inventory.getStock({ productIds })
  return new Map(Object.values(res.levels).map(l => [l.productId, l.available]))
}

export async function reserveFor(ctx: Context, idempotencyKey: string, lines: Line[]): Promise<ReserveOutcome> {
  try {
    await ctx.inventory.reserve({ idempotencyKey, items: lines })
    return { ok: true }
  } catch (e) {
    const err = ConnectError.from(e)
    // 庫存不夠：錯誤細節（error details）裡有 OutOfStockDetail
    const [detail] = err.code === Code.FailedPrecondition ? err.findDetails(OutOfStockDetailSchema) : []
    if (detail) return { ok: false, outOfStock: { productId: detail.productId, available: detail.available } }
    throw err
  }
}
