import { describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import CouponField from './CouponField.vue'

describe('練習 3：輸入框出現後自動聚焦', () => {
  test('按下按鈕前沒有輸入框（仍然用 v-if）', () => {
    const wrapper = mount(CouponField, { attachTo: document.body })
    expect(wrapper.find('input').exists(), '按下按鈕前不能有輸入框：題目要求用 v-if，不要改成 v-show').toBe(false)
  })

  test('按下按鈕、等一輪 DOM 更新後，焦點在輸入框上', async () => {
    // 假計時器：setTimeout 不會自己執行，所以「用 setTimeout 等一下再 focus」在這裡不會成功
    vi.useFakeTimers()
    const wrapper = mount(CouponField, { attachTo: document.body })
    await wrapper.get('button').trigger('click')
    await nextTick()
    const input = wrapper.find('input')
    expect(input.exists(), '按下按鈕後要出現輸入框').toBe(true)
    expect(document.activeElement === input.element,
      '焦點不在輸入框上：同步呼叫 focus() 時輸入框還不存在；用 setTimeout 也不對（時間是猜的）。先 await nextTick()，等 DOM 更新完再 focus').toBe(true)
  })

  test('可以直接輸入優惠碼', async () => {
    const wrapper = mount(CouponField, { attachTo: document.body })
    await wrapper.get('button').trigger('click')
    await wrapper.get('input').setValue('LATTE10')
    expect((wrapper.get('input').element as HTMLInputElement).value, '按下按鈕後要能在輸入框輸入優惠碼').toBe('LATTE10')
  })
})
