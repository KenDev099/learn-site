import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { createTestingPinia } from '@pinia/testing'
import { createApp, nextTick, ref } from 'vue'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import type { Product } from './shared/api.ts'
import { lineKey, useCartStore, type CartLine } from './features/cart/cart-store.ts'
import AddToCart from './features/cart/AddToCart.vue'
import ProductOptions from './features/cart/ProductOptions.vue'
import CartBadge from './features/cart/CartBadge.vue'
import { persistCart, type KeyValueStorage } from './features/cart/persist-plugin.ts'

const LATTE = PRODUCTS[1] as Product          // 拿鐵 110
const CROISSANT = PRODUCTS[4] as Product      // 可頌 70

describe('練習 2：購物車', () => {
  describe('2-1 store', () => {
    beforeEach(() => { setActivePinia(createPinia()) })

    test('同商品不同甜度是兩列，完全相同才合併', () => {
      const cart = useCartStore()
      cart.add(LATTE, { size: 'M', sugar: 'normal' })
      cart.add(LATTE, { size: 'M', sugar: 'none' })
      cart.add(LATTE, { size: 'M', sugar: 'none' })
      cart.add(LATTE, { size: 'L', sugar: 'none' })
      expect(cart.lines.map(l => [l.key, l.qty]), '同商品、同大小、同甜度才是同一列；選項不同要分開，不然店員只會做一種').toEqual([
        ['2-M-normal', 1], ['2-M-none', 2], ['2-L-none', 1],
      ])
      expect(lineKey(5, { size: 'L', sugar: 'less' })).toBe('5-L-less')
    })

    test('大杯加 20 元；count、total 正確；changeQty 與 clear', () => {
      const cart = useCartStore()
      cart.add(LATTE, { size: 'L', sugar: 'less' })
      cart.add(CROISSANT, { size: 'M', sugar: 'normal' })
      cart.add(CROISSANT, { size: 'M', sugar: 'normal' })
      expect(cart.lines[0].unitPrice, '大杯的單價是商品價格 + 20').toBe(130)
      expect(cart.count).toBe(3)
      expect(cart.total).toBe(130 + 70 * 2)
      cart.changeQty('5-M-normal', 99)
      expect(cart.lines[1].qty, '數量上限 20').toBe(20)
      cart.changeQty('2-L-less', 0)
      expect(cart.lines.map(l => l.key), 'qty ≤ 0 要移除那一列').toEqual(['5-M-normal'])
      cart.clear()
      expect(cart.count).toBe(0)
    })
  })

  describe('2-2 ProductOptions（v-model:size、v-model:sugar）', () => {
    test('選了大杯、微糖，加進購物車的就是大杯、微糖', async () => {
      const wrapper = mount(AddToCart, {
        props: { product: LATTE },
        global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
      })
      const cart = useCartStore()
      await wrapper.find('input[name="size"][value="L"]').setValue(true)
      await wrapper.find('input[name="sugar"][value="less"]').setValue(true)
      await wrapper.find('button.add').trigger('click')
      expect(cart.add, 'ProductOptions 要用 defineModel 回報選項，AddToCart 才拿得到').toHaveBeenCalledWith(LATTE, { size: 'L', sugar: 'less' })
    })

    test('勾選狀態跟著 model；每個 radio 有 label，每組有 fieldset 與 legend', async () => {
      const size = ref<'M' | 'L'>('L')
      const wrapper = mount(ProductOptions, {
        props: { size: size.value, sugar: 'none', 'onUpdate:size': (v: 'M' | 'L') => { size.value = v } },
      })
      expect((wrapper.find('input[name="size"][value="L"]').element as HTMLInputElement).checked, 'model 是 L 時大杯要是勾選的').toBe(true)
      expect((wrapper.find('input[name="sugar"][value="none"]').element as HTMLInputElement).checked).toBe(true)
      await wrapper.setProps({ size: 'M' })
      expect((wrapper.find('input[name="size"][value="M"]').element as HTMLInputElement).checked, '父元件改了 model，勾選要跟著變').toBe(true)
      await wrapper.find('input[name="size"][value="L"]').setValue(true)
      expect(wrapper.emitted('update:size')?.at(-1), '點選時要發出 update:size').toEqual(['L'])
      expect(wrapper.findAll('fieldset').map(f => f.find('legend').text()), '每組 radio 包在 fieldset 裡，legend 寫「大小」「甜度」').toEqual(['大小', '甜度'])
      for (const input of wrapper.findAll('input[type="radio"]')) {
        expect(input.element.closest('label'), '每個 radio 都要包在 <label> 裡').not.toBeNull()
      }
    })
  })

  describe('2-3 CartBadge', () => {
    test('購物車變動時徽章跟著更新；清空呼叫 clear()', async () => {
      const wrapper = mount(CartBadge, { global: { plugins: [createTestingPinia({ createSpy: vi.fn })] } })
      const cart = useCartStore()
      expect(wrapper.find('.cart-badge').text()).toBe('購物車 0 件，共 0 元')
      const line: CartLine = { key: '2-M-none', productId: 2, name: '拿鐵', size: 'M', sugar: 'none', unitPrice: 110, qty: 2 }
      cart.$patch({ lines: [line] })
      await nextTick()
      expect(wrapper.find('.cart-badge').text(), '直接解構 store 會失去響應：用 storeToRefs 取出 count、total').toBe('購物車 2 件，共 220 元')
      await wrapper.find('button').trigger('click')
      expect(cart.clear).toHaveBeenCalledTimes(1)
    })
  })

  describe('2-4 persistCart', () => {
    function memoryStorage(initial: Record<string, string> = {}) {
      const data = new Map(Object.entries(initial))
      return {
        data,
        getItem: vi.fn((k: string) => data.get(k) ?? null),
        setItem: vi.fn((k: string, v: string) => { data.set(k, v) }),
        removeItem: vi.fn((k: string) => { data.delete(k) }),
      } satisfies KeyValueStorage & { data: Map<string, string> }
    }
    function start(storage: KeyValueStorage) {
      const pinia = createPinia()
      pinia.use(persistCart({ storage, key: 'cart:v1' }))
      createApp({}).use(pinia)   // 外掛要在 pinia 裝進 app 之後才會套用
      setActivePinia(pinia)
      return useCartStore()
    }
    const GOOD: CartLine = { key: '2-L-less', productId: 2, name: '拿鐵', size: 'L', sugar: 'less', unitPrice: 130, qty: 2 }

    test('合法的資料讀回來；之後的變動寫回 storage', async () => {
      const storage = memoryStorage({ 'cart:v1': JSON.stringify({ version: 1, lines: [GOOD] }) })
      const cart = start(storage)
      expect(cart.lines, '合法的資料要放回 store').toEqual([GOOD])
      cart.add(CROISSANT, { size: 'M', sugar: 'normal' })
      await nextTick()
      const saved = JSON.parse(storage.data.get('cart:v1')!)
      expect(saved.version).toBe(1)
      expect(saved.lines.map((l: CartLine) => l.key), 'state 變動後要寫入 { version: 1, lines }').toEqual(['2-L-less', '5-M-normal'])
    })

    test.each([
      ['壞掉的 JSON', '{"version":1,"lines":['],
      ['舊版格式（沒有 version）', JSON.stringify({ items: [{ id: 2, qty: 1 }] })],
      ['列的資料不合法（qty 是 0、沒有 unitPrice）', JSON.stringify({ version: 1, lines: [{ ...GOOD, qty: 0, unitPrice: undefined }] })],
    ])('%s：不當機、從空車開始、刪掉壞資料', (_name, raw) => {
      const storage = memoryStorage({ 'cart:v1': raw })
      let cart: ReturnType<typeof useCartStore> | undefined
      expect(() => { cart = start(storage) }, 'storage 的資料是外部資料：JSON.parse 要包 try/catch，格式也要驗證').not.toThrow()
      expect(cart!.lines, '不合法的資料不能放進 store').toEqual([])
      expect(storage.removeItem, '要 removeItem 刪掉壞資料').toHaveBeenCalledWith('cart:v1')
    })

    test('只處理 cart store', () => {
      const storage = memoryStorage({ 'cart:v1': JSON.stringify({ version: 1, lines: [GOOD] }) })
      start(storage)
      const useOther = defineStore('other', () => ({ lines: ref(['不是購物車']) }))
      const other = useOther()
      expect(other.lines, '外掛只能處理 $id 是 cart 的 store').toEqual(['不是購物車'])
    })
  })
})
