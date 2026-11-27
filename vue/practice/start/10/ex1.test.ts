import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import SizePicker from './SizePicker.vue'

// 測試裡的父元件：跟真正的點餐頁一樣用 v-model
function mountParent(initial: 'S' | 'M' | 'L') {
  const size = ref(initial)
  const wrapper = mount({ components: { SizePicker }, setup: () => ({ size }), template: '<SizePicker v-model="size" />' })
  const radio = (v: string) => wrapper.get<HTMLInputElement>(`input[type="radio"][value="${v}"]`)
  return { wrapper, size, radio }
}

describe('練習 1：用 defineModel 讓 SizePicker 支援 v-model', () => {
  test('點 L 之後，父元件的 size 變成 L', async () => {
    const { size, radio } = mountParent('M')
    await radio('L').setValue(true)
    expect(size.value, '父元件的值沒變：不要用本地的 ref，改用 defineModel()，radio 的 v-model 綁到它').toBe('L')
  })

  test('一開始就選取父元件給的值', () => {
    const { radio } = mountParent('S')
    expect(radio('S').element.checked, '父元件給 S，S 卻沒有被選取：radio 要綁 defineModel 回傳的 ref').toBe(true)
  })

  test('父元件改值，被選取的 radio 跟著變', async () => {
    const { size, radio } = mountParent('M')
    size.value = 'L'
    await nextTick()
    expect(radio('L').element.checked, '父元件改成 L，畫面沒跟著變：子元件不能自己保存一份狀態').toBe(true)
    expect(radio('M').element.checked, 'M 還是被選取：子元件不能自己保存一份狀態').toBe(false)
  })

  test('送出的是 update:modelValue 事件', async () => {
    const wrapper = mount(SizePicker, { props: { modelValue: 'M' } })
    await wrapper.get('input[value="S"]').setValue(true)
    expect(wrapper.emitted('update:modelValue'), '沒有送出 update:modelValue：v-model 只聽這個事件，Vue 2 的 input、update:value 都不會被接收').toEqual([['S']])
  })

  test('model 是必填', () => {
    const props = (SizePicker as { props?: Record<string, { required?: boolean }> }).props
    expect(props?.modelValue?.required, 'modelValue 沒有設成必填：defineModel 要加 { required: true }，父元件忘了綁 v-model 時開發模式才會警告').toBe(true)
  })
})
