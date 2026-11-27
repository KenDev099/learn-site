import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Product } from '../api/products.ts'

export const useCartStore = defineStore('cart', () => {
  const lines = ref<{ product: Product; quantity: number }[]>([])
  const count = computed(() => lines.value.reduce((n, l) => n + l.quantity, 0))
  const total = computed(() => lines.value.reduce((sum, l) => sum + l.product.price * l.quantity, 0))

  function add(product: Product) {
    const line = lines.value.find(l => l.product.id === product.id)
    if (line) line.quantity++
    else lines.value.push({ product, quantity: 1 })
  }
  function remove(productId: number) {
    lines.value = lines.value.filter(l => l.product.id !== productId)
  }
  function clear() {
    lines.value = []
  }
  return { lines, count, total, add, remove, clear }
})
