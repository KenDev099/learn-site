// 錯誤：每個請求有自己的購物車，但元件讀的是模組層級的「目前購物車」
import type { InjectionKey } from 'vue'

export interface Cart {
  owner: string
  items: string[]
}

export const CART_KEY: InjectionKey<Cart> = Symbol('cart')

let current: Cart | undefined

export function setCurrentCart(cart: Cart) {
  current = cart
}

export function useCart(): Cart {
  if (!current) throw new Error('找不到購物車')
  return current
}
