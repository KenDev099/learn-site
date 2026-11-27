import { describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseButton from './BaseButton.vue'

function setup() {
  const onClick = vi.fn()
  const wrapper = mount(BaseButton, {
    props: { text: '結帳' },
    attrs: { class: 'primary', 'aria-label': '結帳，共 3 項', 'data-track': 'checkout', onClick },
  })
  return { wrapper, onClick, span: wrapper.get('span.wrap'), button: wrapper.get('button') }
}

describe('練習 4：BaseButton 把透傳的屬性放到 <button>', () => {
  test('aria-label 與 class 落在 <button> 上', () => {
    const { button } = setup()
    expect(button.attributes('aria-label'), '<button> 上沒有 aria-label：用 defineOptions({ inheritAttrs: false })，再在 <button> 上寫 v-bind="$attrs"').toBe('結帳，共 3 項')
    expect(button.classes(), '父元件傳的 class="primary" 要在 <button> 上').toContain('primary')
    expect(button.text()).toBe('結帳')
  })

  test('其他沒宣告的屬性也全部落在 <button> 上', () => {
    const { button, span } = setup()
    expect(button.attributes('data-track'), '父元件傳的 data-track="checkout" 不在 <button> 上：不要一個一個挑屬性，用 v-bind="$attrs" 把全部透傳屬性放上去').toBe('checkout')
    expect(span.attributes('data-track'), '<span> 不該有 data-track').toBeUndefined()
  })

  test('外框 <span> 不能拿到透傳的屬性', () => {
    const { span } = setup()
    expect(span.attributes('aria-label'), '<span> 不該有 aria-label：預設的屬性透傳會加到根元素，要用 inheritAttrs: false 關掉').toBeUndefined()
    expect(span.classes(), '<span> 只保留自己的 class="wrap"').toEqual(['wrap'])
  })

  test('點一次按鈕，父元件的 click 監聽器只被呼叫一次', async () => {
    const { button, onClick } = setup()
    await button.trigger('click')
    expect(onClick, 'onClick 被呼叫的次數不對：如果 <span> 和 <button> 都綁了 onClick，按鈕上的 click 會冒泡到 <span> 再觸發一次。要 inheritAttrs: false，只綁在 <button>').toHaveBeenCalledTimes(1)
  })
})
