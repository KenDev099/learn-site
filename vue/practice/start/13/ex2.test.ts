import { describe, expect, test } from 'vitest'
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import Tabs from './Tabs.vue'
import Tab from './Tab.vue'

async function render(template: string, setup: () => Record<string, unknown> = () => ({})) {
  const warnings: string[] = []
  const wrapper = mount(defineComponent({ components: { Tabs, Tab }, setup, template }), {
    attachTo: document.body,
    global: { config: { warnHandler: m => { warnings.push(m) } } },
  })
  await flushPromises()
  return { wrapper, warnings }
}

const COUNTER = `<Tabs>
  <Tab title="菜單"><p>今日菜單</p></Tab>
  <Tab title="訂單"><p>待處理訂單</p></Tab>
  <Tab title="會員"><p>會員查詢</p></Tab>
</Tabs>`

const tabsOf = (w: VueWrapper) => w.findAll('[role="tablist"] [role="tab"]')
const titles = (w: VueWrapper) => tabsOf(w).map(t => t.text())
const selected = (w: VueWrapper) => tabsOf(w).filter(t => t.attributes('aria-selected') === 'true').map(t => t.text())
const visiblePanels = (w: VueWrapper) => w.findAll('[role="tabpanel"]')
  .filter(p => !(p.element as HTMLElement).hidden && (p.element as HTMLElement).style.display !== 'none')
  .map(p => p.text())

function expectSelected(w: VueWrapper, title: string, panel: string, how: string) {
  expect(selected(w), `${how}：只有「${title}」的按鈕 aria-selected="true"，其他要是 "false"`).toEqual([title])
  expect(visiblePanels(w), `${how}：只看得到「${title}」的面板（${panel}），其他面板要用 v-if、v-show 或 hidden 藏起來`).toEqual([panel])
}

async function key(tab: DOMWrapper<Element>, name: string) {
  await tab.trigger('keydown', { key: name })
  await flushPromises()
}

describe('練習 2：Tabs／Tab 複合元件', () => {
  test('依照 Tab 畫出 tablist 與 tab 按鈕，預設選取第一個', async () => {
    const { wrapper, warnings } = await render(COUNTER)
    expect(wrapper.findAll('[role="tablist"]').length, 'Tabs 要畫出一個 role="tablist" 的容器').toBe(1)
    expect(titles(wrapper), 'tablist 裡每個 Tab 一個 role="tab" 的按鈕，文字是 title，順序和 Tab 一樣').toEqual(['菜單', '訂單', '會員'])
    expect(tabsOf(wrapper).map(t => t.attributes('aria-selected')), '每個 tab 都要有 aria-selected：目前的是 "true"，其他是 "false"').toEqual(['true', 'false', 'false'])
    expectSelected(wrapper, '菜單', '今日菜單', '一開始')
    expect(tabsOf(wrapper).map(t => t.attributes('tabindex')), '目前的 tab tabindex="0"，其他 tabindex="-1"（Tab 鍵只停在目前的分頁）').toEqual(['0', '-1', '-1'])
    expect(warnings, '不能有 Vue 警告').toEqual([])
  })

  test('tab 與面板用 id 互相指向', async () => {
    const { wrapper } = await render(COUNTER)
    const tab = tabsOf(wrapper)[0]!
    const panel = wrapper.get('[role="tabpanel"]')
    expect(tab.attributes('aria-controls'), 'tab 的 aria-controls 要等於面板的 id').toBe(panel.attributes('id'))
    expect(panel.attributes('aria-labelledby'), '面板的 aria-labelledby 要等於 tab 的 id').toBe(tab.attributes('id'))
    expect(new Set(tabsOf(wrapper).map(t => t.attributes('id'))).size, '每個 tab 的 id 都要不一樣（用 useId()）').toBe(3)
  })

  test('同一頁有兩組標題相同的 Tabs，id 也不重複', async () => {
    const { wrapper } = await render(`<div>${COUNTER}${COUNTER}</div>`)
    const ids = tabsOf(wrapper).map(t => t.attributes('id'))
    expect(ids.length, '兩組 Tabs 要各畫出 3 個 tab').toBe(6)
    expect(new Set(ids).size, '兩組標題一樣的 Tabs，6 個 tab 的 id 都要不同：id 用 useId() 產生，不要用 title 或索引組出來').toBe(6)
  })

  test('點按鈕切換，所有分頁同步', async () => {
    const { wrapper } = await render(COUNTER)
    await tabsOf(wrapper)[1]!.trigger('click')
    expectSelected(wrapper, '訂單', '待處理訂單', '點「訂單」之後')
    await tabsOf(wrapper)[2]!.trigger('click')
    expectSelected(wrapper, '會員', '會員查詢', '再點「會員」之後（選取狀態要放在 Tabs，不能每個 Tab 各記各的）')
    expect(tabsOf(wrapper).map(t => t.attributes('tabindex')), '切換後 tabindex 也要跟著換').toEqual(['-1', '-1', '0'])
  })

  test('左右鍵切換分頁、頭尾相接，焦點跟著移動', async () => {
    const { wrapper } = await render(COUNTER)
    const tabs = tabsOf(wrapper)
    ;(tabs[0]!.element as HTMLElement).focus()
    await key(tabs[0]!, 'ArrowRight')
    expectSelected(wrapper, '訂單', '待處理訂單', '在「菜單」按 ArrowRight 之後')
    expect(document.activeElement, '按方向鍵之後，焦點要移到新選取的 tab 按鈕').toBe(tabsOf(wrapper)[1]!.element)
    await key(tabsOf(wrapper)[1]!, 'ArrowLeft')
    expectSelected(wrapper, '菜單', '今日菜單', '在「訂單」按 ArrowLeft 之後')
    await key(tabsOf(wrapper)[0]!, 'ArrowLeft')
    expectSelected(wrapper, '會員', '會員查詢', '在第一個「菜單」按 ArrowLeft 要繞到最後一個「會員」')
    expect(document.activeElement, '繞到最後一個時焦點也要移過去').toBe(tabsOf(wrapper)[2]!.element)
    await key(tabsOf(wrapper)[2]!, 'ArrowRight')
    expectSelected(wrapper, '菜單', '今日菜單', '在最後一個「會員」按 ArrowRight 要繞回第一個')
  })

  test('分頁數量由 Tab 決定，Tab 消失時取消註冊', async () => {
    const show = ref(true)
    const { wrapper } = await render(`<Tabs>
      <Tab title="飲料"><p>咖啡與茶</p></Tab>
      <Tab title="甜點"><p>蛋糕</p></Tab>
      <Tab v-if="show" title="輕食"><p>可頌</p></Tab>
    </Tabs>`, () => ({ show }))
    expect(titles(wrapper), '分頁的數量和文字要由 <Tab> 決定，不能寫死「菜單／訂單／會員」').toEqual(['飲料', '甜點', '輕食'])
    expectSelected(wrapper, '飲料', '咖啡與茶', '一開始')
    show.value = false
    await flushPromises()
    expect(titles(wrapper), '<Tab> 被 v-if 移除時要在 onUnmounted 取消註冊，按鈕跟著消失').toEqual(['飲料', '甜點'])
    await key(tabsOf(wrapper)[1]!, 'ArrowRight')
    expectSelected(wrapper, '飲料', '咖啡與茶', '只剩兩個分頁時，在「甜點」按 ArrowRight 要繞回「飲料」')
  })

  test('前面的 Tab 被移除時，選取的分頁不變', async () => {
    const show = ref(true)
    const { wrapper } = await render(`<Tabs>
      <Tab v-if="show" title="飲料"><p>咖啡與茶</p></Tab>
      <Tab title="甜點"><p>蛋糕</p></Tab>
      <Tab title="輕食"><p>可頌</p></Tab>
    </Tabs>`, () => ({ show }))
    await tabsOf(wrapper)[1]!.trigger('click')
    expectSelected(wrapper, '甜點', '蛋糕', '點「甜點」之後')
    show.value = false
    await flushPromises()
    expect(titles(wrapper), '「飲料」被 v-if 移除後只剩兩個按鈕').toEqual(['甜點', '輕食'])
    expectSelected(wrapper, '甜點', '蛋糕', '移除前面的「飲料」之後仍然選「甜點」：用分頁的 id 記錄選取，不要用索引')
  })
})
