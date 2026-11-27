// 咖啡店的菜單（價格是新台幣整數元）。練習 3 的 resolver 從這裡讀資料；測試會換掉陣列裡的內容
export type Category = 'COFFEE' | 'TEA' | 'FOOD'
export type Product = { id: string, name: string, price: number, category: Category, description: string | null }

export const menu: Product[] = [
  { id: '1', name: '美式咖啡', price: 80, category: 'COFFEE', description: '每天現烘的中焙豆' },
  { id: '2', name: '拿鐵', price: 110, category: 'COFFEE', description: '濃縮咖啡加鮮奶' },
  { id: '3', name: '卡布奇諾', price: 110, category: 'COFFEE', description: null },
  { id: '4', name: '伯爵紅茶', price: 90, category: 'TEA', description: '佛手柑香氣的紅茶' },
  { id: '5', name: '可頌', price: 70, category: 'FOOD', description: null },
  { id: '6', name: '起司蛋糕', price: 120, category: 'FOOD', description: '重乳酪' },
]
