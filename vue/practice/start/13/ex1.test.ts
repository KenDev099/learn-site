import { describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, getCurrentInstance, h, isReadonly, isRef, nextTick, type Component } from 'vue'
import { provideCurrentStore, useCurrentStore } from './current-store.ts'

type Ctx = ReturnType<typeof useCurrentStore>

// App（提供者）→ Layout → Section → PriceTag（第 3 層）；中間兩層完全不知道門市
function buildTree(initialId: number, leaves: Component[]) {
  const seen: { provider?: Ctx; keys?: PropertyKey[] } = {}
  const Section = defineComponent({ setup: () => () => h('section', leaves.map(c => h(c))) })
  const Layout = defineComponent({ setup: () => () => h('main', [h(Section)]) })
  const App = defineComponent({
    setup() {
      seen.provider = provideCurrentStore(initialId) as Ctx
      // 提供者這一層自己 provide 的 key（Vue 把它們存在元件實例的 provides 物件上）
      seen.keys = Reflect.ownKeys((getCurrentInstance() as unknown as { provides: object }).provides)
      return () => h(Layout)
    },
  })
  return { App, seen }
}

function leaf(name: string, onSetup?: (ctx: Ctx) => void) {
  return defineComponent({
    name,
    setup() {
      const ctx = useCurrentStore()
      onSetup?.(ctx)
      return () => h('p', { class: name }, ctx.store.value.name)
    },
  })
}

describe('練習 1：provideCurrentStore／useCurrentStore', () => {
  test('第 3 層的子元件讀得到提供者的門市', () => {
    for (const [id, name] of [[1, '總店'], [2, '分店']] as const) {
      const { App } = buildTree(id, [leaf('PriceTag')])
      const wrapper = mount(App)
      expect(wrapper.get('.PriceTag').text(), `provideCurrentStore(${id}) 之下，useCurrentStore().store.value.name 要是「${name}」`).toBe(name)
      wrapper.unmount()
    }
  })

  test('用 InjectionKey（Symbol）當 key，不用字串', () => {
    const { App, seen } = buildTree(1, [leaf('PriceTag')])
    mount(App)
    expect(seen.keys?.filter(k => typeof k === 'string'), 'provide 的 key 不要用字串（會撞名、沒有型別）：宣告 const KEY: InjectionKey<…> = Symbol(…)').toEqual([])
    expect(seen.keys?.filter(k => typeof k === 'symbol').length, 'provideCurrentStore 要用一個 Symbol（InjectionKey）provide').toBeGreaterThan(0)
  })

  test('兩個提供者各管自己的子樹，互不影響', async () => {
    const a = mount(buildTree(1, [leaf('PriceTag')]).App)
    const b = mount(buildTree(2, [leaf('PriceTag')]).App)
    await nextTick()
    expect(a.get('.PriceTag').text(), '兩棵樹同時存在時，provideCurrentStore(1) 底下要顯示「總店」：不要把門市存在模組層級的變數').toBe('總店')
    expect(b.get('.PriceTag').text(), 'provideCurrentStore(2) 底下要顯示「分店」').toBe('分店')
  })

  test('沒有提供者時丟出指定的錯誤，而且 Vue 沒有先印出 injection not found 警告', () => {
    const warnings: string[] = []
    const Orphan = leaf('Orphan')
    expect(() => mount(Orphan, { global: { config: { warnHandler: m => { warnings.push(m) } } } }),
      '找不到提供者時要 throw new Error(\'useCurrentStore() 必須在 provideCurrentStore() 之下使用\')，不要回傳 undefined')
      .toThrow('useCurrentStore() 必須在 provideCurrentStore() 之下使用')
    expect(warnings.filter(w => w.includes('not found')), 'inject 要給預設值（例如 inject(KEY, null)），沒有提供者時 Vue 就不會警告，改由你丟出的錯誤說明').toEqual([])
  })

  test('store 是唯讀的 ref，子元件改不動', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})   // 唯讀寫入的警告是預期的，不印出來
    let child: Ctx | undefined
    const { App } = buildTree(1, [leaf('PriceTag', ctx => { child = ctx })])
    const wrapper = mount(App)
    expect(isRef(child!.store), 'store 要是 ref（例如 readonly(ref(...))），後代才拿得到最新的值').toBe(true)
    expect(isReadonly(child!.store), 'provide 出去的 store 要用 readonly() 包起來：修改只能透過 switchStore').toBe(true)
    ;(child!.store as { value: unknown }).value = { id: 2, name: '分店' }
    ;(child!.store.value as { name: string }).name = '分店'
    await nextTick()
    expect(wrapper.get('.PriceTag').text(), '子元件直接改 store（或 store.value.name）不能生效：用 readonly 包住整個 ref').toBe('總店')
  })

  test('switchStore 之後，所有子元件都更新', async () => {
    let child: Ctx | undefined
    const { App, seen } = buildTree(1, [leaf('PriceTag', ctx => { child = ctx }), leaf('OrderHeader')])
    const wrapper = mount(App)
    child!.switchStore(2)
    await nextTick()
    expect(wrapper.get('.PriceTag').text(), 'switchStore(2) 之後 PriceTag 要顯示「分店」：provide 的要是 ref，不能是普通物件').toBe('分店')
    expect(wrapper.get('.OrderHeader').text(), 'switchStore(2) 之後，另一個子元件 OrderHeader 也要顯示「分店」').toBe('分店')
    expect(seen.provider?.store.value.name, 'provideCurrentStore() 要回傳同一份 { store, switchStore }，提供者自己也看得到最新門市').toBe('分店')
    seen.provider!.switchStore(1)
    await nextTick()
    expect(wrapper.get('.OrderHeader').text(), '提供者呼叫 switchStore(1) 也要讓子元件更新').toBe('總店')
  })

  test('switchStore 給不存在的門市 id 時丟出錯誤，門市不變', () => {
    let child: Ctx | undefined
    const { App } = buildTree(1, [leaf('PriceTag', ctx => { child = ctx })])
    mount(App)
    expect(() => child!.switchStore(99), 'switchStore(99) 找不到門市要丟出 Error').toThrow()
    expect(child!.store.value.name, '丟錯之後門市要維持原本的「總店」').toBe('總店')
  })
})
