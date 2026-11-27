// 咖啡店的菜單（和其他課的資料一致），多了英文品名給練習 2 用
export type MenuItem = { id: number, name: string, nameEn: string, price: number }

export const MENU: MenuItem[] = [
  { id: 1, name: '美式咖啡', nameEn: 'Americano', price: 80 },
  { id: 2, name: '拿鐵', nameEn: 'Latte', price: 110 },
  { id: 3, name: '卡布奇諾', nameEn: 'Cappuccino', price: 110 },
  { id: 4, name: '伯爵紅茶', nameEn: 'Earl Grey Tea', price: 90 },
  { id: 5, name: '可頌', nameEn: 'Croissant', price: 70 },
  { id: 6, name: '起司蛋糕', nameEn: 'Cheesecake', price: 120 },
]
