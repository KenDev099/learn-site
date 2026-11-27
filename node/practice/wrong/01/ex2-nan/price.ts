export function lineTotal(price: number, qty: number): number {
  if (!Number.isInteger(qty) || qty <= 0) return NaN
  return price * qty
}
