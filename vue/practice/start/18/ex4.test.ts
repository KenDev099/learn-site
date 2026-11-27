import { describe, expect, test } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import { hydrate, serverRender } from '../../helpers/ssr.ts'
import OrderItemsField, { type OrderLine } from './OrderItemsField.vue'

const LINES: OrderLine[] = [
  { id: 'a', productId: 1, quantity: 1 },
  { id: 'b', productId: 2, quantity: 2 },
  { id: 'c', productId: 5, quantity: 3 },
]

function setup(lines: OrderLine[] = LINES) {
  let n = 0
  const wrapper: VueWrapper = mount(OrderItemsField, {
    attachTo: document.body,
    props: {
      products: PRODUCTS,
      newId: () => `new-${++n}`,
      modelValue: deepFreeze(structuredClone(lines)),
      'onUpdate:modelValue': (value: OrderLine[]) => wrapper.setProps({ modelValue: value }),
    },
  })
  return wrapper
}

const rows = (w: VueWrapper) => w.findAll('li.line')
const model = (w: VueWrapper) => (w.props() as { modelValue: OrderLine[] }).modelValue

async function act(what: string, fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (e) {
    throw new Error(`${what}時丟出錯誤（${(e as Error).message}）：不要直接改 model 的陣列或物件，要指定新陣列給 model.value`)
  }
}

describe('練習 4：OrderItemsField 的穩定 key 與 useId', () => {
  test('刪除第一列：第二列還是同一個 DOM 元素，備註還在', async () => {
    const wrapper = setup()
    const second = rows(wrapper)[1]
    await second.get('input.note').setValue('少冰')
    const secondEl = second.element

    await act('刪除', () => rows(wrapper)[0].get('button.remove').trigger('click'))

    expect(model(wrapper).map(l => l.id), '刪除第一列後，model 要剩 b、c').toEqual(['b', 'c'])
    expect(rows(wrapper).length).toBe(2)
    expect(rows(wrapper)[0].element, '原本的第二列被換成別的元素：key 要用 line.id，不要用 index').toBe(secondEl)
    expect((rows(wrapper)[0].get('input.note').element as HTMLInputElement).value, '「少冰」不見了或跑到別列：key 要用 line.id').toBe('少冰')
    expect((rows(wrapper)[1].get('input.note').element as HTMLInputElement).value, '第三列（可頌）的備註要是空的').toBe('')
    expect((rows(wrapper)[0].get('input.quantity').element as HTMLInputElement).value, '拿鐵的數量要是 2').toBe('2')
  })

  test('每個輸入框的 id 在整頁唯一，而且有對應的 label', async () => {
    // 同一個 app 裡放兩個元件、而且明細的 id 相同：只用 line.id 組 id 會重複，要加上 useId() 的前綴
    mount({
      components: { OrderItemsField },
      setup: () => ({ products: PRODUCTS, lines: LINES, newId: () => 'x' }),
      template: `
        <OrderItemsField :model-value="lines" :products="products" :new-id="newId" />
        <OrderItemsField :model-value="lines" :products="products" :new-id="newId" />`,
    }, { attachTo: document.body })
    const controls = [...document.querySelectorAll<HTMLElement>('select.product, input.quantity, input.note')]
    expect(controls.length).toBe(18)
    const ids = controls.map(el => el.id)
    expect(ids.every(id => id !== ''), '每個選單與輸入框都要有 id').toBe(true)
    expect(new Set(ids).size, `有重複的 id（${ids.join(', ')}）：用 useId() 當前綴，再接 line.id 與欄位名稱`).toBe(ids.length)
    for (const el of controls) {
      const labels = document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`)
      expect(labels.length, `id="${el.id}" 沒有對應的 <label for>，或有好幾個 label 指向它`).toBe(1)
    }
  })

  test('改數量與品項：父元件拿到新陣列，原資料不被修改', async () => {
    const wrapper = setup()
    const original = model(wrapper)
    await act('改數量', () => rows(wrapper)[1].get('input.quantity').setValue('5'))
    await act('改品項', () => rows(wrapper)[0].get('select.product').setValue('6'))
    expect(model(wrapper), '數量要是數字 5、品項要是 6，其他列不變').toEqual([
      { id: 'a', productId: 6, quantity: 1 },
      { id: 'b', productId: 2, quantity: 5 },
      { id: 'c', productId: 5, quantity: 3 },
    ])
    expect(original[1].quantity, '原本的物件被改了').toBe(2)
  })

  test('新增一項：加在最後，用 newId() 產生 id，預設第一個商品、數量 1', async () => {
    const wrapper = setup()
    await rows(wrapper)[2].get('input.note').setValue('加熱')
    const lastEl = rows(wrapper)[2].element
    await act('新增', () => wrapper.get('button.add').trigger('click'))
    expect(model(wrapper).at(-1), '新的一列要是 { id: newId(), productId: 1, quantity: 1 }').toEqual({ id: 'new-1', productId: 1, quantity: 1 })
    expect(rows(wrapper).length, '畫面上要多一列').toBe(4)
    expect(rows(wrapper)[2].element, '新增後，原本的列要保留').toBe(lastEl)
    expect((rows(wrapper)[2].get('input.note').element as HTMLInputElement).value).toBe('加熱')
    await act('再新增', () => wrapper.get('button.add').trigger('click'))
    expect(model(wrapper).map(l => l.id), '每次新增都要呼叫 newId()').toEqual(['a', 'b', 'c', 'new-1', 'new-2'])

    // 商品清單的第一個不一定是 id 1
    const other: VueWrapper = mount(OrderItemsField, {
      props: { products: PRODUCTS.slice(3), newId: () => 'z', modelValue: [], 'onUpdate:modelValue': (value: OrderLine[]) => other.setProps({ modelValue: value }) },
    })
    await act('新增', () => other.get('button.add').trigger('click'))
    expect((other.props() as { modelValue: OrderLine[] }).modelValue, '預設品項要是 props.products 的第一個（這裡是 id 4），不要寫死 1').toEqual([{ id: 'z', productId: 4, quantity: 1 }])
  })

  test('伺服器渲染和瀏覽器產生的 id 一樣（useId）', async () => {
    // Math.random()、crypto.randomUUID() 或模組層級的計數器，伺服器和瀏覽器會算出不同的 id，hydration 時 label 對不上
    const props = { products: PRODUCTS, newId: () => 'x', modelValue: LINES }
    const html = await serverRender(OrderItemsField, props)
    const { app, warnings } = hydrate(html, OrderItemsField, props)
    app.unmount()
    expect(warnings.filter(w => /mismatch/i.test(w)), '伺服器渲染的 id 和瀏覽器的不同：前綴要用 useId()，不要用亂數或自己的計數器').toEqual([])
  })
})
