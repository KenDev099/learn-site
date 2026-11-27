import { describe, expect, test } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { countUpdates } from '../../helpers/count-updates.ts'
import { useRenderLog, type RenderLogEntry } from './useRenderLog.ts'
import CartBadge from './CartBadge.vue'

describe('練習 4：找出為什麼重新渲染', () => {
  test('useRenderLog 記下觸發的 key 與 type', async () => {
    const log: RenderLogEntry[] = []
    const state = reactive({ latte: 110, toppings: [] as string[], stock: new Map<string, number>() })
    mount(defineComponent({
      setup() {
        useRenderLog(log)
        return () => h('p', `${state.latte} ${state.toppings.join()} ${state.stock.size}`)
      },
    }))
    expect(log, '掛載時還沒有任何觸發，紀錄要是空的').toEqual([])
    state.latte = 120
    await nextTick()
    expect(log, '改 state.latte 要記成 { key: "latte", type: "set" }：用 onRenderTriggered 的 e.key 和 e.type').toEqual([{ key: 'latte', type: 'set' }])
    state.toppings.push('燕麥奶')
    await nextTick()
    expect(log.slice(1), 'push 一個元素是新增索引 0：{ key: "0", type: "add" }（key 要轉成字串）').toEqual([{ key: '0', type: 'add' }])
    state.stock.set('可頌', 3)
    await nextTick()
    expect(log.slice(2), 'Map 的 set 新增一個鍵：{ key: "可頌", type: "add" }').toEqual([{ key: '可頌', type: 'add' }])
  })

  test('每個元件各自記在自己的 log', async () => {
    const a: RenderLogEntry[] = [], b: RenderLogEntry[] = []
    const state = reactive({ x: 1, y: 1 })
    const make = (log: RenderLogEntry[], read: () => number) => defineComponent({
      setup() { useRenderLog(log); return () => h('span', String(read())) },
    })
    mount(make(a, () => state.x))
    mount(make(b, () => state.y))
    state.y = 2
    await nextTick()
    expect(a, '只讀 x 的元件沒有被觸發').toEqual([])
    expect(b).toEqual([{ key: 'y', type: 'set' }])
  })

  test('CartBadge 只在 count 改變時重新渲染', async () => {
    const counter = countUpdates()
    const cart = reactive({ count: 2, note: '', items: ['拿鐵', '可頌'] })
    const wrapper = mount(CartBadge, { props: { cart }, global: { mixins: [counter.mixin] } })
    expect(wrapper.find('.cart-badge').text()).toBe('2')
    expect(wrapper.find('.cart-badge').attributes('title'), 'title 是「購物車有 N 件」').toBe('購物車有 2 件')
    cart.note = '少冰'
    await nextTick()
    cart.note = '少冰，不要吸管'
    await nextTick()
    cart.items.push('美式咖啡')
    await nextTick()
    expect(counter.updated('CartBadge'), '改 note、items 時 CartBadge 不能重新渲染：範本裡有東西讀了整個 cart（用 useRenderLog 看看 key 是什麼）').toBe(0)
    cart.count = 3
    await nextTick()
    expect(counter.updated('CartBadge'), '改 count 時要重新渲染一次（不能用 v-once 讓它完全不更新）').toBe(1)
    expect(wrapper.find('.cart-badge').text(), '畫面要顯示新的數量').toBe('3')
    expect(wrapper.find('.cart-badge').attributes('title'), 'title 也要更新').toBe('購物車有 3 件')
  })
})
