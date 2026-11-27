import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Card } from './Card.tsx'

describe('練習 1：Card 用 children 與 ReactNode props 當插槽', () => {
  test('children 放在 .body 裡，裡面的按鈕照常運作', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    const { container } = render(
      <Card title="購物車">
        <ul>
          <li>拿鐵 × 2</li>
          <li>可頌 × 1 <button onClick={onRemove}>移除可頌</button></li>
        </ul>
      </Card>,
    )
    const body = container.querySelector('.body')
    expect(body, '要有 <div className="body">').not.toBeNull()
    expect(within(body as HTMLElement).queryAllByRole('listitem'), '寫在 <Card>…</Card> 中間的內容會變成 children 這個 prop：把 {children} 放進 .body').toHaveLength(2)
    await user.click(screen.getByRole('button', { name: '移除可頌' }))
    expect(onRemove, 'children 裡的事件處理函式要照常運作').toHaveBeenCalledTimes(1)
  })

  test('title 可以是 JSX，放在 <h3> 裡', () => {
    render(<Card title={<>購物車 <em>外帶</em></>}>內容</Card>)
    const heading = screen.getByRole('heading', { level: 3 })
    expect(heading, 'title 的型別要是 ReactNode，直接寫 {title}：不要用樣板字串或 String() 轉成字串').toHaveTextContent('購物車 外帶')
    expect(heading.querySelector('em'), 'title 傳進來的 <em> 要原樣出現在 <h3> 裡').toHaveTextContent('外帶')
  })

  test('footer 有傳才 render <footer>，內容放在裡面', async () => {
    const user = userEvent.setup()
    const onPay = vi.fn()
    const { container } = render(<Card title="購物車" footer={<button onClick={onPay}>結帳</button>}>內容</Card>)
    const footer = container.querySelector('footer')
    expect(footer, '有傳 footer 時要 render <footer>').not.toBeNull()
    expect(within(footer as HTMLElement).getByRole('button', { name: '結帳' })).toBeInTheDocument()
    expect(container.querySelector('.body'), 'footer 的內容不能跑到 .body 裡').not.toHaveTextContent('結帳')
    await user.click(screen.getByRole('button', { name: '結帳' }))
    expect(onPay).toHaveBeenCalledTimes(1)
  })

  test('沒傳 footer 時，整個 <footer> 都不出現', () => {
    const { container } = render(<Card title="菜單">內容</Card>)
    expect(container.querySelector('footer'), '沒傳 footer（undefined）時不要 render <footer>：空的 <footer> 會留下多餘的邊框與間距').toBeNull()
    expect(container.querySelector('.card'), '根元素是 <section className="card">').toHaveTextContent(/^菜單內容$/)
  })

  test('badge 有傳才 render .badge，放在 <header> 裡', () => {
    const { container, rerender } = render(<Card title="購物車" badge={<strong>3</strong>}>內容</Card>)
    const badge = container.querySelector('header .badge')
    expect(badge, '有傳 badge 時，<header> 裡要有 <span className="badge">').not.toBeNull()
    expect(badge?.querySelector('strong')).toHaveTextContent('3')
    rerender(<Card title="購物車">內容</Card>)
    expect(container.querySelector('.badge'), '沒傳 badge 時不能有 .badge').toBeNull()
    rerender(<Card title="購物車" badge={null}>內容</Card>)
    expect(container.querySelector('.badge'), 'badge={null} 也算沒傳').toBeNull()
  })

  test('badge={0} 要顯示在 .badge 裡', () => {
    const { container } = render(<Card title="購物車" badge={0}>內容</Card>)
    expect(container.querySelector('header .badge'), 'badge={0} 是「有傳」：用 badge != null 判斷，不要用 badge && …（0 是 falsy，第 2 課的陷阱）').toHaveTextContent(/^0$/)
    expect(container.querySelector('header'), '<header> 裡只能有標題和 .badge：0 不能直接印在 .badge 外面').toHaveTextContent(/^購物車0$/)
    expect(container.querySelector('h3')).toHaveTextContent(/^購物車$/)
  })
})
