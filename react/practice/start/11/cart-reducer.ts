// 購物車的 reducer（第 8 課的寫法）。這個檔案不用改
export type CartLine = { productId: number; quantity: number }
export type CartAction =
  | { type: 'add'; productId: number }
  | { type: 'remove'; productId: number }
  | { type: 'clear' }

export function cartReducer(lines: readonly CartLine[], action: CartAction): readonly CartLine[] {
  switch (action.type) {
    case 'add':
      return lines.some(l => l.productId === action.productId)
        ? lines.map(l => (l.productId === action.productId ? { ...l, quantity: l.quantity + 1 } : l))
        : [...lines, { productId: action.productId, quantity: 1 }]
    case 'remove':
      return lines.filter(l => l.productId !== action.productId)
    case 'clear':
      return []
  }
}
