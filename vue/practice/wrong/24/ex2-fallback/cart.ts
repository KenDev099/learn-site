// 錯誤：拿不到 provide 時默默給一台空購物車，忘了 provide 也不會發現
import { inject, reactive, type InjectionKey } from 'vue'

export interface Cart {
  owner: string
  items: string[]
}

export const CART_KEY: InjectionKey<Cart> = Symbol('cart')

export function useCart(): Cart {
  return inject(CART_KEY) ?? reactive({ owner: '', items: [] })
}
