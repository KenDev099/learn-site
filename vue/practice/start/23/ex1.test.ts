import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { countUpdates } from '../../helpers/count-updates.ts'
import { CUSTOMERS } from '../../helpers/fake-api.ts'
import OrderBoard from './OrderBoard.vue'
import type { Order } from './order.ts'

const orders: Order[] = Array.from({ length: 200 }, (_, i) => ({
  id: 1001 + i,
  customer: CUSTOMERS[i % CUSTOMERS.length]!.name,
  total: 80 + (i % 5) * 10,
}))

function setup() {
  const counter = countUpdates()
  const wrapper = mount(OrderBoard, { props: { orders }, global: { mixins: [counter.mixin] } })
  return { counter, wrapper }
}
const selectedIds = (wrapper: ReturnType<typeof setup>['wrapper']) =>
  wrapper.findAll('li[aria-selected="true"]').map(li => li.text())

describe('練習 1：選一列時只更新狀態改變的列', () => {
  test('每一筆訂單都是一個 OrderRow', () => {
    const { counter, wrapper } = setup()
    expect(counter.mounted('OrderRow'), '要掛載 200 個 OrderRow：不要改名或把它拆掉，要讓元件本身不必要的更新消失').toBe(200)
    expect(wrapper.findAll('li').length, '畫面上要有 200 列').toBe(200)
    expect(wrapper.findAll('li[aria-selected="false"]').length, '一開始沒有選取任何一列，每列都是 aria-selected="false"').toBe(200)
  })

  test('選取與切換選取時，畫面正確', async () => {
    const { wrapper } = setup()
    await wrapper.findAll('li button')[4]!.trigger('click')
    expect(selectedIds(wrapper), '點第 5 列後，只有它是 aria-selected="true"').toEqual([expect.stringContaining('#1005')])
    await wrapper.findAll('li button')[150]!.trigger('click')
    expect(selectedIds(wrapper), '再點第 151 列，選取要移過去，第 5 列要變回 false（v-memo 的依賴要包含會影響畫面的值）').toEqual([expect.stringContaining('#1151')])
    await wrapper.findAll('li button')[4]!.trigger('click')
    expect(selectedIds(wrapper), '點回第 5 列').toEqual([expect.stringContaining('#1005')])
  })

  test('切換選取時，OrderRow 最多更新 2 次', async () => {
    const { counter, wrapper } = setup()
    await wrapper.findAll('li button')[4]!.trigger('click')
    expect(counter.updated('OrderRow'), '第一次選取只有 1 列的狀態改變，OrderRow 最多更新 1 次；現在每一列都收到改變了的 props').toBeLessThanOrEqual(1)
    counter.reset()
    await wrapper.findAll('li button')[150]!.trigger('click')
    expect(counter.updated('OrderRow'), '換選另一列時只有 2 列改變，OrderRow 最多更新 2 次：傳給子元件「它自己是不是被選取」，而不是整個 selectedId').toBeLessThanOrEqual(2)
    expect(counter.updated('OrderRow'), '被選取和取消選取的那兩列要更新').toBe(2)
  })
})
