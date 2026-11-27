export type MenuItem = { name: string, price: number }

export function lineTotal(item: MenuItem, qty: number): number {
  return item.price * qty
}
