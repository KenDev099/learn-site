import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { Tabs } from './Tabs.tsx'

function MenuTabs({ defaultValue = 'coffee', tea = <p>伯爵紅茶 $90</p> }: { defaultValue?: string; tea?: ReactNode }) {
  return (
    <Tabs defaultValue={defaultValue}>
      <Tabs.List>
        <Tabs.Tab value="coffee">咖啡</Tabs.Tab>
        <Tabs.Tab value="tea">茶</Tabs.Tab>
        <Tabs.Tab value="food">點心</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="coffee"><p>拿鐵 $110</p></Tabs.Panel>
      <Tabs.Panel value="tea">{tea}</Tabs.Panel>
      <Tabs.Panel value="food"><p>可頌 $70</p></Tabs.Panel>
    </Tabs>
  )
}
const selected = (scope: HTMLElement = document.body) => within(scope).getAllByRole('tab').map(t => `${t.textContent}:${t.getAttribute('aria-selected')}`)

describe('練習 3：Tabs 用 context 讓 Tab 與 Panel 共用同一份 state', () => {
  test('一開始選中 defaultValue 的 Tab，只顯示它的 Panel', () => {
    render(<MenuTabs />)
    expect(within(screen.getByRole('tablist')).getAllByRole('tab'), 'Tabs.List 是 role="tablist"，裡面的 Tabs.Tab 是 role="tab"').toHaveLength(3)
    expect(selected(), '選中的 Tab 要 aria-selected="true"，其他 "false"：Tab 從 context 讀目前的值，跟自己的 value 比').toEqual(['咖啡:true', '茶:false', '點心:false'])
    const panels = screen.getAllByRole('tabpanel')
    expect(panels, 'value 不等於目前選中值的 Panel 要回傳 null').toHaveLength(1)
    expect(panels[0]).toHaveTextContent('拿鐵 $110')
  })

  test('defaultValue 是別的值時，選中的是那一個', () => {
    render(<MenuTabs defaultValue="food" />)
    expect(selected(), 'state 的初始值要用 defaultValue，不要寫死').toEqual(['咖啡:false', '茶:false', '點心:true'])
    expect(screen.getByRole('tabpanel')).toHaveTextContent('可頌 $70')
  })

  test('按 Tab 會切換選中的項目與 Panel', async () => {
    const user = userEvent.setup()
    render(<MenuTabs />)
    await user.click(screen.getByRole('tab', { name: '茶' }))
    expect(selected(), '按 Tab 要把它的 value 設成目前選中的值').toEqual(['咖啡:false', '茶:true', '點心:false'])
    expect(screen.getByRole('tabpanel')).toHaveTextContent('伯爵紅茶 $90')
    await user.click(screen.getByRole('tab', { name: '點心' }))
    await user.click(screen.getByRole('tab', { name: '咖啡' }))
    expect(selected()).toEqual(['咖啡:true', '茶:false', '點心:false'])
    expect(screen.getByRole('tabpanel')).toHaveTextContent('拿鐵 $110')
  })

  test('沒選中的 Panel 裡的元件不會被呼叫', async () => {
    const user = userEvent.setup()
    const called = vi.fn()
    function TeaList() { called(); return <p>伯爵紅茶 $90</p> }
    render(<MenuTabs tea={<TeaList />} />)
    expect(called, '沒選中的 Panel 要回傳 null，不是用 hidden 或 CSS 藏起來：這樣裡面的元件函式不會被呼叫').not.toHaveBeenCalled()
    await user.click(screen.getByRole('tab', { name: '茶' }))
    expect(called).toHaveBeenCalled()
  })

  test('Tab 與 Panel 外面多包幾層也能用', async () => {
    const user = userEvent.setup()
    function FoodSection() { return <section><Tabs.Panel value="food"><p>起司蛋糕 $120</p></Tabs.Panel></section> }
    render(
      <Tabs defaultValue="coffee">
        <nav>
          <Tabs.List>
            <span className="group"><Tabs.Tab value="coffee">咖啡</Tabs.Tab></span>
            <span className="group"><Tabs.Tab value="food">點心</Tabs.Tab></span>
          </Tabs.List>
        </nav>
        <main>
          <Tabs.Panel value="coffee"><p>美式咖啡 $80</p></Tabs.Panel>
          <FoodSection />
        </main>
      </Tabs>,
    )
    const hint = '中間多包了 <span>、<nav>、別的元件就壞掉：不要用 Children.map／cloneElement 傳 props，改用 context'
    expect(selected(), hint).toEqual(['咖啡:true', '點心:false'])
    expect(screen.getByRole('tabpanel'), hint).toHaveTextContent('美式咖啡 $80')
    await user.click(screen.getByRole('tab', { name: '點心' }))
    expect(selected(), hint).toEqual(['咖啡:false', '點心:true'])
    expect(screen.getByRole('tabpanel'), hint).toHaveTextContent('起司蛋糕 $120')
  })

  test('同一頁的兩個 <Tabs> 互不影響', async () => {
    const user = userEvent.setup()
    render(<><div data-testid="a"><MenuTabs /></div><div data-testid="b"><MenuTabs defaultValue="food" /></div></>)
    const a = screen.getByTestId('a'), b = screen.getByTestId('b')
    await user.click(within(a).getByRole('tab', { name: '茶' }))
    expect(selected(a)).toEqual(['咖啡:false', '茶:true', '點心:false'])
    expect(selected(b), '第二個 <Tabs> 被第一個影響了：state 要放在 Tabs 元件裡（useState），每個 <Tabs> 各自提供 context，不能放在模組層級的變數').toEqual(['咖啡:false', '茶:false', '點心:true'])
    expect(within(b).getByRole('tabpanel')).toHaveTextContent('可頌 $70')
  })

  test('Tab 或 Panel 沒有放在 <Tabs> 裡時丟出說明清楚的錯誤', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})   // React 會把 render 時的錯誤印出來，這裡不需要看
    const hint = '在 Tab 與 Panel 裡讀 context，讀到預設值（null）就 throw new Error，訊息提到 <Tabs>：比默默地沒反應好查'
    expect(() => render(<Tabs.Tab value="tea">茶</Tabs.Tab>), hint).toThrow(/<Tabs>/)
    expect(() => render(<Tabs.Panel value="tea">伯爵紅茶</Tabs.Panel>), hint).toThrow(/<Tabs>/)
  })
})
