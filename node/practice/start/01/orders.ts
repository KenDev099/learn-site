// 這張訂單的內容（測試會換成別的訂單，所以 receipt.ts 不能把結果寫死）
export type OrderLine = { name: string, price: number, qty: number }

export const orders: OrderLine[] = [
  { name: '拿鐵', price: 110, qty: 2 },
  { name: '美式咖啡', price: 80, qty: 1 },
]
