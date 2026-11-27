import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import QuantityInput from './QuantityInput.vue'

function mountParent(initial = 2) {
  const qty = ref<unknown>(initial)
  const wrapper = mount({ components: { QuantityInput }, setup: () => ({ qty }), template: '<QuantityInput v-model="qty" />' })
  const input = wrapper.get<HTMLInputElement>('input')
  // 模擬使用者打字：只觸發 input 事件，不觸發 change（失去焦點）
  async function type(text: string) {
    input.element.value = text
    await input.trigger('input')
    await nextTick()
  }
  return { qty, input, type }
}

describe('練習 2：用 set 轉換器限制數量', () => {
  test('輸入 5，父元件得到數字 5', async () => {
    const { qty, type } = mountParent()
    await type('5')
    expect(qty.value, '父元件沒有在輸入時更新：要用 defineModel，而且不要等 change／blur（不要用 .lazy）').not.toBe(2)
    expect(qty.value, '父元件拿到的不是數字 5：set 要回傳 number，不能回傳字串').toBe(5)
  })

  test('輸入 30，父元件得到 20', async () => {
    const { qty, type } = mountParent()
    await type('30')
    expect(qty.value, '超過 20 要變成 20：在 defineModel 的 set 裡用 Math.min 限制上限，而且回傳 number').toBe(20)
  })

  test('輸入 0、負數、非數字、空字串，父元件得到 1', async () => {
    const { qty, type } = mountParent()
    for (const text of ['0', '-5', 'abc', '']) {
      await type('7')
      await type(text)
      expect(qty.value, `輸入「${text}」時父元件要得到 1：不是有限數字或小於 1 都回傳 1`).toBe(1)
    }
  })

  test('小數無條件捨去', async () => {
    const { qty, type } = mountParent()
    await type('2.7')
    expect(qty.value, '輸入 2.7 要得到 2：用 Math.trunc 或 Math.floor').toBe(2)
  })

  test('父元件改值，輸入框跟著顯示', async () => {
    const { qty, input } = mountParent()
    qty.value = 9
    await nextTick()
    expect(input.element.value, '父元件改成 9，輸入框沒變：輸入框要綁 defineModel 回傳的 ref').toBe('9')
  })
})
