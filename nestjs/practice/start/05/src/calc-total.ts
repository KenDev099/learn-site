// 結帳金額：每一行是「(單價 + 尺寸加價) × 數量」，全部加總；會員打九五折，四捨五入到整數元
export type Size = 'S' | 'M' | 'L'
export type OrderLine = { name: string; price: number; size: Size; quantity: number }

export const SIZE_UPCHARGE: Record<Size, number> = { S: 0, M: 10, L: 20 }

export function calcTotal(lines: OrderLine[], member: boolean): number {
  const subtotal = lines.reduce((sum, line) => sum + (line.price + SIZE_UPCHARGE[line.size]) * line.quantity, 0)
  return member ? Math.round((subtotal * 95) / 100) : subtotal
}
