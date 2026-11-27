import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { computed, createApp, nextTick, ref } from 'vue'
import { persistPlugin } from './persist-plugin.ts'

// 這題自帶一個簡化的購物車 store，不用先完成練習 1
type Item = { id: number; name: string; price: number; qty: number }
const useCart = defineStore('cart', () => {
  const items = ref<Item[]>([])
  const orderType = ref<'here' | 'togo'>('here')
  const count = computed(() => items.value.reduce((s, i) => s + i.qty, 0))
  function add(item: Item) { items.value.push(item) }
  return { items, orderType, count, add }
})
const useFavorites = defineStore('favorites', () => {
  const items = ref<Item[]>([])
  return { items }
})

const KEY = 'learn-cart'
const LATTE: Item = { id: 2, name: '拿鐵', price: 110, qty: 2 }
const CROISSANT: Item = { id: 5, name: '可頌', price: 70, qty: 1 }

function fakeStorage(saved?: string) {
  const data = new Map<string, string>(saved === undefined ? [] : [[KEY, saved]])
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: vi.fn((k: string, v: string) => { data.set(k, String(v)) }),
    removeItem: vi.fn((k: string) => { data.delete(k) }),
  }
}

let storage: ReturnType<typeof fakeStorage>
function start(saved?: string) {
  storage = fakeStorage(saved)
  const pinia = createPinia().use(persistPlugin({ storage, key: KEY }))
  createApp({}).use(pinia)   // 外掛要等 pinia 裝進 app 才會生效
  setActivePinia(pinia)
}
const stored = () => JSON.parse(storage.data.get(KEY) ?? 'null')

describe('練習 3：persistPlugin', () => {
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })

  test('正常讀回上次的購物車', () => {
    start(JSON.stringify({ version: 1, items: [LATTE, CROISSANT] }))
    const cart = useCart()
    expect(cart.items, '要把 storage 裡的 items 放回 store').toEqual([LATTE, CROISSANT])
    expect(cart.count).toBe(3)
  })

  test('沒有存過：空車，不丟錯', () => {
    start()
    expect(useCart().items).toEqual([])
  })

  const broken: [string, string][] = [
    ['JSON 壞掉', '{"version":1,"items":['],
    ['舊版本格式', JSON.stringify({ version: 0, cart: [LATTE] })],
    ['沒有 version', JSON.stringify({ items: [LATTE] })],
    ['version 是字串 "1"', JSON.stringify({ version: '1', items: [LATTE] })],
    ['items 是 null', JSON.stringify({ version: 1, items: null })],
    ['qty 是字串', JSON.stringify({ version: 1, items: [{ ...LATTE, qty: '3' }] })],
    ['qty 是 0', JSON.stringify({ version: 1, items: [{ ...LATTE, qty: 0 }] })],
    ['qty 超過 20', JSON.stringify({ version: 1, items: [{ ...LATTE, qty: 21 }] })],
    ['qty 是小數', JSON.stringify({ version: 1, items: [{ ...LATTE, qty: 1.5 }] })],
    ['id 是字串', JSON.stringify({ version: 1, items: [{ ...LATTE, id: '2' }] })],
    ['price 是字串', JSON.stringify({ version: 1, items: [{ ...LATTE, price: '110' }] })],
    ['items 是物件不是陣列', JSON.stringify({ version: 1, items: { 0: LATTE, length: 1 } })],
    ['少了 name', JSON.stringify({ version: 1, items: [{ id: 2, price: 110, qty: 1 }] })],
    ['只有一列壞掉', JSON.stringify({ version: 1, items: [LATTE, { ...CROISSANT, qty: -1 }] })],
    ['整份是 null', 'null'],
  ]
  test.each(broken)('%s：刪掉那個 key、從空車開始', (_label, saved) => {
    start(saved)
    let cart!: ReturnType<typeof useCart>
    expect(() => { cart = useCart() }, '讀到壞資料就丟錯，整個 app 會開不起來：JSON.parse 要包 try/catch').not.toThrow()
    expect(cart.items, '不合法的資料不能放進 store：除了 JSON 能不能解析，還要檢查 version 和每一列的格式').toEqual([])
    expect(storage.removeItem, '不合法的資料要 storage.removeItem(key) 刪掉，不然每次開頁面都會再讀到一次').toHaveBeenCalledWith(KEY)
  })

  test('state 變動之後寫入 { version: 1, items }，只存 items', async () => {
    start()
    const cart = useCart()
    cart.add(LATTE)
    cart.orderType = 'togo'
    await nextTick()   // $subscribe 預設在下一個 microtask 才通知
    expect(stored(), '寫入的內容要剛好是 { version: 1, items }：不要存 orderType、getter 或整個 store').toEqual({ version: 1, items: [LATTE] })
    cart.items = []
    await nextTick()
    expect(stored(), '清空之後也要寫入').toEqual({ version: 1, items: [] })
  })

  test('其他 store 不受影響', async () => {
    start(JSON.stringify({ version: 1, items: [LATTE] }))
    const favorites = useFavorites()
    expect(favorites.items, 'favorites store 讀到了購物車的資料：外掛要先檢查 store.$id 是不是 cart').toEqual([])
    favorites.items.push(CROISSANT)
    await nextTick()
    expect(stored(), 'favorites 變動卻寫進了購物車的 key：只處理 $id 是 cart 的 store').toEqual({ version: 1, items: [LATTE] })
    expect(storage.setItem, '不是 cart 的 store 不能寫 storage').not.toHaveBeenCalled()
  })
})
