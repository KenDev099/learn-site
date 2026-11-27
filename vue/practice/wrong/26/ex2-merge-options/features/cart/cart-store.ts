// 練習 2-1：購物車 store（features/cart，setup store，第 15 課）
// 問題：同一杯拿鐵，一杯正常甜、一杯無糖，起始版把它們合併成「拿鐵 ×2」，店員就只做了正常甜。
// 要求：
//   1. 每一列用 lineKey(productId, { size, sugar }) 當作 key：同商品、同大小、同甜度才算同一列
//      key 的格式是 `${productId}-${size}-${sugar}`，例如 "2-L-less"
//   2. add(product, { size, sugar })：同一列已經存在就 qty 加一（上限 20），否則新增一列，qty 從 1 開始
//      unitPrice = 商品價格 + 大杯加價（M 加 0、L 加 20）
//   3. changeQty(key, qty)：qty ≤ 0 移除那一列，超過 20 當成 20；clear() 清空
//   4. getter：count 是 qty 的總和，total 是 unitPrice × qty 的總和
//   5. state（lines）要放進 return，Pinia 的外掛（練習 2-4 的持久化）才看得到
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { OrderLine, Product, Size, Sugar } from '../../shared/api.ts'

export type CartOptions = { size: Size; sugar: Sugar }
export type CartLine = OrderLine & { key: string }

const MAX_QTY = 20
const SIZE_EXTRA: Record<Size, number> = { M: 0, L: 20 }

export function lineKey(productId: number, _options: CartOptions): string {
  return String(productId)
}

export const useCartStore = defineStore('cart', () => {
  const lines = ref<CartLine[]>([])

  const count = computed(() => lines.value.reduce((sum, l) => sum + l.qty, 0))
  const total = computed(() => lines.value.reduce((sum, l) => sum + l.unitPrice * l.qty, 0))

  function add(product: Pick<Product, 'id' | 'name' | 'price'>, options: CartOptions) {
    const line = lines.value.find(l => l.productId === product.id)
    if (line) {
      line.qty = Math.min(MAX_QTY, line.qty + 1)
      return
    }
    lines.value.push({
      key: lineKey(product.id, options),
      productId: product.id,
      name: product.name,
      size: options.size,
      sugar: options.sugar,
      unitPrice: product.price + SIZE_EXTRA[options.size],
      qty: 1,
    })
  }
  function changeQty(key: string, qty: number) {
    if (qty <= 0) {
      lines.value = lines.value.filter(l => l.key !== key)
      return
    }
    const line = lines.value.find(l => l.key === key)
    if (line) line.qty = Math.min(MAX_QTY, qty)
  }
  function clear() {
    lines.value = []
  }

  return { lines, count, total, add, changeQty, clear }
})
