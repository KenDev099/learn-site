import { describe, expect, test } from 'vitest'
import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useNewOrderNotice, type Order } from './ex4.ts'

// header：列表最上面多一個固定的標題列，DOM 的子元素數量就會比 orders 多 1
// note：每筆訂單多一列備註，一筆訂單佔兩個 <li>
const makeList = (header = false, note = false) => defineComponent({
  setup() {
    const list = ref<HTMLElement | null>(null)
    const orders = ref<Order[]>([])
    const seen = useNewOrderNotice(list, orders)
    return { list, orders, seen }
  },
  template: `<ul ref="list">${header ? '<li>今日訂單</li>' : ''}${note
    ? '<template v-for="o in orders" :key="o.id"><li>{{ o.item }}</li><li>少冰</li></template>'
    : '<li v-for="o in orders" :key="o.id">{{ o.item }}</li>'}</ul>`,
})

// 每一步之後用 flushPromises 等：DOM 更新和 callback 裡 await 的 Promise 都會跑完
function setup(header = false, note = false) {
  const wrapper = mount(makeList(header, note))
  const vm = wrapper.vm as unknown as { orders: Order[]; seen: number[] }
  return { wrapper, vm }
}

describe('練習 4：在 DOM 更新之後讀列表', () => {
  test('連續新增 3 筆，記到 1、2、3', async () => {
    const { vm } = setup()
    for (const [id, item] of [[1, '拿鐵'], [2, '可頌'], [3, '美式咖啡']] as const) {
      vm.orders.push({ id, item })
      await flushPromises()
    }
    expect(vm.seen,
      '記到的數量不對：[] 表示 watch 沒觸發（ref 陣列 push 不會觸發 watch(orders)，要看 orders.value.length）；0、1、2 表示讀到舊 DOM，預設的 flush 在 DOM 更新前執行，要用 flush: \'post\'').toEqual([1, 2, 3])
  })

  test('同一段同步程式新增多筆只記一次，而且是更新後的數量', async () => {
    const { vm } = setup()
    vm.orders.push({ id: 1, item: '拿鐵' })
    vm.orders.push({ id: 2, item: '可頌' })
    vm.orders.push({ id: 3, item: '伯爵紅茶' })
    await flushPromises()
    expect(vm.seen,
      '一次新增 3 筆應該只記一次 3：flush: \'sync\' 每次 push 都立刻執行（還沒批次、DOM 也還沒更新）').toEqual([3])
  })

  test('記的是列表裡實際的元素數量，不是 orders 的筆數', async () => {
    const { vm } = setup(true)
    vm.orders.push({ id: 1, item: '拿鐵' })
    await flushPromises()
    vm.orders.push({ id: 2, item: '可頌' })
    await flushPromises()
    expect(vm.seen,
      '這個列表多一列標題，應該記到 2、3：要讀 listEl.value.children.length（更新後的 DOM），不是 orders.value.length').toEqual([2, 3])
  })

  test('讀的是更新後的 DOM，不是用舊 DOM 加上新增筆數推算', async () => {
    const { vm } = setup(false, true)
    vm.orders.push({ id: 1, item: '拿鐵' })
    await flushPromises()
    vm.orders.push({ id: 2, item: '可頌' })
    await flushPromises()
    expect(vm.seen,
      '這個列表每筆訂單佔兩列，應該記到 2、4：不要用舊 DOM 的數量加上新增筆數推算，要等 DOM 更新後（flush: \'post\'）直接讀 listEl.value.children.length').toEqual([2, 4])
  })

  test('刪掉訂單時不記', async () => {
    const { vm } = setup()
    vm.orders.push({ id: 1, item: '拿鐵' }, { id: 2, item: '可頌' })
    await flushPromises()
    vm.orders.splice(0, 1)
    await flushPromises()
    expect(vm.seen, '筆數變少時不要記：比較新舊筆數，只有變多才 push').toEqual([2])
  })
})
