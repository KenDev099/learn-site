// 練習 1：購物車 store（cart 的內部檔案，不用改）
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Product } from '../api/menu-api.ts'

export type CartItem = { id: number; name: string; price: number; qty: number }

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([])
  const count = computed(() => items.value.reduce((sum, i) => sum + i.qty, 0))
  const subtotal = computed(() => items.value.reduce((sum, i) => sum + i.price * i.qty, 0))

  function add(product: Pick<Product, 'id' | 'name' | 'price'>) {
    const line = items.value.find(i => i.id === product.id)
    if (line) line.qty++
    else items.value.push({ id: product.id, name: product.name, price: product.price, qty: 1 })
  }

  return { items, count, subtotal, add }
})
