import { formatPrice } from 'lib/price.ts'

export const menu = [
  { name: '美式咖啡', price: 80 },
  { name: '拿鐵', price: 110 },
  { name: '可頌', price: 70 },
]

export function menuLines() {
  return menu.map(item => `${item.name} ${formatPrice(item.price)}`)
}
