export function lineTotal(price: number, qty: number): number {
  if (!Number.isInteger(qty) || qty <= 0) throw new RangeError(`數量要是正整數：${qty}`)
  return price * qty
}
