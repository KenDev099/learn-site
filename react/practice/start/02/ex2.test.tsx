import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { format } from 'node:util'
import { Panel } from './Panel.tsx'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import { typecheck } from '../../helpers/typecheck.ts'

// React 的警告用 console.error 印出，而且同一種警告只印第一次，所以這個檢查一定要是檔案裡第一個測試
function reactWarnings(run: () => void): string[] {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  run()
  return spy.mock.calls.map(args => format(...args).split('\n')[0])
}
const body = (container: HTMLElement) => container.querySelector('section.panel > div.panel-body')

describe('練習 2：Panel 用 children 接收標籤中間的內容', () => {
  test('render 時 React 沒有印出警告', () => {
    const warnings = reactWarnings(() => {
      render(<Panel title="咖啡" footer={<button type="button">看全部</button>}><p>拿鐵</p><p>美式咖啡</p></Panel>)
    })
    expect(warnings, 'React 印出了警告，看訊息修').toEqual([])
  })

  test('<h2> 顯示 title，children 放在 <div className="panel-body"> 裡', () => {
    const { container } = render(<Panel title="咖啡"><p>拿鐵</p><p>美式咖啡</p></Panel>)
    expect(screen.getByRole('heading', { level: 2 }).textContent, '<h2> 要顯示傳進來的 title').toBe('咖啡')
    expect(body(container), '結構要是 <section className="panel"> 裡面有 <div className="panel-body">').not.toBeNull()
    expect([...body(container)!.children].map(el => `${el.localName}:${el.textContent}`), 'panel-body 裡要剛好是傳進來的兩個 <p>：在 <div className="panel-body"> 裡寫 {children}').toEqual(['p:拿鐵', 'p:美式咖啡'])
  })

  test('換一組 title 和 children：內容不能寫死，children 也可以是文字和數字', () => {
    const { container } = render(<Panel title="茶">伯爵紅茶 ${90}</Panel>)
    expect(screen.getByRole('heading', { level: 2 }).textContent, '<h2> 要顯示傳進來的 title').toBe('茶')
    expect(body(container)?.textContent, 'panel-body 的內容要是傳進來的 children（這次是文字「伯爵紅茶 $」加數字 90）').toBe('伯爵紅茶 $90')
  })

  test('children 可以是 map 出來的一串元素', () => {
    const { container } = render(
      <Panel title="全部商品">
        <ul>{PRODUCTS.map(p => <li key={p.id}>{p.name}</li>)}</ul>
      </Panel>,
    )
    const items = within(body(container) as HTMLElement).getAllByRole('listitem').map(li => li.textContent)
    expect(items, 'panel-body 裡要有 6 個商品').toEqual(PRODUCTS.map(p => p.name))
  })

  test('沒傳 footer 就沒有 <footer> 元素', () => {
    const { container } = render(<Panel title="咖啡"><p>拿鐵</p></Panel>)
    expect(container.querySelector('footer'), '沒傳 footer 時不能 render <footer>（空的也不行）：用條件決定要不要 render').toBeNull()
  })

  test('有傳 footer：<footer> 在 panel-body 後面，裡面是傳進來的內容', () => {
    const { container } = render(<Panel title="咖啡" footer={<button type="button">看全部</button>}><p>拿鐵</p></Panel>)
    const section = container.querySelector('section.panel')!
    expect([...section.children].map(el => el.localName), '<section> 的子元素依序是 h2、div（panel-body）、footer').toEqual(['h2', 'div', 'footer'])
    expect(within(section.querySelector('footer')!).getByRole('button', { name: '看全部' }), 'footer 傳進來的按鈕要在 <footer> 裡').toBeInTheDocument()
    expect(body(container)?.textContent, 'footer 的內容不能跑進 panel-body').toBe('拿鐵')
  })

  test('props 的型別：title 是 string、children 必填、footer 可省略', () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex2.usage.tsx': `
import { Panel } from './Panel.tsx'

export const ok1 = <Panel title="咖啡"><p>拿鐵</p><p>美式咖啡</p></Panel>
export const ok2 = <Panel title="茶" footer={<button type="button">看全部</button>}>伯爵紅茶 {90} 元</Panel>
export const ok3 = <Panel title="點心" footer="共 2 項">{['可頌', '起司蛋糕'].map(name => <p key={name}>{name}</p>)}</Panel>
// @ts-expect-error 少了 title
export const bad1 = <Panel><p>拿鐵</p></Panel>
// @ts-expect-error title 要是 string
export const bad2 = <Panel title={110}><p>拿鐵</p></Panel>
// @ts-expect-error children 必填：沒有內容的 Panel 沒有意義
export const bad3 = <Panel title="咖啡" />
`,
    })
    expect(errors, '型別檢查沒過。Panel.tsx 自己有型別錯誤就照訊息修；「Unused \'@ts-expect-error\' directive」表示該報錯的用法沒有報錯：props 要宣告成 { title: string; children: ReactNode; footer?: ReactNode }（ReactNode 從 react 匯入型別），不能用 any').toBe('')
  }, 30_000)
})
