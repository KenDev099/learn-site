import { describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CartLine, { type CartItem } from './CartLine.vue'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

const line = (quantity: number, productId = 2): CartItem =>
  deepFreeze({ productId, name: productId === 2 ? '拿鐵' : '伯爵紅茶', price: productId === 2 ? 110 : 90, quantity })

function setup(quantity: number, productId = 2) {
  const onChangeQuantity = vi.fn()
  const onRemove = vi.fn()
  const wrapper = mount(CartLine, { props: { line: line(quantity, productId), onChangeQuantity, onRemove } })
  return { wrapper, onChangeQuantity, onRemove }
}

describe('練習 2：CartLine 不改 props，用 emit 請父元件修改', () => {
  test('按 + 要 emit changeQuantity(productId, quantity + 1)', async () => {
    const { wrapper, onChangeQuantity, onRemove } = setup(3)
    await wrapper.get('button.inc').trigger('click')
    expect(onChangeQuantity.mock.calls, '按 + 要 emit changeQuantity(2, 4)：不能直接改 props.line.quantity（它是凍結的），要發事件給父元件').toEqual([[2, 4]])
    expect(onRemove).not.toHaveBeenCalled()
    expect(wrapper.get('.qty').text(), '子元件不能自己改數量：要等父元件更新 props').toBe('3')
  })

  test('按 − 要 emit changeQuantity(productId, quantity - 1)', async () => {
    const { wrapper, onChangeQuantity } = setup(2)
    await wrapper.get('button.dec').trigger('click')
    expect(onChangeQuantity.mock.calls, '數量 2 按 − 要 emit changeQuantity(2, 1)').toEqual([[2, 1]])
  })

  test('別的商品也要帶自己的 productId', async () => {
    const { wrapper, onChangeQuantity, onRemove } = setup(1, 4)
    await wrapper.get('button.inc').trigger('click')
    await wrapper.get('button.dec').trigger('click')
    expect(onChangeQuantity.mock.calls, '伯爵紅茶（productId 4）數量 1 按 + 要 emit changeQuantity(4, 2)：id 要用 props.line.productId，不要寫死').toEqual([[4, 2]])
    expect(onRemove.mock.calls, '伯爵紅茶（productId 4）數量 1 按 − 要 emit remove(4)').toEqual([[4]])
  })

  test('changeQuantity 與 remove 要用 defineEmits 宣告', () => {
    const emits = (CartLine as { emits?: unknown }).emits
    const names = Array.isArray(emits) ? emits : Object.keys(emits ?? {})
    expect(names, '用 defineEmits<{ changeQuantity: [productId: number, quantity: number]; remove: [productId: number] }>() 宣告兩個事件：沒宣告的監聽器會被當成屬性透傳到根元素').toEqual(expect.arrayContaining(['changeQuantity', 'remove']))
  })

  test('數量 1 再按 − 要 emit remove，不能 emit changeQuantity(…, 0)', async () => {
    const { wrapper, onChangeQuantity, onRemove } = setup(1)
    await wrapper.get('button.dec').trigger('click')
    expect(onRemove.mock.calls, '數量 1 按 − 要 emit remove(2)').toEqual([[2]])
    expect(onChangeQuantity, '數量 1 按 − 不能 emit changeQuantity（數量 0 的品項不該留在購物車）').not.toHaveBeenCalled()
  })

  test('數量 20 再按 + 什麼都不 emit', async () => {
    const { wrapper, onChangeQuantity, onRemove } = setup(20)
    const button = wrapper.get('button.inc')
    ;(button.element as HTMLButtonElement).removeAttribute('disabled')
    await button.trigger('click')
    expect(onChangeQuantity, '數量上限是 20：已經 20 時按 + 不能 emit（處理函式裡也要檢查）').not.toHaveBeenCalled()
    expect(onRemove).not.toHaveBeenCalled()
  })

  test('父元件依事件更新 props，連按 + 停在 20', async () => {
    const { wrapper, onChangeQuantity } = setup(18)
    onChangeQuantity.mockImplementation((_id: number, q: number) => wrapper.setProps({ line: line(q) }))
    for (let i = 0; i < 4; i++) await wrapper.get('button.inc').trigger('click')
    expect(onChangeQuantity.mock.calls, '從 18 連按 4 次 +，應該只 emit (2, 19)、(2, 20)').toEqual([[2, 19], [2, 20]])
    expect(wrapper.get('.qty').text()).toBe('20')
  })

  test('父元件從外面改了數量，畫面與下一次 emit 都要用新的數量', async () => {
    const { wrapper, onChangeQuantity } = setup(3)
    await wrapper.setProps({ line: line(7) })
    expect(wrapper.get('.qty').text(), '.qty 要顯示 props.line.quantity：不要把它複製成本地的 ref，複製之後就不會跟著父元件更新').toBe('7')
    await wrapper.get('button.inc').trigger('click')
    expect(onChangeQuantity.mock.calls, '數量已經變成 7，按 + 要 emit (2, 8)：每次都從 props.line.quantity 計算').toEqual([[2, 8]])
  })
})
