import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import ProductCard from './ProductCard.vue'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

const frozen = (id: number) => deepFreeze(structuredClone(PRODUCTS.find(p => p.id === id)!)) as Product

describe('練習 1：ProductCard 用 props 接收商品、用 emit 通知加入', () => {
  test('顯示傳進來的商品：拿鐵 $110、可頌 $70', () => {
    for (const [id, text] of [[2, '拿鐵 $110'], [5, '可頌 $70']] as const) {
      const wrapper = mount(ProductCard, { props: { product: frozen(id) } })
      expect(wrapper.get('h3').text(), `<h3> 要顯示「${text}」：用 product.name 與 product.price，不要寫死`).toBe(text)
      wrapper.unmount()
    }
  })

  test('按「加入」emit add，payload 是商品 id', async () => {
    for (const id of [2, 5]) {
      const wrapper = mount(ProductCard, { props: { product: frozen(id) } })
      await wrapper.get('button').trigger('click')
      expect(wrapper.emitted('add'), `按一次「加入」要 emit('add', ${id})：事件名稱是 add，payload 是 product.id（不要改 props.product，它是凍結的）`).toEqual([[id]])
      wrapper.unmount()
    }
  })

  test('add 要用 defineEmits 宣告', () => {
    const emits = (ProductCard as { emits?: unknown }).emits
    const names = Array.isArray(emits) ? emits : Object.keys(emits ?? {})
    expect(names, '用 defineEmits<{ add: [productId: number] }>() 宣告事件：宣告過的事件才不會被當成屬性透傳，也讓別人看得出這個元件會發出什麼').toContain('add')
  })

  test('沒有傳 soldOut 時按鈕可以按', () => {
    const wrapper = mount(ProductCard, { props: { product: frozen(2) } })
    expect(wrapper.get('button').attributes('disabled'), 'soldOut 預設要是 false，按鈕不能 disabled').toBeUndefined()
  })

  test('售完時按鈕 disabled，按了也不 emit', async () => {
    const wrapper = mount(ProductCard, { props: { product: frozen(2), soldOut: true } })
    const button = wrapper.get('button')
    expect(button.attributes('disabled'), 'soldOut 為 true 時按鈕要加上 disabled').toBeDefined()
    ;(button.element as HTMLButtonElement).removeAttribute('disabled')   // 就算有人用開發者工具拿掉 disabled
    await button.trigger('click')
    expect(wrapper.emitted('add'), '售完時不能 emit add：在處理函式裡也要檢查 soldOut').toBeUndefined()
  })
})
