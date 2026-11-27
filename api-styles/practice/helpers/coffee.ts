// 咖啡店的共用資料（和 coffee.sql、AUTHORING.md 一致）與固定種子的亂數：測試用它產生「每次都一樣、但寫死答案不會過」的資料
export type Category = 'COFFEE' | 'TEA' | 'FOOD'
export type Product = { id: string, name: string, price: number, category: Category, description: string | null }
export type Customer = { id: string, name: string }

export const PRODUCTS: Product[] = [
  { id: '1', name: '美式咖啡', price: 80, category: 'COFFEE', description: '每天現烘的中焙豆' },
  { id: '2', name: '拿鐵', price: 110, category: 'COFFEE', description: '濃縮咖啡加鮮奶' },
  { id: '3', name: '卡布奇諾', price: 110, category: 'COFFEE', description: null },
  { id: '4', name: '伯爵紅茶', price: 90, category: 'TEA', description: '佛手柑香氣的紅茶' },
  { id: '5', name: '可頌', price: 70, category: 'FOOD', description: null },
  { id: '6', name: '起司蛋糕', price: 120, category: 'FOOD', description: '重乳酪' },
]

export const CUSTOMERS: Customer[] = ['王小明', '陳美華', '林志豪', '張雅婷', '李建國', '黃淑芬'].map((name, i) => ({ id: String(i + 1), name }))

// mulberry32：給同一個種子，每次產生同一串 0–1 的亂數
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 打亂順序（不改原陣列）
export function shuffle<T>(list: T[], random: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
