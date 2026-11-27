import { describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import { typecheck } from '../../helpers/typecheck.ts'
import ProductCard from './ProductCard.vue'

const latte = deepFreeze({ ...PRODUCTS[1] })

describe('練習 1：ProductCard 的 props 與 emits 有完整型別', () => {
  test('型別：正確用法通過，錯誤用法都要報錯', () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex1.usage.ts': [
        "import { h } from 'vue'",
        "import ProductCard from './ProductCard.vue'",
        "import type { Product } from '../../helpers/fake-api.ts'",
        'declare const latte: Product',
        'h(ProductCard, { product: latte })',
        'h(ProductCard, { product: latte, soldOut: true, onAdd: (id: number, qty: number) => console.log(id + qty) })',
        '// @ts-expect-error 價格是字串：product 要宣告成 Product',
        "h(ProductCard, { product: { ...latte, price: '110' } })",
        '// @ts-expect-error add 的參數是 number，不是 string',
        'h(ProductCard, { product: latte, onAdd: (id: string) => console.log(id) })',
        '// @ts-expect-error add 的第二個參數 qty 是 number',
        "h(ProductCard, { product: latte, onAdd: (id: number, qty: string) => console.log(id, qty) })",
        '// @ts-expect-error soldOut 是 boolean',
        "h(ProductCard, { product: latte, soldOut: 'yes' })",
        '// @ts-expect-error product 是必填',
        'h(ProductCard, {})',
        '',
      ].join('\n'),
    })
    expect(errors,
      '型別檢查沒過。TS2578（Unused @ts-expect-error）代表錯誤用法沒被擋下：props 要用 defineProps<{ product: Product; soldOut?: boolean }>()，' +
      'emits 要用 defineEmits<{ add: [id: number, qty: number] }>()，每個型別都要寫具體，不要用 any、Object 或 Record。其他錯誤是元件本身的型別問題：\n' + errors).toBe('')
  }, 30_000)

  test('按「加入」emit add(商品 id, 數量)', async () => {
    const onAdd = vi.fn()
    const wrapper = mount(ProductCard, { props: { product: latte, onAdd } })
    expect(wrapper.get('h3').text(), '<h3> 要顯示「品名 $價格」').toBe('拿鐵 $110')
    await wrapper.get('input').setValue(3)
    await wrapper.get('button').trigger('click')
    expect(onAdd, '按「加入」要 emit(\'add\', product.id, 數量)').toHaveBeenCalledWith(2, 3)
  })

  test('售完時按鈕 disabled，也不會 emit', async () => {
    const onAdd = vi.fn()
    const wrapper = mount(ProductCard, { props: { product: latte, soldOut: true, onAdd } })
    const button = wrapper.get('button')
    expect(button.attributes('disabled'), 'soldOut 為 true 時按鈕要 disabled').toBeDefined()
    button.element.disabled = false
    await button.trigger('click')
    expect(onAdd, 'soldOut 為 true 時處理函式也不能 emit').not.toHaveBeenCalled()
  })
})
